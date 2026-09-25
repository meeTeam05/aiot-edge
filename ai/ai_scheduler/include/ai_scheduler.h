/**
 * @file ai_scheduler.h
 *
 * @brief The ONLY entry point the rest of firmware needs to know about the
 * `ai/` module: starts a FreeRTOS task that owns the whole
 * sensor -> gas_ews (QCVN 03:2019/BYT) -> relay/buzzer/MQTT pipeline.
 *
 * Design constraints this module honors (see the approved plan and
 * ai/gas_ews/README.md for the full rationale):
 *   - never calls relay_set()/buzzer_beep_ms() directly from more than this
 *     one task -- it is the single source of AI-driven actuation;
 *   - observe-only unless SA_AI_CONTROL_RELAY=y: then it only publishes
 *     `device/{id}/ai/state`;
 *   - never fights a human/app or the existing cloud `server/ai-service`
 *     for the Fan: it only switches off a Fan it switched on itself, and if
 *     someone switches off "its" Fan it backs off for
 *     SA_AI_OVERRIDE_COOLDOWN_MIN minutes (see ai_scheduler.c);
 *   - never blocks sensor_task/MQTT/OTA -- runs as its own low-priority task;
 *   - reacts fast: gas_ews updates every 10s; the model predicts a QCVN
 *     STEL exceedance 10 min ahead on a 20 min window, and the QCVN rule
 *     (STEL 15 min / TWA 8h) runs independently of the model;
 *   - fails safe: a model that fails its boot self-test or an inference
 *     error only disables the model alarm, never the QCVN rule; without
 *     gas data (preheat, outage) the state is SAFE and an AI-owned Fan is
 *     released.
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
