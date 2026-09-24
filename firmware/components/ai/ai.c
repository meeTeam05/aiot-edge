/**
 * @file ai.c
 *
 * @brief On-device AI runtime toggle implementation.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai.h"

#include "config.h"
#include "esp_log.h"

#include "mqtt.h"

#include "cJSON.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

static const char *TAG = "ai";

static volatile bool s_enabled = SA_AI_ENABLED_AT_BOOT;
static char s_shadow_topic[96] = {0};

static esp_err_t ai_publish_delta(bool enabled)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        ESP_LOGE(TAG, "cJSON_CreateObject failed");
        return ESP_ERR_NO_MEM;
    }

    cJSON_AddBoolToObject(root, "ai_enabled", enabled);
    cJSON_AddNumberToObject(root, "ts", (double)time(NULL));

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        ESP_LOGE(TAG, "cJSON_PrintUnformatted failed");
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

esp_err_t ai_init(const char *device_id)
{
    if (device_id == NULL || device_id[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }

    snprintf(s_shadow_topic, sizeof(s_shadow_topic), "device/%s/shadow/report", device_id);
    s_enabled = SA_AI_ENABLED_AT_BOOT;

    ESP_LOGI(TAG, "init OK (enabled=%s, default from Kconfig)", s_enabled ? "true" : "false");
    return ESP_OK;
}

esp_err_t ai_set_enabled(bool enabled)
{
    s_enabled = enabled;
    ESP_LOGI(TAG, "AI inference %s", enabled ? "enabled" : "disabled");

    if (s_shadow_topic[0] == '\0') {
        return ESP_OK;
    }

    esp_err_t err = ai_publish_delta(enabled);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "AI state changed locally but shadow publish failed: %s", esp_err_to_name(err));
    }

    return ESP_OK;
}

bool ai_get_enabled(void)
{
    return s_enabled;
}
