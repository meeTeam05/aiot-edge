/**
 * @file ai.c
 *
 * @brief AI task: on every new gas_ews 10s step, runs the INT8 model on the
 *        20 min window, reports it back to gas_ews (which owns all alarm
 *        logic), beeps when the level rises and publishes
 *        device/{id}/ai/state on a change and every 60s.
 *
 * The QCVN STEL/TWA rule and the projection early warning live in gas_ews and
 * keep working when the model is missing or failed its boot self-test.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai.h"

#include "config.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "ai";

#if SA_ENABLE_AI

#include "buzzer.h"
#include "cJSON.h"
#include "esp_timer.h"
#include "gas_ews_model.h"
#include "mqtt.h"

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define AI_TASK_NAME         "ai_task"
#define AI_TASK_STACK_SIZE   8192   /* TFLM Invoke() + cJSON; check the high-water mark log */
#define AI_TASK_PRIORITY     3      /* below sensor_task(5) */
#define AI_STATE_PERIOD_MS   60000  /* ai/state heartbeat (ppm/STEL trend) even without changes */
#define AI_TIMING_REPORT_RUNS 360   /* 360 x 10s steps = log inference timing once per hour */

static portMUX_TYPE s_enabled_lock = portMUX_INITIALIZER_UNLOCKED;
static bool s_enabled = SA_AI_ENABLED_AT_BOOT; /* runtime default at every boot (not persisted) */
static TaskHandle_t s_task = NULL;
static char s_ai_state_topic[96] = {0};
static char s_shadow_topic[96] = {0};

static const char *const kLevelName[] = {"an_toan", "canh_bao_som", "vuot_nguong"};
static const char *const kGasKey[GAS_EWS_NUM_GASES] = {"co", "no2"};

static bool s_model_ready = false;          /* model loaded + self-test passed this boot */
static uint32_t s_fed_steps = 0;            /* last gas_ews step count seen by ai_feed_sample() */
static uint32_t s_model_steps = 0;          /* last step the model was run for */
static gas_ews_status_t s_status;
static gas_ews_level_t s_level = GAS_EWS_SAFE; /* max over both gases */
static float s_window[GAS_EWS_WINDOW_STEPS][GAS_EWS_NUM_CHANNELS]; /* 3.8 KB, static, not on the task stack */
static int64_t s_last_publish_ms = 0;

#if CONFIG_SA_AI_REPLAY
/* Bench test: the AI input comes from ai_replay_data.h instead of the sensors
 * (see Kconfig SA_AI_REPLAY). Decoding must match export_replay.py. */
#include "ai_replay_data.h"
_Static_assert(CONFIG_SA_AI_REPLAY_SCENARIO < AI_REPLAY_SCENARIO_COUNT, "unknown SA_AI_REPLAY_SCENARIO");
static const ai_replay_scenario_t *const s_replay = &k_replay_scenarios[CONFIG_SA_AI_REPLAY_SCENARIO];
static uint32_t s_replay_idx = 0;

static float replay_decode(uint16_t v, float scale, float offset)
{
    return v == 0xFFFFu ? NAN : (float)v / scale - offset;
}

/** Overwrite the sensor values of `x` with the next replay sample; false once the scenario ended. */
static bool replay_next(gas_ews_sample_t *x)
{
    if (s_replay_idx >= s_replay->count) {
        if (s_replay_idx == s_replay->count) {
            ESP_LOGW(TAG, "replay '%s' finished (%u samples) -- AI gets no more input; reboot to replay again",
                     s_replay->name, (unsigned)s_replay->count);
            s_replay_idx++;
        }
        return false;
    }
    const uint16_t *v = s_replay->s[s_replay_idx++];
    x->co_ppm = replay_decode(v[0], 10.0f, 0.0f);
    x->no2_ppm = replay_decode(v[1], 1000.0f, 0.0f);
    x->temp_c = replay_decode(v[2], 100.0f, 40.0f);
    x->rh_pct = replay_decode(v[3], 100.0f, 0.0f);
    x->co_valid = !isnan(x->co_ppm);
    x->no2_valid = !isnan(x->no2_ppm);
    x->th_valid = !isnan(x->temp_c) && !isnan(x->rh_pct);
    if (s_replay_idx == 1 || s_replay_idx % 60 == 0) {
        ESP_LOGI(TAG, "replay '%s': sample %u/%u (%u min)", s_replay->name, (unsigned)s_replay_idx,
                 (unsigned)s_replay->count, (unsigned)(s_replay_idx * 5 / 60));
    }
    return true;
}
#endif

static bool s_stack_logged = false;
static uint32_t s_infer_runs = 0;
static int64_t s_infer_sum_us = 0;
static int64_t s_infer_max_us = 0;

/* Early warning: three long beeps. Limit exceeded: four very long beeps.
 * Both fit the buzzer queue depth (8 steps) and differ from the relay /
 * device_mode confirmation beeps. */
