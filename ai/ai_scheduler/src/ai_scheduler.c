/**
 * @file ai_scheduler.c
 *
 * @brief FreeRTOS task gluing ai/gas_ews (CO/NO2 early warning against
 *        QCVN 03:2019/BYT) to relay/buzzer/MQTT.
 *
 * Every 5s: read gas_ews status; on each new 10s step run the INT8 model on
 * the 20 min window (if one is available) and report the result back to
 * gas_ews, which owns all alarm logic. The QCVN rule (STEL/TWA) lives in
 * gas_ews and keeps working when the model is missing or failed its boot
 * self-test.
 *
 * See ai_scheduler.h for the design constraints this file implements
 * (single relay writer, fan ownership, fail-safe on error/warm-up).
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_scheduler.h"

#include "gas_ews.h"
#include "gas_ews_model.h"

#include "buzzer.h"
#include "cJSON.h"
#include "device_mode.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mqtt.h"
#include "relay.h"

#include <math.h>
#include <string.h>
#include <time.h>

#define AI_SCHEDULER_TASK_NAME       "ai_scheduler"
#define AI_SCHEDULER_TASK_STACK_SIZE 8192 /* Invoke() + cJSON; check the high-water mark log on real hardware */
#define AI_SCHEDULER_TASK_PRIORITY   3   /* below sensor_task(5)/MQTT -- never contends for CPU with them */
#define AI_SCHEDULER_TICK_MS         5000u    /* = sensor poll cadence; gas_ews steps are 10s */
#define AI_STATE_PERIOD_MS           60000    /* ai/state heartbeat (ppm/STEL trend) even without changes */
#define AI_TIMING_REPORT_RUNS        360      /* 360 x 10s steps = log inference timing once per hour */

#if CONFIG_SA_AI_ENABLED

static const char *TAG = "ai_scheduler"; /* inside the #if: unused (-Werror=all) when AI is disabled */

/* Bool Kconfig options set to n are left undefined in sdkconfig.h. */
#if CONFIG_SA_AI_CONTROL_RELAY
#define AI_CONTROLS_RELAY true
#else
#define AI_CONTROLS_RELAY false
#endif

/* Only defined when SA_AI_CONTROL_RELAY=y (Kconfig "depends on"). */
#ifndef CONFIG_SA_AI_FAN_ON_LEVEL
#define CONFIG_SA_AI_FAN_ON_LEVEL 1
#endif

static const char *const kLevelName[] = {"an_toan", "canh_bao_som", "vuot_nguong"};
static const char *const kGasKey[GAS_EWS_NUM_GASES] = {"co", "no2"};

static char s_ai_state_topic[96] = {0};
static char s_device_id[64] = {0};

static bool s_model_ready = false;          /* model loaded + self-test passed this boot */
static uint32_t s_last_steps = 0;
static gas_ews_status_t s_status;
static gas_ews_level_t s_level = GAS_EWS_SAFE;   /* max over both gases: what gets acted on */
static float s_window[GAS_EWS_WINDOW_STEPS][GAS_EWS_NUM_CHANNELS]; /* 3.8 KB -- static, not on the task stack */

/* True only while the Fan is ON because the AI switched it on. The AI never
 * switches off a Fan it did not switch on itself, so a user's manual "on"
 * is always left alone. */
static bool s_ai_owns_fan = false;
static int64_t s_override_until_ms = 0;

static int64_t s_last_publish_ms = 0;
static bool s_stack_logged = false;

/* Measured on-device cost of one gas_ews_model_infer() (quantize + Invoke),
 * reset after every hourly report. */
static uint32_t s_infer_runs = 0;
static int64_t s_infer_sum_us = 0;
static int64_t s_infer_max_us = 0;

static int64_t now_ms(void)
{
    return esp_timer_get_time() / 1000; /* 64-bit: no wrap-around like the 32-bit tick count */
}

static void add_num_or_null(cJSON *obj, const char *key, float v)
{
    if (isnan(v)) {
        cJSON_AddNullToObject(obj, key);
    } else {
        cJSON_AddNumberToObject(obj, key, (double)v);
    }
}

