/**
 * @file ai_inference.cpp
 *
 * @brief TFLite Micro wrapper for the INT8 alert model -- see ai_inference.h.
 *
 * The op set (TRANSPOSE, RESHAPE, CONV_2D, RELU6, PAD, DEPTHWISE_CONV_2D,
 * MEAN, FULLY_CONNECTED), tensor shapes and quantization params were read
 * off the exported .tflite with tf.lite.experimental.Analyzer (see
 * model/model_contract_freeze.json).
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#include "ai_inference.h"

#include "esp_heap_caps.h"
#include "esp_log.h"
#include "sdkconfig.h"

#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"

#include <cmath>
#include <new>

static const char *TAG = "ai_inference";

/* EMBED_FILES "model/model_beijing_freeze_int8.tflite" -- ESP-IDF names the
 * linker symbols after the file's basename only. */
extern const uint8_t g_model_start[] asm("_binary_model_beijing_freeze_int8_tflite_start");
extern const uint8_t g_model_end[] asm("_binary_model_beijing_freeze_int8_tflite_end");

/* Mean/std for z-score normalization, channel order [Temperature, Humidity,
 * CO, NO2] -- from model_contract_freeze.json, must match ai_input.h. */
static const float kMean[AI_INPUT_NUM_CHANNELS] = {27.428219f, 58.998680f, 1056.451294f, 77.084610f};
static const float kStd[AI_INPUT_NUM_CHANNELS] = {4.499771f, 27.306726f, 644.659546f, 42.701317f};

static tflite::MicroMutableOpResolver<8> s_resolver;
static uint8_t *s_arena = nullptr;

/* The interpreter is built once at init (placement new, no heap churn) and
 * reused for every inference; only the ai task touches it. */
alignas(tflite::MicroInterpreter) static uint8_t s_interpreter_buf[sizeof(tflite::MicroInterpreter)];
static tflite::MicroInterpreter *s_interpreter = nullptr;
static TfLiteTensor *s_input = nullptr;
static TfLiteTensor *s_logits = nullptr;

static esp_err_t register_ops(void)
{
    if (s_resolver.AddTranspose() != kTfLiteOk || s_resolver.AddReshape() != kTfLiteOk ||
        s_resolver.AddConv2D() != kTfLiteOk || s_resolver.AddRelu6() != kTfLiteOk ||
        s_resolver.AddPad() != kTfLiteOk || s_resolver.AddDepthwiseConv2D() != kTfLiteOk ||
        s_resolver.AddMean() != kTfLiteOk || s_resolver.AddFullyConnected() != kTfLiteOk) {
        ESP_LOGE(TAG, "op resolver registration failed");
        return ESP_FAIL;
    }
    return ESP_OK;
}

/* The model also exposes a 64-dim embedding output (used by the cloud path);
 * pick the 2-class logits tensor. */
static TfLiteTensor *find_logits_output(void)
{
    for (size_t i = 0; i < s_interpreter->outputs_size(); i++) {
        TfLiteTensor *out = s_interpreter->output(i);
        if (out != nullptr && out->dims->size >= 1 && out->dims->data[out->dims->size - 1] == 2) {
            return out;
        }
    }
    return nullptr;
}

