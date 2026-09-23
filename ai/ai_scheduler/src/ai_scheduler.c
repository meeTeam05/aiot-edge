/**
 * @file ai_scheduler.c
 *
 * @brief FreeRTOS task gluing ai_input + ai_inference to relay/buzzer/MQTT.
 *
 * See ai_scheduler.h for the design constraints this file implements
 * (single relay writer, override cooldown, fail-safe on error/warm-up).
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_scheduler.h"

#include "ai_inference.h"
#include "ai_input.h"

#include "buzzer.h"
#include "cJSON.h"
#include "device_mode.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mqtt.h"
#include "relay.h"

#include <string.h>
#include <time.h>

static const char *TAG = "ai_scheduler";

#define AI_SCHEDULER_TASK_NAME       "ai_scheduler"
#define AI_SCHEDULER_TASK_STACK_SIZE 4096
#define AI_SCHEDULER_TASK_PRIORITY   3   /* below sensor_task(5)/MQTT -- never contends for CPU with them */
#define AI_SCHEDULER_TICK_MS         30000u   /* housekeeping cadence: override detection + warm-up status */
#define AI_STATUS_PUBLISH_MIN_MS     600000u  /* throttle "still warming up" MQTT spam to once/10min */

#if CONFIG_SA_AI_ENABLED

static char s_ai_state_topic[96] = {0};
static char s_device_id[64] = {0};

static bool s_last_commanded_valid = false;
static bool s_last_commanded_on = false;
static ai_signal_t s_last_signal = AI_SIGNAL_SAFE;
static bool s_have_last_signal = false;

static int64_t s_override_until_ms = 0;   /* esp_timer-free -- use tick count in ms via xTaskGetTickCount */
static uint32_t s_last_infer_hour_bucket = 0;
static bool s_have_last_infer_hour = false;
static uint32_t s_last_status_publish_ms = 0;

static bool ai_disabled_permanently = false; /* set on ai_inference_init() failure -- fallback per mục 16 */

static uint32_t now_ms(void)
{
    return (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
}

static void publish_ai_state(const ai_result_t *result)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        ESP_LOGE(TAG, "publish_ai_state: cJSON_CreateObject failed");
        return;
    }

    cJSON_AddBoolToObject(root, "ready", result->ready);
    if (result->ready) {
        cJSON_AddNumberToObject(root, "ai_state", (double)result->signal);
        cJSON_AddNumberToObject(root, "confidence", (double)result->confidence);
    } else {
        cJSON_AddNumberToObject(root, "warmup_hours_filled", (double)ai_input_filled_hours());
    }
    cJSON_AddNumberToObject(root, "ts", (double)time(NULL));

    char *payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        int msg_id = mqtt_publish(s_ai_state_topic, payload, 1, false);
        if (msg_id < 0) {
            ESP_LOGW(TAG, "ai/state publish failed (MQTT not ready?)");
        }
        cJSON_free(payload);
    }
    cJSON_Delete(root);
    s_last_status_publish_ms = now_ms();
}

/**
 * @brief Detects "someone else (app tap, or the existing cloud
 * server/ai-service) just changed the Fan relay" by comparing its ACTUAL
 * state against what we last commanded -- no changes to relay.c/mqtt.c
 * needed, this is a pure poll-and-compare. On a mismatch, backs the AI
 * scheduler off that channel for SA_AI_OVERRIDE_COOLDOWN_MIN minutes.
 */
static bool external_override_active(void)
{
    uint32_t now = now_ms();

    if (s_last_commanded_valid) {
        bool actual_states[RELAY_CHANNEL_COUNT];
        if (relay_get_all(actual_states) == ESP_OK) {
            bool actual = actual_states[CONFIG_SA_AI_FAN_RELAY_CHANNEL - 1];
            if (actual != s_last_commanded_on) {
                uint32_t cooldown_ms = (uint32_t)CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN * 60u * 1000u;
                s_override_until_ms = now + cooldown_ms;
                s_last_commanded_valid = false; /* re-baseline once cooldown ends, see header comment */
                ESP_LOGW(TAG,
                         "Fan relay changed externally (app or another controller) -- "
                         "AI backing off for %d min",
                         CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN);
            }
        }
    }

    return now < (uint32_t)s_override_until_ms;
}

