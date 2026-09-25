/**
 * @file test_ai_input_host.c
 *
 * @brief Host-side unit test for ai/input (no ESP-IDF needed).
 *
 * Build & run with a plain compiler, e.g.:
 *     gcc -std=c99 -I../ai_input/include test_ai_input_host.c ../ai_input/src/ai_input.c -o test_ai_input && ./test_ai_input
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

static void feed(uint32_t ts, float t, float h, float co, float no2, bool valid)
{
    ai_sensor_sample_t s = {
        .temperature_c = t, .humidity_pct = h, .co_ugm3 = co, .no2_ugm3 = no2,
        .valid = valid, .timestamp = ts,
    };
    ai_input_feed_sample(&s);
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

/* Test 4: the window version advances exactly once per finalized hour, so
 * the scheduler can run inference once per new window without looking at
 * any wall clock. */
static void test_window_version(void)
{
    ai_input_reset();
    const uint32_t hour_seconds = 3600;
    float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
    uint32_t v0 = 0, v1 = 0, v2 = 0;

    for (uint32_t hour = 0; hour < 24; hour++) {
        feed(hour * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);
    }
    feed(24 * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true);
    CHECK(ai_input_get_window_versioned(window, &v0), "versioned get_window succeeds once ready");

    feed(24 * hour_seconds + 600, 25.0f, 50.0f, 100.0f, 10.0f, true); /* same hour */
    ai_input_get_window_versioned(window, &v1);
    CHECK(v1 == v0, "version unchanged while still inside the same hour");

    feed(25 * hour_seconds, 25.0f, 50.0f, 100.0f, 10.0f, true); /* finalizes hour 24 */
    ai_input_get_window_versioned(window, &v2);
    CHECK(v2 == v0 + 1, "version +1 after the next hour is finalized");
}

/* Test 5: live window is usable right away (warm-up padding) and its newest
 * slot follows the IN-PROGRESS hour, so a spike is visible without waiting
 * for the hour to end. */
static void test_live_window(void)
{
    ai_input_reset();
    const uint32_t hour_seconds = 3600;
    float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
    uint32_t real = 0;

    CHECK(!ai_input_get_live_window(window, 1, &real), "live window unavailable with no data");

    /* 3 samples into the very first hour: too few for min=6, enough for min=3. */
    for (uint32_t i = 0; i < 3; i++) {
        feed(i * 5, 25.0f, 50.0f, 100.0f, 10.0f, true);
    }
    CHECK(!ai_input_get_live_window(window, 6, &real), "in-progress hour below min samples is not used");
    CHECK(ai_input_get_live_window(window, 3, &real), "live window available minutes after boot");
    CHECK(real == 1, "1 real slot (in-progress hour) during warm-up");
    CHECK(fabsf(window[2][0] - 100.0f) < 1e-3f && fabsf(window[2][23] - 100.0f) < 1e-3f,
          "warm-up padding repeats the oldest real hour");

    /* Finish hour 0 and 1, then spike CO mid-hour 2. */
    feed(1 * hour_seconds, 25.0f, 50.0f, 200.0f, 10.0f, true);
    feed(2 * hour_seconds, 25.0f, 50.0f, 5000.0f, 10.0f, true);
    CHECK(ai_input_get_live_window(window, 1, &real), "live window after 2 finalized hours");
    CHECK(real == 3, "2 finalized + 1 in-progress = 3 real slots");
    CHECK(fabsf(window[2][21] - 100.0f) < 1e-3f, "slot 21 = hour 0");
    CHECK(fabsf(window[2][22] - 200.0f) < 1e-3f, "slot 22 = hour 1");
    CHECK(fabsf(window[2][23] - 5000.0f) < 1e-3f, "slot 23 = in-progress hour (spike visible immediately)");
    CHECK(fabsf(window[2][0] - 100.0f) < 1e-3f, "padding uses oldest real hour");

    /* Full ring: live window = 23 newest finalized + in-progress. */
    ai_input_reset();
    for (uint32_t hour = 0; hour < 30; hour++) {
        feed(hour * hour_seconds, 25.0f, 50.0f, (float)hour, 10.0f, true);
    }
    CHECK(ai_input_get_live_window(window, 1, &real) && real == 24, "full live window, 24 real slots");
    CHECK(fabsf(window[2][23] - 29.0f) < 1e-3f, "newest = in-progress hour 29");
    CHECK(fabsf(window[2][22] - 28.0f) < 1e-3f && fabsf(window[2][0] - 6.0f) < 1e-3f,
          "older slots = finalized hours 6..28");

    /* Resume after a multi-hour gap: stale ring must not sit in front of the new hour. */
    feed(40 * hour_seconds, 25.0f, 50.0f, 777.0f, 10.0f, true);
    CHECK(ai_input_get_live_window(window, 1, &real) && real == 1, "gap: stale finalized hours dropped");
    CHECK(fabsf(window[2][0] - 777.0f) < 1e-3f, "gap: window padded from the resumed hour only");
}

