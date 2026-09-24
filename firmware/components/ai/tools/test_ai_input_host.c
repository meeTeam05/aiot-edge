/**
 * @file test_ai_input_host.c
 *
 * @brief Host-side unit test for ai_input (no ESP-IDF needed).
 *
 * Build & run with a plain compiler, e.g.:
 *     gcc -std=c99 -I../include test_ai_input_host.c ../src/ai_input.c -o test_ai_input && ./test_ai_input
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_input.h"

#include <stdio.h>
#include <math.h>

static int g_failures = 0;

#define CHECK(cond, msg) do { \
    if (!(cond)) { \
        printf("[FAIL] %s (line %d)\n", (msg), __LINE__); \
        g_failures++; \
    } else { \
        printf("[ OK ] %s\n", (msg)); \
    } \
} while (0)

static bool feed(uint32_t ts, float t, float h, float co, float no2, bool valid)
{
    ai_sensor_sample_t s = {
        .temperature_c = t, .humidity_pct = h, .co_ugm3 = co, .no2_ugm3 = no2,
        .valid = valid, .timestamp = ts,
    };
    return ai_input_feed_sample(&s);
}

/* Test 1: 24 consecutive hours, several 5s-cadence samples per hour ->
 * buffer becomes ready, values are the correct per-hour means in the
 * correct oldest-to-newest order. */
static void test_basic_windowing(void)
{
    ai_input_reset();
    CHECK(!ai_input_is_ready(), "not ready before any data");

    const uint32_t hour_seconds = 3600;
    for (uint32_t hour = 0; hour < 24; hour++) {
        /* 3 samples in this hour: values increase with `hour` so we can
         * check ordering afterwards. Two valid + one invalid (should be
         * ignored, not corrupt the mean). */
        uint32_t base_ts = hour * hour_seconds;
        feed(base_ts + 0,   20.0f + hour, 50.0f, 100.0f, 10.0f, true);
        feed(base_ts + 100, 999.0f, 999.0f, 999.0f, 999.0f, false); /* invalid, must be ignored */
        feed(base_ts + 200, 22.0f + hour, 52.0f, 102.0f, 12.0f, true);
    }
    /* cross into hour 24 to finalize hour 23's accumulator */
    feed(24 * hour_seconds, 0.0f, 0.0f, 0.0f, 0.0f, true);

    CHECK(ai_input_is_ready(), "buffer full after 24 consecutive hours");
    CHECK(ai_input_filled_hours() == 24, "filled_hours == 24");

    float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
    CHECK(ai_input_get_window(window), "get_window succeeds once ready");

    float expected_t0 = (20.0f + 0 + 22.0f + 0) / 2.0f;   /* oldest hour (hour=0) */
    float expected_t23 = (20.0f + 23 + 22.0f + 23) / 2.0f; /* newest finalized hour (hour=23) */
    CHECK(fabsf(window[0][0] - expected_t0) < 1e-3f, "oldest slot = hour-0 mean temperature");
    CHECK(fabsf(window[0][23] - expected_t23) < 1e-3f, "newest slot = hour-23 mean temperature");
}

/* Test 2: a >1h gap between finalized hours must reset the buffer (matches
 * training pipeline's "pair_ok" contiguous-hour rule). */
static void test_gap_resets_buffer(void)
{
    ai_input_reset();
    const uint32_t hour_seconds = 3600;
    for (uint32_t hour = 0; hour < 24; hour++) {
        feed(hour * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);
    }
    feed(24 * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true); /* finalize hour 23 */
    CHECK(ai_input_is_ready(), "ready before simulated gap");

    /* Jump forward 5 hours (e.g. device was rebooted/offline), then resume. */
    uint32_t resume_hour = 24 + 5;
    feed(resume_hour * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);
    feed((resume_hour + 1) * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true); /* finalizes resume_hour */

    CHECK(!ai_input_is_ready(), "buffer resets (not ready) after a >1h gap");
    CHECK(ai_input_filled_hours() == 1, "exactly 1 hour filled right after the gap");
}

/* Test 3: an entire hour with zero valid samples must also reset (cannot
 * fabricate a mean from nothing). */
static void test_all_invalid_hour_resets_buffer(void)
{
    ai_input_reset();
    const uint32_t hour_seconds = 3600;
    for (uint32_t hour = 0; hour < 24; hour++) {
        feed(hour * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);
    }
    feed(24 * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);
    CHECK(ai_input_is_ready(), "ready before the all-invalid hour");

    /* Hour 25: sensor fails on every poll. */
    feed(25 * hour_seconds, 0, 0, 0, 0, false);
    feed(25 * hour_seconds + 100, 0, 0, 0, 0, false);
    /* Crossing into hour 26 finalizes hour 25 with zero valid samples. */
    feed(26 * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);

    CHECK(!ai_input_is_ready(), "buffer resets after an hour with 0 valid samples");
}

/* Test 4: feed() reports true only on the sample that closes out an hour --
 * that is the signal the ai task uses to wake up and run inference. */
static void test_feed_reports_hour_boundary(void)
{
    ai_input_reset();
    CHECK(!feed(0, 25.0f, 50.0f, 100.0f, 10.0f, true), "first sample does not finalize");
    CHECK(!feed(5, 25.0f, 50.0f, 100.0f, 10.0f, true), "same-hour sample does not finalize");
    CHECK(!feed(3599, 25.0f, 50.0f, 100.0f, 10.0f, false), "invalid same-hour sample does not finalize");
    CHECK(feed(3600, 25.0f, 50.0f, 100.0f, 10.0f, true), "first sample of next hour finalizes");
    CHECK(!feed(3605, 25.0f, 50.0f, 100.0f, 10.0f, true), "following sample does not finalize again");
}

int main(void)
{
    test_basic_windowing();
    test_gap_resets_buffer();
    test_all_invalid_hour_resets_buffer();
    test_feed_reports_hour_boundary();

    if (g_failures == 0) {
        printf("\nAll tests passed.\n");
        return 0;
    }
    printf("\n%d test(s) FAILED.\n", g_failures);
    return 1;
}
