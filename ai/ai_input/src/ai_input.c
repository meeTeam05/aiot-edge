/**
 * @file ai_input.c
 *
 * @brief Hourly windowing buffer implementation -- see ai_input.h.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_input.h"

#include <string.h>

/* sensor_task writes and ai_scheduler reads from different cores, so every
 * public entry point runs under a spinlock on target. Host builds (the
 * gcc unit test in ai/tools) have no FreeRTOS and are single-threaded. */
#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
static portMUX_TYPE s_lock = portMUX_INITIALIZER_UNLOCKED;
#define AI_INPUT_LOCK()   portENTER_CRITICAL(&s_lock)
#define AI_INPUT_UNLOCK() portEXIT_CRITICAL(&s_lock)
#else
#define AI_INPUT_LOCK()   ((void)0)
#define AI_INPUT_UNLOCK() ((void)0)
#endif

/* Ring buffer of 24 finalized hourly means, oldest-first read order. */
static float s_ring[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
static uint32_t s_filled = 0;      /* how many slots hold real data (0..24) */
static uint32_t s_head = 0;        /* index where the NEXT finalized hour will be written */
static uint32_t s_version = 0;     /* bumped on every finalized hour -- see ai_input_get_window_versioned() */

/* Current (in-progress) hour accumulator. */
static double s_acc_sum[AI_INPUT_NUM_CHANNELS];
static uint32_t s_acc_count = 0;
static uint32_t s_acc_hour_bucket = 0;   /* epoch_seconds / 3600 for the hour being accumulated */
static bool s_acc_active = false;

/* Hour bucket of the most recently FINALIZED hour, used to detect gaps. */
static uint32_t s_last_finalized_hour_bucket = 0;
static bool s_have_last_finalized = false;

/* Short-term per-channel EMA of valid readings -- see ai_input_get_recent(). */
#define AI_RECENT_EMA_ALPHA 0.2f
static float s_recent[AI_INPUT_NUM_CHANNELS];
static bool s_recent_fresh[AI_INPUT_NUM_CHANNELS];
static uint32_t s_recent_misses[AI_INPUT_NUM_CHANNELS]; /* consecutive samples with no valid reading */
static uint32_t s_last_sample_ts = 0;
static bool s_have_last_sample_ts = false;
static uint32_t s_samples_fed = 0;

static void update_recent(const ai_sensor_sample_t *sample)
{
    if (s_have_last_sample_ts) {
        uint32_t gap = sample->timestamp >= s_last_sample_ts ? sample->timestamp - s_last_sample_ts
                                                              : s_last_sample_ts - sample->timestamp;
        if (gap > AI_RECENT_MAX_GAP_S) {
            memset(s_recent_fresh, 0, sizeof(s_recent_fresh));
        }
    }
    s_last_sample_ts = sample->timestamp;
    s_have_last_sample_ts = true;
    s_samples_fed++;

    const float v[AI_INPUT_NUM_CHANNELS] = {sample->temperature_c, sample->humidity_pct,
                                            sample->co_ugm3, sample->no2_ugm3};
    for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
        if (sample->valid || sample->channel_valid[c]) {
            s_recent[c] = s_recent_fresh[c] ? s_recent[c] + AI_RECENT_EMA_ALPHA * (v[c] - s_recent[c]) : v[c];
            s_recent_fresh[c] = true;
            s_recent_misses[c] = 0;
        } else if (s_recent_fresh[c] && ++s_recent_misses[c] >= AI_RECENT_MAX_MISSES) {
            /* Sensor silent for ~1 min: its last value is no longer the truth. */
            s_recent_fresh[c] = false;
        }
    }
}

static void reset_accumulator(uint32_t hour_bucket)
{
    memset(s_acc_sum, 0, sizeof(s_acc_sum));
    s_acc_count = 0;
    s_acc_hour_bucket = hour_bucket;
    s_acc_active = true;
}

void ai_input_reset(void)
{
    AI_INPUT_LOCK();
    memset(s_ring, 0, sizeof(s_ring));
    s_filled = 0;
    s_head = 0;
    s_acc_count = 0;
    s_acc_active = false;
    s_have_last_finalized = false;
    s_last_finalized_hour_bucket = 0;
    memset(s_recent_fresh, 0, sizeof(s_recent_fresh));
    memset(s_recent_misses, 0, sizeof(s_recent_misses));
    s_have_last_sample_ts = false;
    s_samples_fed = 0;
    AI_INPUT_UNLOCK();
}

static void push_hour(const float means[AI_INPUT_NUM_CHANNELS], uint32_t hour_bucket)
{
    bool contiguous = s_have_last_finalized && (hour_bucket == s_last_finalized_hour_bucket + 1);

    if (s_have_last_finalized && !contiguous) {
        /* Gap detected (missed >=1 whole hour, e.g. reboot/OTA/long outage) --
         * the window would otherwise silently mix non-consecutive hours,
         * which the model was never trained on. Start over. */
        s_filled = 0;
        s_head = 0;
    }

    for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
        s_ring[c][s_head] = means[c];
    }
    s_head = (s_head + 1) % AI_INPUT_WINDOW_LEN;
    if (s_filled < AI_INPUT_WINDOW_LEN) {
        s_filled++;
    }

    s_last_finalized_hour_bucket = hour_bucket;
    s_have_last_finalized = true;
    s_version++;
}

