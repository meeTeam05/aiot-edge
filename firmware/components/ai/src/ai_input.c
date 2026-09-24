/**
 * @file ai_input.c
 *
 * @brief Hourly windowing buffer implementation -- see ai_input.h.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_input.h"

#include <string.h>

/* sensor_task writes and the ai task reads from different cores, so every
 * public entry point runs under a spinlock on target. Host builds (the
 * gcc unit test in tools/) have no FreeRTOS and are single-threaded. */
#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "sdkconfig.h"
static portMUX_TYPE s_lock = portMUX_INITIALIZER_UNLOCKED;
#define AI_INPUT_LOCK()   portENTER_CRITICAL(&s_lock)
#define AI_INPUT_UNLOCK() portEXIT_CRITICAL(&s_lock)
#else
#define AI_INPUT_LOCK()   ((void)0)
#define AI_INPUT_UNLOCK() ((void)0)
#endif

/* Seconds per window slot. 3600 (one hour) matches the training data; a
 * shorter bucket is only for bench-testing (see SA_AI_WINDOW_BUCKET_SEC). */
#if defined(CONFIG_SA_AI_WINDOW_BUCKET_SEC)
#define AI_INPUT_BUCKET_SEC ((uint32_t)CONFIG_SA_AI_WINDOW_BUCKET_SEC)
#else
#define AI_INPUT_BUCKET_SEC 3600u
#endif

/* Ring buffer of 24 finalized hourly means, oldest-first read order. */
static float s_ring[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
static uint32_t s_filled = 0;      /* how many slots hold real data (0..24) */
static uint32_t s_head = 0;        /* index where the NEXT finalized hour will be written */

/* Current (in-progress) hour accumulator. */
static double s_acc_sum[AI_INPUT_NUM_CHANNELS];
static uint32_t s_acc_count = 0;
static uint32_t s_acc_hour_bucket = 0;   /* timestamp / AI_INPUT_BUCKET_SEC for the slot being accumulated */
static bool s_acc_active = false;

/* Hour bucket of the most recently FINALIZED hour, used to detect gaps. */
static uint32_t s_last_finalized_hour_bucket = 0;
static bool s_have_last_finalized = false;

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

bool ai_input_feed_sample(const ai_sensor_sample_t *sample)
{
    if (sample == NULL) {
        return false;
    }

    uint32_t hour_bucket = sample->timestamp / AI_INPUT_BUCKET_SEC;
    bool finalized = false;

    AI_INPUT_LOCK();
    if (!s_acc_active) {
        reset_accumulator(hour_bucket);
    } else if (hour_bucket != s_acc_hour_bucket) {
        finalize_current_hour();
        reset_accumulator(hour_bucket);
        finalized = true;
    }

    /* Invalid samples still count towards hour-boundary detection above, not towards the mean. */
    if (sample->valid) {
        s_acc_sum[0] += (double)sample->temperature_c;
        s_acc_sum[1] += (double)sample->humidity_pct;
        s_acc_sum[2] += (double)sample->co_ugm3;
        s_acc_sum[3] += (double)sample->no2_ugm3;
        s_acc_count++;
    }
    AI_INPUT_UNLOCK();
    return finalized;
}

bool ai_input_get_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN])
{
    if (out == NULL) {
        return false;
    }

    AI_INPUT_LOCK();
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
