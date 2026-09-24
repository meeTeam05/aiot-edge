/**
 * @file ai_inference.h
 *
 * @brief TFLite Micro wrapper for the on-device AQI alert model.
 *
 * Model contract (see `model/model_contract_freeze.json` and
 * `model/AI_EXPORT_REPORT.md`):
 *   - model:  `model_beijing_freeze_int8.tflite` (INT8, alert recall 82.54%
 *             on the HCMC test set, 98.22% argmax agreement with PyTorch).
 *   - input:  24h window, channel order [Temperature, Humidity, CO, NO2],
 *             CO/NO2 in ug/m3, z-score normalized with the training mean/std.
 *   - output: 2-class logits, class 0 = an_toan (safe), class 1 = canh_bao
 *             (alert); decision = argmax of the softmax.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include "ai_input.h"
#include "ai_types.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief One-time setup: allocates the tensor arena from PSRAM, validates the
 *        embedded model and allocates its tensors. Idempotent.
 *
 * @return ESP_OK, ESP_ERR_NO_MEM if PSRAM is unavailable or the arena is too
 *         small, or ESP_FAIL if the model is incompatible.
 */
esp_err_t ai_inference_init(void);

/**
 * @brief Run the model on one 24h window.
 *
 * Never crashes on a bad input/model fault -- returns an error code and
 * leaves *out with ready=false instead.
 *
 * @param window  window[channel][t], t=0 oldest hour .. t=23 newest hour
 *                (ai_input_get_window()'s output can be passed straight in).
 * @param out     Result; `ready` is true only on success.
 */
esp_err_t ai_infer(const float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN], ai_result_t *out);

#ifdef __cplusplus
}
#endif
