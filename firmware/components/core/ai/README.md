# `components/core/ai` — On-device AQI alert (ESP32-S3)

Runs the INT8 TFLite Micro alert model from Hung's research repo (`ungdungdidong`) on the device.
On **alert** it beeps the buzzer and publishes `device/{id}/ai/state` right away. Relay control is
**out of scope** for this component; a separate task will handle it.

```
sensor_task (every SA_SENSOR_POLLING_INTERVAL, default 5 s)
   │  T, RH, CO, NO2 (+ timestamp); CO/NO2 converted ppm → µg/m³
   ▼
ai_feed_sample()          poll skipped (not averaged) unless all 4 values are valid
   │  ai_input: running mean per hour → 24-slot ring buffer
   │  hour closed → xTaskNotifyGive(ai_task)
   ▼
ai_task                   event-driven, no polling loop
   │  window not full → publish {"ready": false, "warmup_hours_filled": N}
   │  window full     → ai_infer()
   ▼
ALERT → buzzer (3 long beeps) + publish immediately
SAFE  → publish immediately
```

## 1. Configuration

| Option | Where | Default | Notes |
|---|---|---|---|
| `SA_ENABLE_AI` | `main/Kconfig.projbuild` → Peripheral Enable/Disable, mapped in `config.h` | `n` | `n` compiles the component to no-op stubs (no TFLM, no model in flash) |
| `SA_AI_TENSOR_ARENA_SIZE` | Smart-Air AI | 24576 | Allocated from PSRAM; boot log prints the bytes actually used |
| `SA_AI_WINDOW_BUCKET_SEC` | Smart-Air AI | 3600 | Keep 3600 for real use; e.g. 10 fills the window in ~4 min for bench tests |
| `SA_AI_SELF_TEST` | Smart-Air AI | `n` | Runs `ai_selftest_vectors.h` at boot and logs PASS/FAIL |
| `CONFIG_SPIRAM*` | `sdkconfig.defaults` | Octal, caps-alloc only | Only explicit `MALLOC_CAP_SPIRAM` allocations use PSRAM. Missing PSRAM → AI disabled, device still boots |

The buzzer only sounds if `SA_ENABLE_BUZZER=y` as well.

## 2. Model contract

| | |
|---|---|
| Model | `model/model_beijing_freeze_int8.tflite` (14,664 B), alert recall **82.54%**, 98.22% INT8/PyTorch argmax agreement (`model/AI_EXPORT_REPORT.md`) |
| Input | `(1, 24, 4)` INT8: 24 **consecutive hourly means**, channel order **[Temperature, Humidity, CO, NO2]**, units °C, %RH, µg/m³, µg/m³ |
| Normalization | z-score, `mean = [27.4282, 58.9987, 1056.4513, 77.0846]`, `std = [4.4998, 27.3067, 644.6595, 42.7013]` |
| Output | 2-class logits; `0 = an_toan (safe)`, `1 = canh_bao (alert)`; decision = argmax |
| Ops | TRANSPOSE, RESHAPE, CONV_2D, RELU6, PAD, DEPTHWISE_CONV_2D, MEAN, FULLY_CONNECTED |

The model reports the state of the **current** hour from the past 24 hours. The first result comes
about 24 h after boot, and the window restarts after a reboot/OTA or after any hour with no valid
sample, because the model was only trained on strictly consecutive hours.

## 3. API (`include/ai.h`)

```c
esp_err_t ai_start(const char *device_id);        // sysload, after sensor_task_start()
void      ai_feed_sample(const ai_sensor_sample_t *sample);  // sensor_task, every poll
esp_err_t ai_set_enabled(bool enabled);           // runtime switch for the MQTT "ai_set" command
bool      ai_get_enabled(void);
```

- The runtime switch is not persisted: every boot resets to the Kconfig default
  `SA_AI_ENABLED_AT_BOOT` (`y` by default) when built with `SA_ENABLE_AI=y`. While it is off, the
  window keeps filling, but nothing is inferred, beeped or published.
- On a real change, `ai_set_enabled()` publishes a shadow delta
  (`{"mode":"on","ai_enabled":<bool>,"ts":...}`) to `device/{id}/shadow/report`, the same way
  `relay.c` reports relay state.
- `ai_start()` failures (no PSRAM, arena too small, schema mismatch) are logged and the device keeps
  running without AI. It never reboots.

## 4. MQTT

```
device/{device_id}/ai/state      (QoS 1, not retained, once per hour)
{"ready":true,"alert":true,"ai_state":1,"confidence":0.91,"ts":1777631761}
{"ready":true,"alert":false,"ai_state":0,"confidence":0.83,"ts":1777631761}
{"ready":false,"warmup_hours_filled":6,"ts":1777631761}
```

If an hour has no result (warm-up, or inference error), no `alert`/`safe` is reported for that
hour.

EMQX runs with `no_match = deny`, `deny_action = disconnect`. `server/api/src/services/emqx.js`
now allows this topic, but that ACL is only written when a device is registered. **Devices
registered earlier must get the rule added before AI is enabled on them**, otherwise every publish
disconnects them.

## 5. Testing

**Host unit test for the windowing logic:**
```bash
cd tools
gcc -std=c99 -Wall -I../include test_ai_input_host.c ../ai_input.c -o test_ai_input -lm && ./test_ai_input
```

**Model self-test (device output vs. reference):**
1. From known windows (shape `(N, 24, 4)`, raw units, `.npy`), run
   `python tools/gen_selftest_vectors.py windows.npy --expected-p p_alert_ref.npy`.
   This needs `numpy` plus `tensorflow` or `ai-edge-litert`. It writes `ai_selftest_vectors.h`
   and prints the host-TFLite vs. reference difference.
2. Build with `SA_ENABLE_AI=y`, `SA_AI_SELF_TEST=y`, flash, and check the boot log for
   `self-test: N/N passed`.

**End-to-end alert path without waiting 24 h:** set `SA_AI_WINDOW_BUCKET_SEC=10`. The window
fills in about 4 minutes, after which there is one result every 10 s.
- MQTT only: use the demo preset (`sdkconfig.demo`, synthetic sensor values) with
  `SA_ENABLE_AI=y`. Demo mode forces the buzzer off (`config.h`), so it cannot test the beep.
- Buzzer + MQTT: use a normal build on the real board with `SA_ENABLE_AI=y`,
  `SA_ENABLE_BUZZER=y`, and SHT3x + CO + NO2 all enabled and warmed up.

## 6. Known limitations

- Training data comes from an outdoor reference station, while the device uses uncalibrated
  indoor MEMS sensors, so calibrate (`calibrate_co` / `calibrate_no2`) before judging results.
- The decision threshold is fixed at 0.5 with no hysteresis. The test set has only 63 alert
  windows, and precision is low (many false alarms).
- The window is not persisted, so there is a 24 h warm-up after every reboot/OTA.

## 7. Files

```
components/core/ai/
├── include/ai.h                public API
├── include/ai_input.h          24h hourly-mean ring buffer (plain C, host-testable)
├── include/ai_inference.h      TFLite Micro wrapper
├── include/ai_types.h          ai_result_t / ai_signal_t
├── ai.c                        ai task, buzzer + MQTT, runtime switch, self-test runner
├── ai_input.c
├── ai_inference.cpp
├── ai_selftest_vectors.h       generated by tools/gen_selftest_vectors.py
├── model/                      .tflite, contract JSON, export report
└── tools/                      host unit test, self-test vector generator
```