static const buzzer_pattern_step_t kEarlyPattern[] = {
    {.enabled = true, .duration_ms = 400},
    {.enabled = false, .duration_ms = 120},
    {.enabled = true, .duration_ms = 400},
    {.enabled = false, .duration_ms = 120},
    {.enabled = true, .duration_ms = 400},
};
static const buzzer_pattern_step_t kExceededPattern[] = {
    {.enabled = true, .duration_ms = 800},
    {.enabled = false, .duration_ms = 150},
    {.enabled = true, .duration_ms = 800},
    {.enabled = false, .duration_ms = 150},
    {.enabled = true, .duration_ms = 800},
    {.enabled = false, .duration_ms = 150},
    {.enabled = true, .duration_ms = 800},
};

static int64_t now_ms(void)
{
    return esp_timer_get_time() / 1000;
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
#if CONFIG_SA_AI_REPLAY
    cJSON_AddStringToObject(root, "replay", s_replay->name); /* not real sensor data */
#endif
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

/* Mirrors relay.c's relay_publish_delta(); "mode" is hardcoded since the
 * caller only runs while device mode is on. */
static esp_err_t ai_publish_shadow_delta(bool enabled)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        ESP_LOGE(TAG, "ai_publish_shadow_delta: cJSON_CreateObject failed");
        return ESP_ERR_NO_MEM;
    }

    cJSON_AddStringToObject(root, "mode", "on");
    cJSON_AddBoolToObject(root, "ai_enabled", enabled);
    cJSON_AddNumberToObject(root, "ts", (double)time(NULL));

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        ESP_LOGE(TAG, "ai_publish_shadow_delta: cJSON_PrintUnformatted failed");
        return ESP_ERR_NO_MEM;
    }

    int msg_id = mqtt_publish(s_shadow_topic, payload, 1, false);
    cJSON_free(payload);

    if (msg_id < 0) {
        ESP_LOGW(TAG, "mqtt_publish failed; MQTT not ready yet");
        return ESP_FAIL;
    }

    return ESP_OK;
}

static void record_timing(uint32_t steps, int64_t t0_us, int64_t dt_us)
{
    if (!s_stack_logged) {
        ESP_LOGI(TAG, "first inference at %lld s after boot (step %u): %lld us; stack high-water mark: %u bytes free",
                 (long long)(t0_us / 1000000), (unsigned)steps, (long long)dt_us,
                 (unsigned)uxTaskGetStackHighWaterMark(NULL));
        s_stack_logged = true;
    }
    s_infer_runs++;
    s_infer_sum_us += dt_us;
    if (dt_us > s_infer_max_us) {
        s_infer_max_us = dt_us;
    }
    if (s_infer_runs >= AI_TIMING_REPORT_RUNS) {
        ESP_LOGI(TAG, "inference timing: %u runs, avg %lld us, max %lld us", (unsigned)s_infer_runs,
                 (long long)(s_infer_sum_us / s_infer_runs), (long long)s_infer_max_us);
        s_infer_runs = 0;
        s_infer_sum_us = 0;
        s_infer_max_us = 0;
    }
}

/**
 * @brief On a new gas_ews step: run the model on the 20 min window if one is
 * available, otherwise report "no result" so gas_ews clears a stale model
 * alarm instead of trusting an old output.
 */
static void run_model_on_new_step(void)
{
    gas_ews_get_status(&s_status);
    if (s_status.steps == s_model_steps) {
        return;
    }
    s_model_steps = s_status.steps;

    uint32_t steps = s_status.steps;
    if (!s_model_ready || !gas_ews_get_window(&steps, s_window)) {
        gas_ews_set_model_result(steps, NULL, false);
        return;
    }
    float p[GAS_EWS_NUM_GASES];
    int64_t t0 = esp_timer_get_time();
    esp_err_t err = gas_ews_model_infer(s_window, p);
    record_timing(steps, t0, esp_timer_get_time() - t0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "gas_ews_model_infer failed (%s)", esp_err_to_name(err));
    }
    gas_ews_set_model_result(steps, p, err == ESP_OK);
}

static void ai_task(void *arg)
{
    (void)arg;

    gas_ews_level_t last_gas_level[GAS_EWS_NUM_GASES] = {GAS_EWS_SAFE, GAS_EWS_SAFE};
    bool last_model_ok = false, last_warmup = true, was_enabled = false;

    while (1) {
        /* Woken by ai_feed_sample() on every new 10s gas_ews step. */
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        if (!ai_get_enabled()) {
            was_enabled = false;
            continue;
        }
        bool just_enabled = !was_enabled;
        was_enabled = true;

        run_model_on_new_step();
        gas_ews_get_status(&s_status);

        gas_ews_level_t prev = s_level;
        s_level = s_status.level[GAS_EWS_CO] > s_status.level[GAS_EWS_NO2] ? s_status.level[GAS_EWS_CO]
                                                                           : s_status.level[GAS_EWS_NO2];
        bool changed = just_enabled || s_status.model_ok != last_model_ok || s_status.warmup != last_warmup;
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

        if (s_level > prev) {
            if (s_level == GAS_EWS_EXCEEDED) {
                buzzer_beep_pattern(kExceededPattern, sizeof(kExceededPattern) / sizeof(kExceededPattern[0]));
            } else {
                buzzer_beep_pattern(kEarlyPattern, sizeof(kEarlyPattern) / sizeof(kEarlyPattern[0]));
            }
        }
        if (changed || now_ms() - s_last_publish_ms >= AI_STATE_PERIOD_MS) {
            publish_ai_state();
        }
    }
}