static void publish_ai_state(void)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        ESP_LOGE(TAG, "publish_ai_state: cJSON_CreateObject failed");
        return;
    }
    const gas_ews_status_t *st = &s_status;
    cJSON_AddStringToObject(root, "standard", "QCVN 03:2019/BYT");
    cJSON_AddNumberToObject(root, "level", (double)s_level);
    cJSON_AddStringToObject(root, "level_name", kLevelName[s_level]);
    cJSON_AddBoolToObject(root, "warmup", st->warmup);
    cJSON_AddBoolToObject(root, "model_ready", s_model_ready);
    cJSON_AddBoolToObject(root, "model_ok", st->model_ok);
    for (int g = 0; g < GAS_EWS_NUM_GASES; g++) {
        cJSON *o = cJSON_AddObjectToObject(root, kGasKey[g]);
        if (o == NULL) {
            continue;
        }
        add_num_or_null(o, "ppm", st->ppm[g]);
        add_num_or_null(o, "stel15", st->stel[g]);
        add_num_or_null(o, "twa8h", st->twa[g]);
        add_num_or_null(o, "proj10", st->proj[g]);
        add_num_or_null(o, "p_model", st->p_model[g]);
        cJSON_AddNumberToObject(o, "level", (double)st->level[g]);
        cJSON_AddBoolToObject(o, "rule", st->rule_alarm[g]);
        cJSON_AddBoolToObject(o, "proj_alarm", st->proj_alarm[g]);
        cJSON_AddBoolToObject(o, "model_alarm", st->model_alarm[g]);
    }
    cJSON_AddBoolToObject(root, "controls_relay", AI_CONTROLS_RELAY);
    cJSON_AddNumberToObject(root, "ts", (double)time(NULL));

    char *payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        if (mqtt_publish(s_ai_state_topic, payload, 1, false) < 0) {
            ESP_LOGW(TAG, "ai/state publish failed (MQTT not ready?)");
        }
        cJSON_free(payload);
    }
    cJSON_Delete(root);
    s_last_publish_ms = now_ms();
}

/**
 * @brief On every new gas_ews step: run the model on the 20 min window if
 * one is available, otherwise report "no result" so gas_ews clears a stale
 * model alarm instead of trusting an old output.
 */
static void run_model_on_new_step(void)
{
    gas_ews_get_status(&s_status);
    if (s_status.steps == s_last_steps) {
        return;
    }
    s_last_steps = s_status.steps;

    uint32_t steps = s_status.steps;
    if (!s_model_ready || !gas_ews_get_window(&steps, s_window)) {
        gas_ews_set_model_result(steps, NULL, false);
        return;
    }
    float p[GAS_EWS_NUM_GASES];
    int64_t t0 = esp_timer_get_time();
    esp_err_t err = gas_ews_model_infer(s_window, p);
    int64_t dt_us = esp_timer_get_time() - t0;
    if (!s_stack_logged) {
        ESP_LOGI(TAG, "first inference at %lld s after boot (step %u): %lld us; "
                      "stack high-water mark: %u bytes free",
                 (long long)(t0 / 1000000), (unsigned)steps, (long long)dt_us,
                 (unsigned)uxTaskGetStackHighWaterMark(NULL));
        s_stack_logged = true;
    }
    s_infer_runs++;
    s_infer_sum_us += dt_us;
    if (dt_us > s_infer_max_us) {
        s_infer_max_us = dt_us;
    }
    if (s_infer_runs >= AI_TIMING_REPORT_RUNS) {
        ESP_LOGI(TAG, "inference timing: %u runs, avg %lld us, max %lld us",
                 (unsigned)s_infer_runs, (long long)(s_infer_sum_us / s_infer_runs),
                 (long long)s_infer_max_us);
        s_infer_runs = 0;
        s_infer_sum_us = 0;
        s_infer_max_us = 0;
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "gas_ews_model_infer failed (%s)", esp_err_to_name(err));
    }
    gas_ews_set_model_result(steps, p, err == ESP_OK);
}

static bool read_fan(bool *on)
{
    bool states[RELAY_CHANNEL_COUNT];
    if (relay_get_all(states) != ESP_OK) {
        return false;
    }
    *on = states[CONFIG_SA_AI_FAN_RELAY_CHANNEL - 1];
    return true;
}

/**
 * @brief Detects "someone else (app tap, or another controller) switched off
 * the Fan the AI had switched on" -- a pure poll-and-compare, no changes to
 * relay.c/mqtt.c needed. The AI then gives up ownership and stays hands-off
 * for SA_AI_OVERRIDE_COOLDOWN_MIN minutes instead of switching the Fan
 * straight back on.
 *
 * Only called while device_mode is ON: device_mode OFF forces every relay
 * off and is handled separately in the task loop.
 */
