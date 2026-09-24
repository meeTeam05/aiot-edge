/**
 * @file ai.c
 *
 * @brief AI task: runs the model when ai_input closes an hour, then on alert
 *        beeps the buzzer and publishes device/{id}/ai/state right away.
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

#include "ai_inference.h"
#include "ai_types.h"
#include "buzzer.h"
#include "cJSON.h"
#include "mqtt.h"

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#if CONFIG_SA_AI_SELF_TEST
#include "ai_selftest_vectors.h"
#endif

#define AI_TASK_NAME       "ai_task"
#define AI_TASK_STACK_SIZE 8192 /* TFLM Invoke() + cJSON */
#define AI_TASK_PRIORITY   3    /* below sensor_task(5) */

static portMUX_TYPE s_enabled_lock = portMUX_INITIALIZER_UNLOCKED;
static bool s_enabled = SA_AI_ENABLED_AT_BOOT; /* runtime default at every boot (not persisted) */
static TaskHandle_t s_task = NULL;
static char s_ai_state_topic[96] = {0};
static char s_shadow_topic[96] = {0};

/* Three long beeps, distinct from relay/device_mode patterns; stays within
 * the buzzer queue depth (8). */
static const buzzer_pattern_step_t kAlertPattern[] = {
    {.enabled = true, .duration_ms = 400},
    {.enabled = false, .duration_ms = 120},
    {.enabled = true, .duration_ms = 400},
    {.enabled = false, .duration_ms = 120},
    {.enabled = true, .duration_ms = 400},
};

static void publish_ai_state(const ai_result_t *result)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        ESP_LOGE(TAG, "publish_ai_state: cJSON_CreateObject failed");
        return;
    }

    cJSON_AddBoolToObject(root, "ready", result->ready);
    if (result->ready) {
        cJSON_AddBoolToObject(root, "alert", result->signal == AI_SIGNAL_ALERT);
        cJSON_AddNumberToObject(root, "ai_state", (double)result->signal);
        cJSON_AddNumberToObject(root, "confidence", (double)result->confidence);
    } else {
        cJSON_AddNumberToObject(root, "warmup_hours_filled", (double)ai_input_filled_hours());
    }
    cJSON_AddNumberToObject(root, "ts", (double)time(NULL));

    char *payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        if (mqtt_publish(s_ai_state_topic, payload, 1, false) < 0) {
            ESP_LOGW(TAG, "ai/state publish failed (MQTT not ready?)");
        } else {
            ESP_LOGI(TAG, "ai/state published: %s", payload);
        }
        cJSON_free(payload);
    }
    cJSON_Delete(root);
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

#if CONFIG_SA_AI_SELF_TEST
/* Runs known windows from ai_selftest_vectors.h against the reference result. */
static void run_self_test(void)
{
#if AI_SELFTEST_VECTOR_COUNT == 0
    ESP_LOGW(TAG, "self-test: no vectors (regenerate src/ai_selftest_vectors.h "
                  "with tools/gen_selftest_vectors.py)");
#else
    int passed = 0;
    for (size_t i = 0; i < AI_SELFTEST_VECTOR_COUNT; i++) {
        const ai_selftest_vector_t *v = &k_ai_selftest_vectors[i];
        ai_result_t result;
        esp_err_t err = ai_infer(v->window, &result);
        float p_alert = result.signal == AI_SIGNAL_ALERT ? result.confidence : 1.0f - result.confidence;
        bool ok = err == ESP_OK && result.ready && (int)result.signal == v->expected_signal &&
                  fabsf(p_alert - v->expected_p_alert) <= AI_SELFTEST_P_TOLERANCE;
        passed += ok ? 1 : 0;
        ESP_LOGI(TAG, "self-test [%s] %s: got signal=%d p_alert=%.4f, expected signal=%d p_alert=%.4f",
                 ok ? "PASS" : "FAIL", v->name, (int)result.signal, (double)p_alert, v->expected_signal,
                 (double)v->expected_p_alert);
    }
    ESP_LOGI(TAG, "self-test: %d/%u passed", passed, (unsigned)AI_SELFTEST_VECTOR_COUNT);
#endif
}
#endif

static void ai_task(void *arg)
{
    (void)arg;

#if CONFIG_SA_AI_SELF_TEST
    run_self_test();
#endif

    while (1) {
        /* Woken by ai_feed_sample() each time ai_input closes out an hour. */
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        if (!ai_get_enabled()) {
            continue;
        }

        float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
        if (!ai_input_get_window(window)) {
            ai_result_t warmup = {.ready = false, .signal = AI_SIGNAL_SAFE, .confidence = 0.0f, .error = ESP_OK};
            ESP_LOGI(TAG, "warming up: %u/%d hours filled", (unsigned)ai_input_filled_hours(), AI_INPUT_WINDOW_LEN);
            publish_ai_state(&warmup);
            continue;
        }

        ai_result_t result;
        esp_err_t err = ai_infer(window, &result);
        if (err != ESP_OK || !result.ready) {
            ESP_LOGE(TAG, "ai_infer failed (%s) -- no alert/safe reported this hour", esp_err_to_name(err));
            continue;
        }

        ESP_LOGI(TAG, "AI signal = %s (confidence=%.3f)", result.signal == AI_SIGNAL_ALERT ? "ALERT" : "SAFE",
                 (double)result.confidence);
        if (result.signal == AI_SIGNAL_ALERT) {
            buzzer_beep_pattern(kAlertPattern, sizeof(kAlertPattern) / sizeof(kAlertPattern[0]));
        }
        publish_ai_state(&result);
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

    esp_err_t err = ai_inference_init();
    if (err != ESP_OK) {
        return err;
    }

    TaskHandle_t task = NULL;
    BaseType_t rc =
        xTaskCreatePinnedToCore(ai_task, AI_TASK_NAME, AI_TASK_STACK_SIZE, NULL, AI_TASK_PRIORITY, &task, APP_CPU_NUM);
    if (rc != pdPASS) {
        ESP_LOGE(TAG, "xTaskCreatePinnedToCore failed");
        return ESP_FAIL;
    }
    s_task = task;

    ESP_LOGI(TAG, "ai started (topic=%s, window slot=%d s)", s_ai_state_topic, CONFIG_SA_AI_WINDOW_BUCKET_SEC);
    return ESP_OK;
}

void ai_feed_sample(const ai_sensor_sample_t *sample)
{
    TaskHandle_t task = s_task;
    if (task == NULL) {
        return; /* not started, or model/PSRAM init failed */
    }

    if (ai_input_feed_sample(sample)) {
        xTaskNotifyGive(task);
    }
}

#else /* !SA_ENABLE_AI */

esp_err_t ai_start(const char *device_id)
{
    (void)device_id;
    return ESP_OK;
}

void ai_feed_sample(const ai_sensor_sample_t *sample)
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
