/**
 * @file ai.h
 *
 * @brief On-device AI runtime toggle (in-memory, not persisted to NVS).
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include "esp_err.h"
#include <stdbool.h>

/**
 * @brief Initialize the AI runtime state with the given device ID.
 *
 * @param[in] device_id Lowercase device identifier used for the shadow topic.
 *
 * @return ESP_OK on success, or ESP_ERR_INVALID_ARG for a NULL/empty ID.
 *
 * @note The enabled flag is reset to the Kconfig default
 *       (SA_AI_ENABLED_AT_BOOT) on every boot; it is never read from NVS.
 */
esp_err_t ai_init(const char *device_id);

/**
 * @brief Enable or disable AI inference at runtime.
 *
 * @param[in] enabled True to run inference, false to skip it.
 *
 * @return ESP_OK on success. The new state is published to the shadow
 *         (best effort; a publish failure is logged, not returned).
 */
esp_err_t ai_set_enabled(bool enabled);

/**
 * @brief Get the current AI runtime state.
 *
 * @return true if inference is enabled, false otherwise.
 */
bool ai_get_enabled(void);