static bool external_override_active(void)
{
    bool fan_on;
    if (s_ai_owns_fan && read_fan(&fan_on) && !fan_on) {
        s_ai_owns_fan = false;
        s_override_until_ms = now_ms() + (int64_t)CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN * 60 * 1000;
        ESP_LOGW(TAG, "Fan switched off externally (app or another controller) -- "
                      "AI backing off for %d min",
                 CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN);
    }
    return now_ms() < s_override_until_ms;
}

/** Switch the Fan off if (and only if) the AI is the one that switched it on. */
static void release_fan(const char *reason)
{
    if (!s_ai_owns_fan) {
        return;
    }
    esp_err_t err = relay_set(CONFIG_SA_AI_FAN_RELAY_CHANNEL, false);
    if (err != ESP_OK) {
        ESP_LOGI(TAG, "relay_set(Fan, off) not applied: %s", esp_err_to_name(err));
        return;
    }
    s_ai_owns_fan = false;
    ESP_LOGI(TAG, "AI switched Fan off (%s)", reason);
}

static void beep_for_level(gas_ews_level_t level)
{
    /* Early warning: 3 short beeps. Exceeded: 5 long beeps. Both differ from
     * relay.c's single confirmation beep on a plain relay toggle. */
    static const buzzer_pattern_step_t kEarly[] = {
        {.enabled = true, .duration_ms = 120}, {.enabled = false, .duration_ms = 100},
        {.enabled = true, .duration_ms = 120}, {.enabled = false, .duration_ms = 100},
        {.enabled = true, .duration_ms = 120},
    };
    static const buzzer_pattern_step_t kExceeded[] = {
        {.enabled = true, .duration_ms = 400}, {.enabled = false, .duration_ms = 150},
        {.enabled = true, .duration_ms = 400}, {.enabled = false, .duration_ms = 150},
        {.enabled = true, .duration_ms = 400}, {.enabled = false, .duration_ms = 150},
        {.enabled = true, .duration_ms = 400}, {.enabled = false, .duration_ms = 150},
        {.enabled = true, .duration_ms = 400},
    };
    if (level == GAS_EWS_EXCEEDED) {
        buzzer_beep_pattern(kExceeded, sizeof(kExceeded) / sizeof(kExceeded[0]));
    } else if (level == GAS_EWS_EARLY_WARNING) {
        buzzer_beep_pattern(kEarly, sizeof(kEarly) / sizeof(kEarly[0]));
    }
}

static void apply_decision(gas_ews_level_t prev)
{
    if (!AI_CONTROLS_RELAY) {
        return; /* observe-only: publish ai/state, never touch relay/buzzer */
    }

    if (s_level > prev) {
        beep_for_level(s_level);
    }

    if (external_override_active()) {
        ESP_LOGI(TAG, "AI decision computed but Fan is under external override -- not applying");
        return;
    }

    if ((int)s_level < CONFIG_SA_AI_FAN_ON_LEVEL) {
        release_fan(kLevelName[s_level]);
        return;
    }

    bool fan_on;
    if (s_ai_owns_fan || !read_fan(&fan_on) || fan_on) {
        return; /* already ours, unreadable, or switched on by a user -- leave it */
    }
    esp_err_t err = relay_set(CONFIG_SA_AI_FAN_RELAY_CHANNEL, true);
    if (err != ESP_OK) {
        /* relay.c itself rejects writes when device_mode is off -- not a
         * fault of the AI layer, just log at INFO. */
        ESP_LOGI(TAG, "relay_set(Fan, on) not applied: %s", esp_err_to_name(err));
        return;
    }
    s_ai_owns_fan = true;
    ESP_LOGI(TAG, "AI switched Fan on (%s)", kLevelName[s_level]);
}