/* Sample where only some channels were read successfully this poll. */
static void feed_partial(uint32_t ts, float co, bool sht_ok, bool co_ok, bool no2_ok)
{
    ai_sensor_sample_t s = {
        .temperature_c = 25.0f, .humidity_pct = 50.0f, .co_ugm3 = co, .no2_ugm3 = 10.0f,
        .valid = sht_ok && co_ok && no2_ok,
        .channel_valid = {sht_ok, sht_ok, co_ok, no2_ok},
        .timestamp = ts,
    };
    ai_input_feed_sample(&s);
}

/* Test 6: short-term EMA reacts within a few samples. */
static void test_recent(void)
{
    ai_input_reset();
    float recent[AI_INPUT_NUM_CHANNELS];
    bool fresh[AI_INPUT_NUM_CHANNELS];
    uint32_t fed = 0;
    CHECK(!ai_input_get_recent(recent, fresh, &fed), "no recent value before any valid sample");
    feed(0, 25.0f, 50.0f, 100.0f, 10.0f, true);
    CHECK(ai_input_get_recent(recent, fresh, &fed) && fresh[2] && fabsf(recent[2] - 100.0f) < 1e-3f,
          "first sample seeds EMA");
    feed(5, 0, 0, 99999.0f, 0, false);
    ai_input_get_recent(recent, fresh, &fed);
    CHECK(fresh[2] && fabsf(recent[2] - 100.0f) < 1e-3f, "invalid sample ignored by EMA");
    CHECK(fed == 2, "samples_fed counts invalid samples too");
    for (uint32_t i = 0; i < 10; i++) {
        feed(10 + i * 5, 25.0f, 50.0f, 40000.0f, 10.0f, true);
    }
    ai_input_get_recent(recent, fresh, &fed);
    CHECK(recent[2] > 30000.0f, "EMA crosses 30000 within ~50s of a sustained CO spike");
}

/* Test 7 (bug 1): a failed SHT must not freeze the CO EMA. */
static void test_recent_per_channel(void)
{
    ai_input_reset();
    float recent[AI_INPUT_NUM_CHANNELS];
    bool fresh[AI_INPUT_NUM_CHANNELS];
    feed_partial(0, 1000.0f, true, true, true);
    for (uint32_t i = 1; i <= 10; i++) {
        feed_partial(i * 5, 50000.0f, false, true, true); /* SHT down, CO spiking */
    }
    ai_input_get_recent(recent, fresh, NULL);
    CHECK(fresh[2] && recent[2] > 30000.0f, "CO EMA still tracks a spike while SHT is failing");
    CHECK(fresh[0], "SHT channel still fresh after 10 misses (< limit)");
    float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
    CHECK(ai_input_get_live_window(window, 1, NULL) && fabsf(window[2][23] - 1000.0f) < 1e-3f,
          "partial samples stay out of the hourly mean");
}

/* Test 8 (bug 2): a dead sensor's last value expires instead of lingering. */
static void test_recent_staleness(void)
{
    ai_input_reset();
    float recent[AI_INPUT_NUM_CHANNELS];
    bool fresh[AI_INPUT_NUM_CHANNELS];
    feed_partial(0, 40000.0f, true, true, true);
    uint32_t ts = 0;
    for (uint32_t i = 1; i < AI_RECENT_MAX_MISSES; i++) {
        feed_partial(ts += 5, 0.0f, true, false, true); /* CO sensor dead */
    }
    ai_input_get_recent(recent, fresh, NULL);
    CHECK(fresh[2], "CO still fresh one miss before the limit");
    feed_partial(ts += 5, 0.0f, true, false, true);
    CHECK(ai_input_get_recent(recent, fresh, NULL), "other channels keep get_recent true");
    CHECK(!fresh[2] && fresh[3], "CO goes stale after AI_RECENT_MAX_MISSES, NO2 unaffected");

    feed_partial(ts += 5, 2000.0f, true, true, true);
    ai_input_get_recent(recent, fresh, NULL);
    CHECK(fresh[2] && fabsf(recent[2] - 2000.0f) < 1e-3f, "recovered sensor reseeds, not blended with old 40000");

    /* Time gap (sensor_task paused / reboot): every EMA reseeds. */
    feed_partial(ts += AI_RECENT_MAX_GAP_S + 5, 0.0f, false, false, false);
    CHECK(!ai_input_get_recent(recent, fresh, NULL), "all channels stale right after a time gap");
    feed_partial(ts += 5, 500.0f, true, true, true);
    ai_input_get_recent(recent, fresh, NULL);
    CHECK(fabsf(recent[2] - 500.0f) < 1e-3f, "first sample after a gap reseeds the EMA");
}

int main(void)
{
    test_basic_windowing();
    test_gap_resets_buffer();
    test_all_invalid_hour_resets_buffer();
    test_window_version();
    test_live_window();
    test_recent();
    test_recent_per_channel();
    test_recent_staleness();

    if (g_failures == 0) {
        printf("\nAll tests passed.\n");
        return 0;
    }
    printf("\n%d test(s) FAILED.\n", g_failures);
    return 1;
}
