/**
 * @file ai_inference.cpp
 *
 * @brief TFLite Micro wrapper -- runs the 2-model binary (an_toan/canh_bao)
 * ensemble sequentially on ONE shared static tensor arena (never both models
 * resident at once -- keeps RAM to ~1x the larger model's working set
 * instead of 2x, see ai/README.md "RAM budget").
 *
 * NOTE ON VERIFICATION: this file could not be compiled against a real
 * ESP-IDF + esp-tflite-micro toolchain in the environment this was written
 * in (no ESP-IDF installed here -- see ai/README.md "Giới hạn đã biết").
 * The op set (TRANSPOSE, RESHAPE, CONV_2D, RELU6, PAD, DEPTHWISE_CONV_2D,
 * MEAN, FULLY_CONNECTED), tensor shapes, and quantization params below were
 * all read directly off the real exported .tflite files with TensorFlow's
 * own `tf.lite.experimental.Analyzer` (see model_contract_*.json +
 * AI_EXPORT_REPORT.md next to the models) -- NOT guessed. What is unverified
 * is the esp-tflite-micro C++ API surface itself (class/method names below
 * match the upstream tflite-micro API as of ESP-IDF 5.4.x-era
 * esp-tflite-micro releases); run `idf.py build` and fix any signature
 * drift before flashing -- see the build checklist in ai/README.md.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_inference.h"

#include "esp_log.h"

#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_log.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"

#include <cmath>
#include <cstring>

static const char *TAG = "ai_inference";

/* ---- Embedded model blobs -----------------------------------------------
 * CMakeLists.txt EMBED_FILES "model/model_beijing_freeze_int8.tflite" and
 * "model/model_beijing_nofreeze_int8.tflite" -- ESP-IDF's build system
 * turns each embedded file into a pair of linker symbols named
 * `_binary_<sanitized_relative_path>_start/_end` (relative to the component
 * dir, '/' and '.' replaced with '_'). */
extern const uint8_t g_model_freeze_start[] asm("_binary_model_model_beijing_freeze_int8_tflite_start");
extern const uint8_t g_model_freeze_end[]   asm("_binary_model_model_beijing_freeze_int8_tflite_end");
extern const uint8_t g_model_nofreeze_start[] asm("_binary_model_model_beijing_nofreeze_int8_tflite_start");
extern const uint8_t g_model_nofreeze_end[]   asm("_binary_model_model_beijing_nofreeze_int8_tflite_end");

/* Mean/std for z-score normalization -- IDENTICAL for both models (both
 * trained on the same HCMC train split, see model_contract_*.json "mean"/
 * "std"). Channel order [Temperature, Humidity, CO, NO2] -- must match
 * ai_input.h exactly. */
static const float kMean[AI_INPUT_NUM_CHANNELS] = {27.428219f, 58.998680f, 1056.451294f, 77.084610f};
static const float kStd[AI_INPUT_NUM_CHANNELS]  = {4.499771f, 27.306726f, 644.659546f, 42.701317f};

/* 8 distinct ops used by BOTH models (confirmed identical via
 * tf.lite.experimental.Analyzer on both .tflite files -- see
 * ai/inference/model/AI_EXPORT_REPORT.md). Registered once, shared across
 * both sequential model runs. */
static tflite::MicroMutableOpResolver<8> s_resolver;
static bool s_resolver_ready = false;

/* Tuned starting point -- MUST be re-checked on real hardware (ai/README.md
 * "Benchmark HOWTO"): this is a rough estimate for a model this small
 * (~4.5K params, largest intermediate activation ~32ch x 12 or x24 length
 * in INT8), not a measured value. */
#ifndef CONFIG_SA_AI_TENSOR_ARENA_SIZE
#define CONFIG_SA_AI_TENSOR_ARENA_SIZE (24 * 1024)
#endif
static uint8_t s_tensor_arena[CONFIG_SA_AI_TENSOR_ARENA_SIZE];

static void ensure_resolver(void)
{
    if (s_resolver_ready) {
        return;
    }
    s_resolver.AddTranspose();
    s_resolver.AddReshape();
    s_resolver.AddConv2D();
    s_resolver.AddRelu6();
    s_resolver.AddPad();
    s_resolver.AddDepthwiseConv2D();
    s_resolver.AddMean();
    s_resolver.AddFullyConnected();
    s_resolver_ready = true;
}

static esp_err_t validate_model(const uint8_t *data, const char *name)
{
    const tflite::Model *model = tflite::GetModel(data);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
        ESP_LOGE(TAG, "%s: schema version mismatch (model=%u, runtime=%u)",
                 name, model->version(), TFLITE_SCHEMA_VERSION);
        return ESP_FAIL;
    }
    return ESP_OK;
}

esp_err_t ai_inference_init(void)
{
    ensure_resolver();

    if (validate_model(g_model_freeze_start, "beijing_freeze") != ESP_OK) {
        return ESP_FAIL;
    }
    if (validate_model(g_model_nofreeze_start, "beijing_nofreeze") != ESP_OK) {
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "ai_inference_init OK (arena=%u bytes, 2 models embedded)",
             (unsigned)sizeof(s_tensor_arena));
    return ESP_OK;
}