static void ai_scheduler_task(void *arg)
{
    (void)arg;

    int64_t init_t0 = esp_timer_get_time();
    s_model_ready = gas_ews_model_init() == ESP_OK;
    ESP_LOGI(TAG, "gas_ews_model_init (AllocateTensors + 2-window self-test): %lld us",
             (long long)(esp_timer_get_time() - init_t0));
    if (!s_model_ready) {
        ESP_LOGE(TAG, "gas_ews model unavailable this boot -- QCVN STEL/TWA rule and "
                      "projection early warning still active");
    }

    ESP_LOGI(TAG, "ai_scheduler started: QCVN 03:2019/BYT CO STEL/TWA %.1f/%.1f ppm, NO2 %.2f/%.2f ppm; "
                  "controls_relay=%d, fan_channel=%d, fan_on_level=%d, override_cooldown=%d min, topic=%s",
             (double)GAS_EWS_STEL_CO_PPM, (double)GAS_EWS_TWA_CO_PPM, (double)GAS_EWS_STEL_NO2_PPM,
             (double)GAS_EWS_TWA_NO2_PPM, AI_CONTROLS_RELAY, CONFIG_SA_AI_FAN_RELAY_CHANNEL,
             CONFIG_SA_AI_FAN_ON_LEVEL, CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN, s_ai_state_topic);

    gas_ews_level_t last_gas_level[GAS_EWS_NUM_GASES] = {GAS_EWS_SAFE, GAS_EWS_SAFE};
    bool last_model_ok = false, last_warmup = true;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(AI_SCHEDULER_TICK_MS));

        if (!device_mode_get()) {
            /* device_mode OFF forces every relay off (and pauses sensor_task,
             * which gas_ews sees as an outage -> preheat again). Forget
             * ownership now, so the Fan being off once device_mode is back ON
             * is not mistaken for a manual override. */
            s_ai_owns_fan = false;
            continue;
        }

        if (AI_CONTROLS_RELAY) {
            /* Keep override detection warm on every tick, so a manual toggle
             * is noticed within one tick. */
            external_override_active();
        }

        run_model_on_new_step();
        gas_ews_get_status(&s_status);

        gas_ews_level_t prev = s_level;
        s_level = s_status.level[GAS_EWS_CO] > s_status.level[GAS_EWS_NO2] ? s_status.level[GAS_EWS_CO]
                                                                           : s_status.level[GAS_EWS_NO2];
        bool changed = s_status.model_ok != last_model_ok || s_status.warmup != last_warmup;
        for (int g = 0; g < GAS_EWS_NUM_GASES; g++) {
            if (s_status.level[g] != last_gas_level[g]) {
                ESP_LOGW(TAG, "%s: %s -> %s (ppm=%.2f STEL=%.2f TWA=%.2f proj=%.2f p=%.2f)", kGasKey[g],
                         kLevelName[last_gas_level[g]], kLevelName[s_status.level[g]], (double)s_status.ppm[g],
                         (double)s_status.stel[g], (double)s_status.twa[g], (double)s_status.proj[g],
                         (double)s_status.p_model[g]);
                last_gas_level[g] = s_status.level[g];
                changed = true;
            }
        }
        last_model_ok = s_status.model_ok;
        last_warmup = s_status.warmup;

        if (changed || now_ms() - s_last_publish_ms >= AI_STATE_PERIOD_MS) {
            publish_ai_state();
        }
        if (changed || s_level != prev) {
            apply_decision(prev);
        }
    }
}

esp_err_t ai_scheduler_start(const char *device_id)
{
    if (device_id == NULL || device_id[0] == '\0') {
        ESP_LOGE(TAG, "ai_scheduler_start requires non-empty device_id");
        return ESP_ERR_INVALID_ARG;
    }

    strlcpy(s_device_id, device_id, sizeof(s_device_id));
    snprintf(s_ai_state_topic, sizeof(s_ai_state_topic), "device/%s/ai/state", s_device_id);

    BaseType_t rc = xTaskCreatePinnedToCore(
        ai_scheduler_task, AI_SCHEDULER_TASK_NAME, AI_SCHEDULER_TASK_STACK_SIZE, NULL,
        AI_SCHEDULER_TASK_PRIORITY, NULL, APP_CPU_NUM);
    if (rc != pdPASS) {
        ESP_LOGE(TAG, "xTaskCreatePinnedToCore failed");
        return ESP_FAIL;
    }
    return ESP_OK;
}

#else /* !CONFIG_SA_AI_ENABLED */

esp_err_t ai_scheduler_start(const char *device_id)
{
    (void)device_id;
    return ESP_OK; /* strictly opt-in feature -- no-op, zero footprint when disabled */
}

#endif /* CONFIG_SA_AI_ENABLED */