esp_err_t ai_inference_init(void)
{
    if (s_interpreter != nullptr) {
        return ESP_OK;
    }

    const tflite::Model *model = tflite::GetModel(g_model_start);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
        ESP_LOGE(TAG, "schema version mismatch (model=%lu, runtime=%d)",
                 (unsigned long)model->version(), TFLITE_SCHEMA_VERSION);
        return ESP_FAIL;
    }

    if (register_ops() != ESP_OK) {
        return ESP_FAIL;
    }

    s_arena = static_cast<uint8_t *>(
        heap_caps_aligned_alloc(16, CONFIG_SA_AI_TENSOR_ARENA_SIZE, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (s_arena == nullptr) {
        ESP_LOGE(TAG, "tensor arena alloc failed (%u bytes from PSRAM, free PSRAM=%u) -- is PSRAM enabled/present?",
                 (unsigned)CONFIG_SA_AI_TENSOR_ARENA_SIZE,
                 (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
        return ESP_ERR_NO_MEM;
    }

    s_interpreter = new (s_interpreter_buf)
        tflite::MicroInterpreter(model, s_resolver, s_arena, CONFIG_SA_AI_TENSOR_ARENA_SIZE);
    if (s_interpreter->AllocateTensors() != kTfLiteOk) {
        ESP_LOGE(TAG, "AllocateTensors failed -- increase CONFIG_SA_AI_TENSOR_ARENA_SIZE (%u)",
                 (unsigned)CONFIG_SA_AI_TENSOR_ARENA_SIZE);
        goto fail;
    }

    s_input = s_interpreter->input(0);
    if (s_input == nullptr || s_input->type != kTfLiteInt8 ||
        s_input->bytes != AI_INPUT_NUM_CHANNELS * AI_INPUT_WINDOW_LEN) {
        ESP_LOGE(TAG, "unexpected input tensor (expected INT8 1x24x4)");
        goto fail;
    }

    s_logits = find_logits_output();
    if (s_logits == nullptr || s_logits->type != kTfLiteInt8) {
        ESP_LOGE(TAG, "could not find 2-class INT8 logits output");
        goto fail;
    }

    ESP_LOGI(TAG, "ai_inference_init OK (model=%u bytes, arena used %u/%u bytes in PSRAM)",
             (unsigned)(g_model_end - g_model_start), (unsigned)s_interpreter->arena_used_bytes(),
             (unsigned)CONFIG_SA_AI_TENSOR_ARENA_SIZE);
    return ESP_OK;

fail:
    s_interpreter->~MicroInterpreter();
    s_interpreter = nullptr;
    s_input = nullptr;
    s_logits = nullptr;
    heap_caps_free(s_arena);
    s_arena = nullptr;
    return ESP_FAIL;
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
    if (s_interpreter == nullptr) {
        out->error = ESP_ERR_INVALID_STATE;
        return out->error;
    }

    /* The runtime tensor is (1, 24, 4) row-major (onnx2tf converted the
     * channel-first ONNX graph to channel-last): flat index = t*4 + c. */
    const float in_scale = s_input->params.scale;
    const int32_t in_zero = s_input->params.zero_point;
    for (int t = 0; t < AI_INPUT_WINDOW_LEN; t++) {
        for (int c = 0; c < AI_INPUT_NUM_CHANNELS; c++) {
            float norm = (window[c][t] - kMean[c]) / kStd[c];
            int32_t q = (int32_t)lroundf(norm / in_scale) + in_zero;
            if (q < -128) {
                q = -128;
            }
            if (q > 127) {
                q = 127;
            }
            s_input->data.int8[t * AI_INPUT_NUM_CHANNELS + c] = (int8_t)q;
        }
    }

    if (s_interpreter->Invoke() != kTfLiteOk) {
        ESP_LOGE(TAG, "Invoke failed");
        out->error = ESP_FAIL;
        return out->error;
    }

    const float out_scale = s_logits->params.scale;
    const int32_t out_zero = s_logits->params.zero_point;
    float raw0 = (s_logits->data.int8[0] - out_zero) * out_scale;
    float raw1 = (s_logits->data.int8[1] - out_zero) * out_scale;

    float m = raw0 > raw1 ? raw0 : raw1;
    float e0 = expf(raw0 - m);
    float e1 = expf(raw1 - m);
    float p_alert = e1 / (e0 + e1);

    out->ready = true;
    if (p_alert > 0.5f) {
        out->signal = AI_SIGNAL_ALERT;
        out->confidence = p_alert;
    } else {
        out->signal = AI_SIGNAL_SAFE;
        out->confidence = 1.0f - p_alert;
    }
    return ESP_OK;
}
