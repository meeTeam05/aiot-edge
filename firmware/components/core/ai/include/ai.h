/**
 * @file ai.h
 *
 * @brief Public API of the on-device AI alert component.
 *
 * sensor_task -> ai_feed_sample() -> 24h window -> on hour close, infer,
 * beep + publish device/{id}/ai/state on alert. No relay control here.
 * No-op stubs when CONFIG_SA_ENABLE_AI=n.
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
 * @brief Init the model (PSRAM tensor arena) and start the ai task.
 *
 * A model/PSRAM failure is logged, not fatal; AI just stays off.
 * @param device_id  Used to build `device/{id}/ai/state` and the shadow topic.
 */
esp_err_t ai_start(const char *device_id);

/**
 * @brief Feed one sensor poll. Call once per sensor cycle.
 *
 * `sample->valid = false` skips that poll (not averaged in). Non-blocking.
 */
void ai_feed_sample(const ai_sensor_sample_t *sample);

/**
 * @brief Runtime on/off switch (not persisted, resets to SA_AI_ENABLED_AT_BOOT
 *        on every boot). Publishes the new state to the shadow (best effort).
 */
esp_err_t ai_set_enabled(bool enabled);

/** @return Current runtime switch state; false when AI is compiled out. */
bool ai_get_enabled(void);

#ifdef __cplusplus
}
#endif
