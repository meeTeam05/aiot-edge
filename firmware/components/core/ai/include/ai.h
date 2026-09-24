/**
 * @file ai.h
 *
 * @brief Public API of the on-device AI alert component.
 *
 * Pipeline: sensor_task -> ai_feed_sample() -> ai_input (24h window of
 * hourly means) -> when an hour closes, the ai task wakes up, runs the
 * TFLite Micro model and, on alert, beeps the buzzer and publishes
 * device/{id}/ai/state immediately (event-triggered, not tied to the
 * telemetry cycle). Relay control is intentionally NOT part of this module.
 *
 * With CONFIG_SA_ENABLE_AI=n every function is a no-op stub.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include "ai_input.h"
#include "esp_err.h"

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the model (PSRAM tensor arena) and start the ai task.
 *
 * A model/PSRAM failure is not fatal: the error is returned, no task is
 * started and ai_feed_sample() stays a no-op, so the caller can log it and
 * continue without AI. Returns ESP_OK immediately when AI is compiled out.
 *
 * @param device_id  Same device_id used for the other MQTT topics; used to
 *                   build `device/{id}/ai/state`.
 */
esp_err_t ai_start(const char *device_id);

/**
 * @brief Feed one sensor poll into the AI window. Call once per sensor cycle.
 *
 * Set `sample->valid = false` when any of the 4 readings is missing; that
 * poll is then skipped (not averaged in). Cheap and non-blocking: when the
 * sample closes out an hour it only notifies the ai task.
 */
void ai_feed_sample(const ai_sensor_sample_t *sample);

/**
 * @brief Runtime on/off switch (not persisted; every boot resets to the
 *        Kconfig default SA_AI_ENABLED_AT_BOOT). While disabled the window
 *        keeps filling but no inference, buzzer or publish happens.
 *
 * @return ESP_OK on success. The new state is published to the shadow
 *         (best effort; a publish failure is logged, not returned).
 */
esp_err_t ai_set_enabled(bool enabled);

/** @return Current runtime switch state; always false when AI is compiled out. */
bool ai_get_enabled(void);

#ifdef __cplusplus
}
#endif
