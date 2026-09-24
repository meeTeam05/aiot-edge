/**
 * @file ai_types.h
 *
 * @brief Shared types for the AI signal produced by ai_inference and
 *        consumed by the ai task (ai.c).
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    AI_SIGNAL_SAFE = 0,   /**< "an_toan" -- matches model class 0 */
    AI_SIGNAL_ALERT = 1,  /**< "canh_bao" -- matches model class 1 */
} ai_signal_t;

typedef struct {
    bool ready;              /**< false during 24h warm-up or on model error -- caller must not act on `signal`. */
    ai_signal_t signal;      /**< only meaningful when ready == true. */
    float confidence;        /**< model softmax probability of `signal`, in [0.5, 1.0]. */
    esp_err_t error;         /**< ESP_OK, or the reason `ready` is false due to a real fault (vs. warm-up). */
} ai_result_t;

#ifdef __cplusplus
}
#endif