esp_err_t ai_start(const char *device_id)
{
    if (device_id == NULL || device_id[0] == '\0') {
        ESP_LOGE(TAG, "ai_start requires non-empty device_id");
        return ESP_ERR_INVALID_ARG;
    }

    snprintf(s_ai_state_topic, sizeof(s_ai_state_topic), "device/%s/ai/state", device_id);
    snprintf(s_shadow_topic, sizeof(s_shadow_topic), "device/%s/shadow/report", device_id);

    int64_t init_t0 = esp_timer_get_time();
    s_model_ready = gas_ews_model_init() == ESP_OK;
    ESP_LOGI(TAG, "gas_ews_model_init (AllocateTensors + 2-window self-test): %lld us",
             (long long)(esp_timer_get_time() - init_t0));
    if (!s_model_ready) {
        ESP_LOGE(TAG, "gas_ews model unavailable this boot -- QCVN STEL/TWA rule and "
                      "projection early warning still active");
    }

    TaskHandle_t task = NULL;
    BaseType_t rc =
        xTaskCreatePinnedToCore(ai_task, AI_TASK_NAME, AI_TASK_STACK_SIZE, NULL, AI_TASK_PRIORITY, &task, APP_CPU_NUM);
    if (rc != pdPASS) {
        ESP_LOGE(TAG, "xTaskCreatePinnedToCore failed");
        return ESP_FAIL;
    }
    s_task = task;

#if CONFIG_SA_AI_REPLAY
    ESP_LOGW(TAG, "AI REPLAY MODE: scenario '%s', %u samples (~%u min) -- the AI ignores the real sensors",
             s_replay->name, (unsigned)s_replay->count, (unsigned)(s_replay->count * 5 / 60));
#endif
    ESP_LOGI(TAG, "ai started: QCVN 03:2019/BYT CO STEL/TWA %.1f/%.1f ppm, NO2 %.2f/%.2f ppm; "
                  "model window %d steps x 10s; topic=%s",
             (double)GAS_EWS_STEL_CO_PPM, (double)GAS_EWS_TWA_CO_PPM, (double)GAS_EWS_STEL_NO2_PPM,
             (double)GAS_EWS_TWA_NO2_PPM, GAS_EWS_WINDOW_STEPS, s_ai_state_topic);
    return ESP_OK;
}

void ai_feed_sample(const gas_ews_sample_t *sample)
{
    if (sample == NULL) {
        return;
    }
#if CONFIG_SA_AI_REPLAY
    gas_ews_sample_t replayed = *sample; /* keeps the real monotonic t_ms */
    if (!replay_next(&replayed)) {
        return;
    }
    sample = &replayed;
#endif
    /* gas_ews keeps its history even before ai_start()/while AI is switched
     * off, so the 10 min preheat and the model window are not restarted. */
    gas_ews_feed(sample);

    TaskHandle_t task = s_task;
    if (task == NULL) {
        return;
    }
    gas_ews_status_t st;
    gas_ews_get_status(&st);
    if (st.steps != s_fed_steps) {
        s_fed_steps = st.steps;
        xTaskNotifyGive(task);
    }
}

#else /* !SA_ENABLE_AI */

esp_err_t ai_start(const char *device_id)
{
    (void)device_id;
    return ESP_OK;
}

void ai_feed_sample(const gas_ews_sample_t *sample)
{
    (void)sample;
}

#endif /* SA_ENABLE_AI */

esp_err_t ai_set_enabled(bool enabled)
{
#if SA_ENABLE_AI
    bool changed = false;

    portENTER_CRITICAL(&s_enabled_lock);
    if (s_enabled != enabled) {
        s_enabled = enabled;
        changed = true;
    }
    portEXIT_CRITICAL(&s_enabled_lock);

    if (!changed) {
        return ESP_OK;
    }

    ESP_LOGI(TAG, "AI runtime switch set to %s", enabled ? "on" : "off");

    esp_err_t err = ai_publish_shadow_delta(enabled);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "AI state changed locally but shadow publish failed: %s", esp_err_to_name(err));
    }

    return ESP_OK;
#else
    (void)enabled;
    ESP_LOGW(TAG, "ai_set_enabled ignored: firmware built with SA_ENABLE_AI=n");
    return ESP_OK;
#endif
}

bool ai_get_enabled(void)
{
#if SA_ENABLE_AI
    bool enabled;

    portENTER_CRITICAL(&s_enabled_lock);
    enabled = s_enabled;
    portEXIT_CRITICAL(&s_enabled_lock);

    return enabled;
#else
    return false;
#endif
}
