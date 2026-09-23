/**
 * @file ai_input.c
 *
 * @brief Hourly windowing buffer implementation -- see ai_input.h.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_input.h"

#include <string.h>

/* Ring buffer of 24 finalized hourly means, oldest-first read order. */
static float s_ring[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
static uint32_t s_filled = 0;      /* how many slots hold real data (0..24) */
static uint32_t s_head = 0;        /* index where the NEXT finalized hour will be written */

/* Current (in-progress) hour accumulator. */
static double s_acc_sum[AI_INPUT_NUM_CHANNELS];
static uint32_t s_acc_count = 0;
static uint32_t s_acc_hour_bucket = 0;   /* epoch_seconds / 3600 for the hour being accumulated */
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
    memset(s_ring, 0, sizeof(s_ring));
    s_filled = 0;
    s_head = 0;
    s_acc_count = 0;
    s_acc_active = false;
    s_have_last_finalized = false;
    s_last_finalized_hour_bucket = 0;
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

void ai_input_feed_sample(const ai_sensor_sample_t *sample)
{
    if (sample == NULL) {
        return;
    }

    uint32_t hour_bucket = sample->timestamp / 3600u;

    if (!s_acc_active) {
        reset_accumulator(hour_bucket);
    } else if (hour_bucket != s_acc_hour_bucket) {
        finalize_current_hour();
        reset_accumulator(hour_bucket);
    }

    if (!sample->valid) {
        return; /* still counts towards hour-boundary detection above, not towards the mean */
    }

    s_acc_sum[0] += (double)sample->temperature_c;
    s_acc_sum[1] += (double)sample->humidity_pct;
    s_acc_sum[2] += (double)sample->co_ppm;
    s_acc_sum[3] += (double)sample->no2_ppm;
    s_acc_count++;
}

bool ai_input_get_window(float out[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN])
{
    if (out == NULL || s_filled < AI_INPUT_WINDOW_LEN) {
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
    return true;
}

bool ai_input_is_ready(void)
{
    return s_filled >= AI_INPUT_WINDOW_LEN;
}

uint32_t ai_input_filled_hours(void)
{
    return s_filled;
}
