/**
 * @file ai_input.h
 *
 * @brief Hourly windowing buffer for the on-device AQI model.
 *
 * The model was trained on 24 CONSECUTIVE HOURLY samples (1 row/hour) from a
 * reference air-quality station -- see `ungdungdidong/CLAUDE.md` mục 2 and
 * `ai/README.md`. Firmware polls the physical sensors every
 * `SA_SENSOR_POLLING_INTERVAL` seconds (default 5s), which is a completely
 * different cadence. Feeding 24 raw 5s samples straight into the model would
 * be ~2 minutes of near-constant readings -- nothing like the diurnal
 * variation the model actually learned on.
 *
 * This module bridges the gap: every sensor sample is folded into a running
 * mean for "the hour it belongs to" (by wall-clock hour, using the same
 * epoch-seconds/3600 bucketing the training pipeline's hourly station data
 * implies); when the wall clock rolls into a new hour, the finished hourly
 * mean is pushed into a 24-slot ring buffer and a fresh accumulator starts.
 *
 * Deliberately plain C99 (`<stdint.h>`/`<stdbool.h>`/`<time.h>` only, no
 * ESP-IDF headers) so the windowing logic can be unit-tested with a normal
 * host compiler -- see `ai/tools/test_ai_input_host.c`.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define AI_INPUT_NUM_CHANNELS 4
#define AI_INPUT_WINDOW_LEN   24

/* The model was trained on reference-station data where CO and NO2 are in
 * ug/m3 (contract mean CO=1056, NO2=77), while the firmware gas drivers
 * report ppm. Convert with molar mass / 24.45 L/mol (25 C, 1 atm) before
 * feeding samples in -- otherwise every real reading z-scores to ~-1.7,
 * i.e. the model always sees "cleanest possible air". */
#define AI_CO_PPM_TO_UGM3  1145.6f  /* 28.01 g/mol  */
#define AI_NO2_PPM_TO_UGM3 1881.6f  /* 46.006 g/mol */

/** Channel order matches the model contract EXACTLY -- do not reorder.
 *  [Temperature, Humidity, CO, NO2] (ungdungdidong/CLAUDE.md mục 2,
 *  ai/inference/model/model_contract_*.json "channels"). */
typedef struct {
    float temperature_c;
    float humidity_pct;
    float co_ugm3;       /**< ug/m3, NOT ppm -- see AI_CO_PPM_TO_UGM3. */
    float no2_ugm3;      /**< ug/m3, NOT ppm -- see AI_NO2_PPM_TO_UGM3. */
    bool valid;          /**< false if ANY of the 4 readings above failed this poll. */
    /** Per-channel validity (model channel order), used by the short-term
     *  EMA only: one failed sensor must not freeze the others' EMA (e.g. an
     *  SHT fault hiding a real CO rise from the threshold rule). The hourly
     *  mean still requires `valid`. `valid == true` implies all channels. */
    bool channel_valid[AI_INPUT_NUM_CHANNELS];
    uint32_t timestamp;  /**< unix seconds for this sample (used only to bucket into an hour). */
} ai_sensor_sample_t;

/** Resets the accumulator and ring buffer -- back to the 24h warm-up state. */
void ai_input_reset(void);

/**
 * @brief Feed one raw sensor poll sample.
 *
 * Safe to call at any cadence (firmware calls this once per
 * `SA_SENSOR_POLLING_INTERVAL` poll from `sensor_task`). Invalid samples
 * (`sample->valid == false`) are ignored for averaging purposes but still
 * used to detect the hour boundary.
 *
 * When the wall-clock hour advances:
 *  - if the finished hour has at least 1 valid sample AND it is exactly
 *    1 hour after the previously finalized hour (or this is the very first
 *    hour ever), its mean is appended to the ring buffer;
 *  - otherwise (a gap > 1h, e.g. after a reboot/OTA, or an entire hour with
 *    zero valid samples), the ring buffer is RESET -- matches the training
 *    pipeline's own rule that a window is only valid across strictly
 *    consecutive hours (`src/data.py: pair_ok`, `ungdungdidong` repo). This
 *    avoids ever feeding the model a window with a hidden time discontinuity.
 */
void ai_input_feed_sample(const ai_sensor_sample_t *sample);

/**
 * @brief Fetch the current 24h window, oldest hour first.
 *
 * @param out out[channel][t], t=0 is the OLDEST hour, t=23 is the most recent
 *            completed hour -- matches the model's training window order
 *            (channel order: Temperature, Humidity, CO, NO2).
 * @return false if the buffer is not yet full (still warming up) -- caller
 *         must NOT run inference in that case (see ai/scheduler).
 */
bool ai_input_get_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN]);

/**
 * @brief Same as ai_input_get_window(), plus a counter that increases by one
 *        every time a new hour is finalized into the ring buffer.
 *
 * The window and the counter are read under the same lock, so a caller can
 * run inference exactly once per new window by comparing `*version` with
 * the value it saw last time -- independent of any wall clock (the hour
 * buckets come from the sample timestamps, which may be DS3231 time rather
 * than `time(NULL)`).
 *
 * @param version  optional (may be NULL); written even when the function
 *                 returns false.
 */
bool ai_input_get_window_versioned(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN], uint32_t *version);

/**
 * @brief Low-latency window for inference WITHIN the hour, not only at hour
 *        boundaries.
 *
 * Newest slot (t=23) is the running mean of the in-progress hour (if it
 * already has >= `min_current_samples` valid samples), the slots before it
 * are the most recent contiguous finalized hours. If fewer than 24 real
 * hours exist (warm-up / after a gap), the missing OLDEST slots are filled
 * by repeating the oldest real hour (edge padding) -- `*real_hours` tells the
 * caller how many slots are real so it can flag the result as provisional.
 *
 * @param real_hours  optional; number of non-padded slots (1..24).
 * @return false only when there is no usable data at all.
 */
bool ai_input_get_live_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN],
                              uint32_t min_current_samples, uint32_t *real_hours);

/** A channel's EMA goes stale after this many consecutive samples without a
 *  valid reading for it (~60s at the 5s poll cadence). */
#define AI_RECENT_MAX_MISSES 12u
/** A jump of more than this between consecutive sample timestamps (sensor
 *  task paused, reboot, clock step) drops every EMA: the next valid sample
 *  reseeds it instead of being blended with pre-gap values. */
#define AI_RECENT_MAX_GAP_S 60u

/**
 * @brief Short-term smoothed reading (per-channel EMA over the last few
 *        valid samples, ~30s at the 5s poll cadence), channel order as the
 *        model's. Used by ai_scheduler's absolute-threshold check, which must
 *        react within seconds instead of waiting for an hourly mean.
 *
 * @param out          out[c] is meaningful only where fresh[c] is true.
 * @param fresh        fresh[c] = channel c had a valid reading within the
 *                     last AI_RECENT_MAX_MISSES samples and no time gap since.
 *                     A stale channel means "unknown", never "clean air".
 * @param samples_fed  optional; total samples fed since boot (valid or not),
 *                     lets the caller detect that samples stopped arriving
 *                     altogether, which this module cannot see by itself.
 * @return true if at least one channel is fresh.
 */
bool ai_input_get_recent(float out[AI_INPUT_NUM_CHANNELS], bool fresh[AI_INPUT_NUM_CHANNELS],
                         uint32_t *samples_fed);

/** True once the ring buffer holds a full, contiguous 24h window. */
bool ai_input_is_ready(void);

/** How many hourly slots are currently filled (0..24) -- for logging/telemetry during warm-up. */
uint32_t ai_input_filled_hours(void);

#ifdef __cplusplus
}
#endif
