/**
 * @file ai_input.h
 *
 * @brief Hourly windowing buffer for the on-device AQI model.
 *
 * The model was trained on 24 CONSECUTIVE HOURLY samples (1 row/hour) from a
 * reference air-quality station -- see `ungdungdidong/CLAUDE.md` mục 2 and
 * `components/ai/README.md`. Firmware polls the physical sensors every
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
 * host compiler -- see `tools/test_ai_input_host.c`.
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
 *  model/model_contract_freeze.json "channels"). */
typedef struct {
    float temperature_c;
    float humidity_pct;
    float co_ugm3;       /**< ug/m3, NOT ppm -- see AI_CO_PPM_TO_UGM3. */
    float no2_ugm3;      /**< ug/m3, NOT ppm -- see AI_NO2_PPM_TO_UGM3. */
    bool valid;          /**< false if ANY of the 4 readings above failed this poll. */
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
 *
 * The hour length is CONFIG_SA_AI_WINDOW_BUCKET_SEC on target (3600 in
 * production; always 3600 on host builds).
 *
 * @return true if this sample closed out the previous hour (the window was
 *         updated or reset), i.e. the caller should re-check readiness and
 *         run inference; false otherwise.
 */
bool ai_input_feed_sample(const ai_sensor_sample_t *sample);

/**
 * @brief Fetch the current 24h window, oldest hour first.
 *
 * @param out out[channel][t], t=0 is the OLDEST hour, t=23 is the most recent
 *            completed hour -- matches the model's training window order
 *            (channel order: Temperature, Humidity, CO, NO2).
 * @return false if the buffer is not yet full (still warming up) -- caller
 *         must NOT run inference in that case.
 */
bool ai_input_get_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN]);

/** True once the ring buffer holds a full, contiguous 24h window. */
bool ai_input_is_ready(void);

/** How many hourly slots are currently filled (0..24) -- for logging/telemetry during warm-up. */
uint32_t ai_input_filled_hours(void);

#ifdef __cplusplus
}
#endif