static void apply_decision(const ai_result_t *result)
{
    if (external_override_active()) {
        ESP_LOGI(TAG, "AI decision computed but Fan relay is under external override -- not applying");
        return;
    }

    bool desired_on = (result->signal == AI_SIGNAL_ALERT);
    esp_err_t err = relay_set(CONFIG_SA_AI_FAN_RELAY_CHANNEL, desired_on);
    if (err != ESP_OK) {
        /* relay.c itself rejects writes when device_mode is off -- not a
         * fault of the AI layer, just log at INFO. */
        ESP_LOGI(TAG, "relay_set(Fan, %d) not applied: %s", desired_on, esp_err_to_name(err));
        return;
    }
    s_last_commanded_on = desired_on;
    s_last_commanded_valid = true;

    bool alert_just_started = desired_on && (!s_have_last_signal || s_last_signal != AI_SIGNAL_ALERT);
    if (alert_just_started) {
        /* 3 short beeps -- distinct from relay.c's own single confirmation
         * beep on a plain relay toggle, so a listener can tell "AI just
         * raised an alert" apart from "someone flipped a relay". */
        static const buzzer_pattern_step_t kAlertPattern[] = {
            {.enabled = true, .duration_ms = 120},
            {.enabled = false, .duration_ms = 100},
            {.enabled = true, .duration_ms = 120},
            {.enabled = false, .duration_ms = 100},
            {.enabled = true, .duration_ms = 120},
        };
        buzzer_beep_pattern(kAlertPattern, sizeof(kAlertPattern) / sizeof(kAlertPattern[0]));
    }
    s_last_signal = result->signal;
    s_have_last_signal = true;
}

static void ai_scheduler_task(void *arg)
{
    (void)arg;

    if (ai_inference_init() != ESP_OK) {
        ESP_LOGE(TAG, "ai_inference_init failed -- AI permanently disabled this boot "
                      "(fallback: firmware continues exactly as if SA_AI_ENABLED=n)");
        ai_disabled_permanently = true;
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "ai_scheduler started (fan_channel=%d, override_cooldown=%d min, "
                  "topic=%s)",
             CONFIG_SA_AI_FAN_RELAY_CHANNEL, CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN, s_ai_state_topic);

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(AI_SCHEDULER_TICK_MS));

        if (!device_mode_get()) {
            continue; /* device is OFF -- sensor_task itself is paused too, nothing to do */
        }

        /* Keep override detection warm even on ticks with no new inference,
         * so a manual toggle is noticed within one tick (30s), not up to 1h. */
        external_override_active();

        if (!ai_input_is_ready()) {
            uint32_t elapsed = now_ms() - s_last_status_publish_ms;
            if (s_last_status_publish_ms == 0 || elapsed >= AI_STATUS_PUBLISH_MIN_MS) {
                ai_result_t warmup_result = {.ready = false, .signal = AI_SIGNAL_SAFE, .confidence = 0.0f, .error = ESP_OK};
                publish_ai_state(&warmup_result);
                ESP_LOGI(TAG, "warming up: %u/%d hours filled",
                         (unsigned)ai_input_filled_hours(), AI_INPUT_WINDOW_LEN);
            }
            continue;
        }

        uint32_t current_hour_bucket = (uint32_t)time(NULL) / 3600u;
        if (s_have_last_infer_hour && current_hour_bucket == s_last_infer_hour_bucket) {
            continue; /* already inferred for this hour */
        }

        float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN];
        if (!ai_input_get_window(window)) {
            continue; /* became not-ready between the check above and now (buffer just reset) */
        }

        ai_result_t result;
        esp_err_t err = ai_infer(window, &result);
        s_last_infer_hour_bucket = current_hour_bucket;
        s_have_last_infer_hour = true;

        if (err != ESP_OK || !result.ready) {
            ESP_LOGE(TAG, "ai_infer failed (%s) -- fail-safe: not touching relay this hour",
                     esp_err_to_name(err));
            publish_ai_state(&result);
            continue;
        }

        ESP_LOGI(TAG, "AI signal = %s (confidence=%.3f)",
                 result.signal == AI_SIGNAL_ALERT ? "ALERT" : "SAFE", (double)result.confidence);
        publish_ai_state(&result);
        apply_decision(&result);
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

    /* Baseline "last commanded" from the relay's actual current state so the
     * very first override check doesn't misfire against whatever state the
     * relay booted into. */
    bool actual_states[RELAY_CHANNEL_COUNT];
    if (relay_get_all(actual_states) == ESP_OK) {
        s_last_commanded_on = actual_states[CONFIG_SA_AI_FAN_RELAY_CHANNEL - 1];
        s_last_commanded_valid = true;
    }

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
