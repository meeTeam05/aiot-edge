/**
 * @file ai_inference.h
 *
 * @brief TFLite Micro inference wrapper for the 2-model AQI alert ensemble.
 *
 * Model contract (see `ai/inference/model/model_contract_*.json`, generated
 * by `ungdungdidong/src/export_tflite.py`, and `ai/README.md` for the full
 * writeup):
 *   - input:  24h window, channel order [Temperature, Humidity, CO, NO2],
 *             z-score normalized with the mean/std baked into this file
 *             (identical for both models -- both trained on the same HCMC
 *             train split).
 *   - output: 2-class softmax, class 0 = an_toan (safe), class 1 =
 *             canh_bao (alert).
 *   - decision: average the softmax probabilities of BOTH models, then
 *             argmax -- this is the exact ensemble that reached 87.3% alert
 *             recall / 15.9% false alarm on the HCMC test set (see
 *             `Thu_Nghiem_3_Huong_Alert_Recall_90.md` mục 7 in the
 *             `ungdungdidong` repo, reproduced bit-for-bit post-quantization
 *             in `ai/inference/model/AI_EXPORT_REPORT.md`).
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
 * @brief One-time setup (validates both embedded models' schema version).
 *        Safe to call once from ai_scheduler_start(); idempotent.
 */
esp_err_t ai_inference_init(void);

/**
 * @brief Run the 2-model ensemble on one 24h window.
 *
 * Never crashes on a bad input/model fault -- returns an error code and
 * leaves *out with ready=false instead (see ai_types.h / fallback policy in
 * ai/README.md).
 *
 * @param window  window[channel][t], channel order per the contract above,
 *                t=0 oldest hour .. t=23 newest hour (ai_input_get_window()'s
 *                output can be passed straight through).
 */
esp_err_t ai_infer(const float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN], ai_result_t *out);

#ifdef __cplusplus
}
#endif
