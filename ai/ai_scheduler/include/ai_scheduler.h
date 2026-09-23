/**
 * @file ai_scheduler.h
 *
 * @brief The ONLY entry point the rest of firmware needs to know about the
 * `ai/` module: starts a FreeRTOS task that owns the whole
 * sensor -> ai_input -> ai_inference -> relay/buzzer/MQTT pipeline.
 *
 * Design constraints this module honors (see the approved plan and
 * ai/README.md for the full rationale):
 *   - never calls relay_set()/buzzer_beep_ms() directly from more than this
 *     one task -- it is the single source of AI-driven actuation;
 *   - never fights a human/app or the existing cloud `server/ai-service`
 *     for relay_1 (Fan): it detects "someone else changed the relay" by
 *     polling relay_get() and backs off for SA_AI_OVERRIDE_COOLDOWN_MIN
 *     minutes whenever that happens (see ai_scheduler.c);
 *   - never blocks sensor_task/MQTT/OTA -- runs as its own low-priority task;
 *   - fails safe: any ai_infer() error, or the 24h warm-up window, means
 *     "do nothing to the relay", never "guess".
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Start the AI scheduler task.
 *
 * No-op (returns ESP_OK immediately, creates no task) when
 * CONFIG_SA_AI_ENABLED is not set -- keeps this feature strictly opt-in for
 * the first hardware bring-up.
 *
 * @param device_id  same device_id used for MQTT topics elsewhere in
 *                   firmware (sensor_task, device_mode) -- used to build the
 *                   `device/{id}/ai/state` topic.
 */
esp_err_t ai_scheduler_start(const char *device_id);

#ifdef __cplusplus
}
#endif