static void finalize_current_hour(void)
{
    if (!s_acc_active) {
        return;
    }

    if (s_acc_count == 0) {
        /* Entire hour went by with zero valid samples -- same treatment as a
         * time gap: we cannot fabricate a value for this hour, so the window
         * restarts from scratch once real data resumes. */
        s_have_last_finalized = false;
        s_filled = 0;
        s_head = 0;
        s_acc_active = false;
        return;
    }

    float means[AI_INPUT_NUM_CHANNELS];
    for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
        means[c] = (float)(s_acc_sum[c] / (double)s_acc_count);
    }
    push_hour(means, s_acc_hour_bucket);
    s_acc_active = false;
}

void ai_input_feed_sample(const ai_sensor_sample_t *sample)
{
    if (sample == NULL) {
        return;
    }

    uint32_t hour_bucket = sample->timestamp / 3600u;

    AI_INPUT_LOCK();
    if (!s_acc_active) {
        reset_accumulator(hour_bucket);
    } else if (hour_bucket != s_acc_hour_bucket) {
        finalize_current_hour();
        reset_accumulator(hour_bucket);
    }

    /* Invalid samples still count towards hour-boundary detection above, not towards the mean. */
    if (sample->valid) {
        s_acc_sum[0] += (double)sample->temperature_c;
        s_acc_sum[1] += (double)sample->humidity_pct;
        s_acc_sum[2] += (double)sample->co_ugm3;
        s_acc_sum[3] += (double)sample->no2_ugm3;
        s_acc_count++;
    }
    update_recent(sample);
    AI_INPUT_UNLOCK();
}

bool ai_input_get_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN])
{
    return ai_input_get_window_versioned(out, NULL);
}

bool ai_input_get_window_versioned(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN], uint32_t *version)
{
    if (out == NULL) {
        return false;
    }

    AI_INPUT_LOCK();
    if (version != NULL) {
        *version = s_version;
    }
    if (s_filled < AI_INPUT_WINDOW_LEN) {
        AI_INPUT_UNLOCK();
        return false;
    }

    /* s_head currently points at the slot that will be overwritten NEXT,
     * i.e. it is the OLDEST entry once the ring is full. */
    for (uint32_t t = 0; t < AI_INPUT_WINDOW_LEN; t++) {
        uint32_t idx = (s_head + t) % AI_INPUT_WINDOW_LEN;
        for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
            out[c][t] = s_ring[c][idx];
        }
    }
    AI_INPUT_UNLOCK();
    return true;
}

bool ai_input_get_live_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN],
                              uint32_t min_current_samples, uint32_t *real_hours)
{
    if (out == NULL) {
        return false;
    }
    if (min_current_samples == 0) {
        min_current_samples = 1;
    }

    AI_INPUT_LOCK();
    bool use_current = s_acc_active && s_acc_count >= min_current_samples;

    /* Finalized hours only belong in front of the in-progress hour if they
     * are contiguous with it -- after a reboot/gap the ring is only reset
     * once the NEXT hour is finalized, so check it here too. */
    uint32_t finalized = s_filled;
    if (use_current && s_have_last_finalized && s_acc_hour_bucket != s_last_finalized_hour_bucket + 1) {
        finalized = 0;
    }

    uint32_t max_finalized = use_current ? AI_INPUT_WINDOW_LEN - 1 : AI_INPUT_WINDOW_LEN;
    uint32_t n_finalized = finalized < max_finalized ? finalized : max_finalized;
    uint32_t n_real = n_finalized + (use_current ? 1u : 0u);
    if (n_real == 0) {
        AI_INPUT_UNLOCK();
        return false;
    }

    /* Real data goes into the NEWEST n_real slots, oldest-first. */
    uint32_t first = AI_INPUT_WINDOW_LEN - n_real;
    for (uint32_t k = 0; k < n_finalized; k++) {
        /* k-th of the n_finalized most recent finalized hours, oldest first. */
        uint32_t idx = (s_head + AI_INPUT_WINDOW_LEN - n_finalized + k) % AI_INPUT_WINDOW_LEN;
        for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
            out[c][first + k] = s_ring[c][idx];
        }
    }
    if (use_current) {
        for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
            out[c][AI_INPUT_WINDOW_LEN - 1] = (float)(s_acc_sum[c] / (double)s_acc_count);
        }
    }
    AI_INPUT_UNLOCK();

    /* Edge padding for the missing oldest hours. */
    for (uint32_t t = 0; t < first; t++) {
        for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
            out[c][t] = out[c][first];
        }
    }
    if (real_hours != NULL) {
        *real_hours = n_real;
    }
    return true;
}

bool ai_input_get_recent(float out[AI_INPUT_NUM_CHANNELS], bool fresh[AI_INPUT_NUM_CHANNELS],
                         uint32_t *samples_fed)
{
    if (out == NULL || fresh == NULL) {
        return false;
    }
    bool any = false;
    AI_INPUT_LOCK();
    for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
        fresh[c] = s_recent_fresh[c];
        out[c] = s_recent_fresh[c] ? s_recent[c] : 0.0f;
        any = any || fresh[c];
    }
    if (samples_fed != NULL) {
        *samples_fed = s_samples_fed;
    }
    AI_INPUT_UNLOCK();
    return any;
}

bool ai_input_is_ready(void)
{
    AI_INPUT_LOCK();
    bool ready = s_filled >= AI_INPUT_WINDOW_LEN;
    AI_INPUT_UNLOCK();
    return ready;
}

uint32_t ai_input_filled_hours(void)
{
    AI_INPUT_LOCK();
    uint32_t filled = s_filled;
    AI_INPUT_UNLOCK();
    return filled;
}