/**
 * @brief Run ONE model on the window, write its 2-class softmax into probs_out.
 *
 * Quantizes the (already channel-first) window into the model's actual
 * runtime tensor layout (NHWC-ish (1,24,4) int8 -- onnx2tf converts the
 * exported ONNX graph, which is channel-first like PyTorch, into
 * TensorFlow's channel-last convention; confirmed directly against the
 * exported .tflite via tf.lite.experimental.Analyzer, see
 * model_contract_*.json "quant_info").
 */
static esp_err_t run_one_model(const uint8_t *model_data,
                                const float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN],
                                float probs_out[2])
{
    const tflite::Model *model = tflite::GetModel(model_data);

    tflite::MicroInterpreter interpreter(model, s_resolver, s_tensor_arena, sizeof(s_tensor_arena));
    if (interpreter.AllocateTensors() != kTfLiteOk) {
        ESP_LOGE(TAG, "AllocateTensors failed -- tensor arena too small "
                      "(CONFIG_SA_AI_TENSOR_ARENA_SIZE=%u); increase it and rebuild",
                 (unsigned)sizeof(s_tensor_arena));
        return ESP_ERR_NO_MEM;
    }

    TfLiteTensor *input = interpreter.input(0);
    if (input == nullptr || input->type != kTfLiteInt8) {
        ESP_LOGE(TAG, "unexpected input tensor (null or not INT8)");
        return ESP_FAIL;
    }

    const float in_scale = input->params.scale;
    const int32_t in_zero = input->params.zero_point;

    /* Layout: input tensor is (1, 24, 4) row-major -> flat index = t*4 + c. */
    for (int t = 0; t < AI_INPUT_WINDOW_LEN; t++) {
        for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
            float norm = (window[c][t] - kMean[c]) / kStd[c];
            int32_t q = (int32_t)lroundf(norm / in_scale) + in_zero;
            if (q < -128) q = -128;
            if (q > 127) q = 127;
            input->data.int8[t * AI_INPUT_NUM_CHANNELS + c] = (int8_t)q;
        }
    }

    if (interpreter.Invoke() != kTfLiteOk) {
        ESP_LOGE(TAG, "Invoke failed");
        return ESP_FAIL;
    }

    /* Find the 2-class logits output (the model also exposes a 64-dim
     * embedding output for the cloud LLM path -- ignored here, see
     * CLAUDE.md mục 2 in the ungdungdidong repo for that other use case). */
    TfLiteTensor *logits = nullptr;
    for (size_t i = 0; i < interpreter.outputs_size(); i++) {
        TfLiteTensor *out = interpreter.output(i);
        if (out != nullptr && out->dims->size >= 1 && out->dims->data[out->dims->size - 1] == 2) {
            logits = out;
            break;
        }
    }
    if (logits == nullptr || logits->type != kTfLiteInt8) {
        ESP_LOGE(TAG, "could not find 2-class INT8 logits output");
        return ESP_FAIL;
    }

    const float out_scale = logits->params.scale;
    const int32_t out_zero = logits->params.zero_point;
    float raw[2];
    raw[0] = (logits->data.int8[0] - out_zero) * out_scale;
    raw[1] = (logits->data.int8[1] - out_zero) * out_scale;

    float m = raw[0] > raw[1] ? raw[0] : raw[1];
    float e0 = expf(raw[0] - m);
    float e1 = expf(raw[1] - m);
    float sum = e0 + e1;
    probs_out[0] = e0 / sum;
    probs_out[1] = e1 / sum;
    return ESP_OK;
}

esp_err_t ai_infer(const float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN], ai_result_t *out)
{
    if (out == nullptr) {
        return ESP_ERR_INVALID_ARG;
    }
    out->ready = false;
    out->signal = AI_SIGNAL_SAFE;
    out->confidence = 0.0f;
    out->error = ESP_OK;

    if (window == nullptr) {
        out->error = ESP_ERR_INVALID_ARG;
        return out->error;
    }

    ensure_resolver();

    float probs_freeze[2];
    float probs_nofreeze[2];

    esp_err_t err = run_one_model(g_model_freeze_start, window, probs_freeze);
    if (err != ESP_OK) {
        out->error = err;
        return err;
    }
    err = run_one_model(g_model_nofreeze_start, window, probs_nofreeze);
    if (err != ESP_OK) {
        out->error = err;
        return err;
    }

    float avg_safe = 0.5f * (probs_freeze[0] + probs_nofreeze[0]);
    float avg_alert = 0.5f * (probs_freeze[1] + probs_nofreeze[1]);

    out->ready = true;
    out->error = ESP_OK;
    if (avg_alert > avg_safe) {
        out->signal = AI_SIGNAL_ALERT;
        out->confidence = avg_alert;
    } else {
        out->signal = AI_SIGNAL_SAFE;
        out->confidence = avg_safe;
    }
    return ESP_OK;
}
