# `ai/` — On-device AQI alert inference for ESP32-S3

> **2026-09-25 — luồng này đã bị THAY THẾ** bởi [`gas_ews/`](gas_ews/README.md): cảnh báo sớm CO/NO2
> theo QCVN 03:2019/BYT, chạy trực tiếp trên ppm của GM702B/GM102B. Mô hình PM2.5 bên dưới được
> đánh giá là không phù hợp (học từ trạm quan trắc ngoài trời, trạm 4 hỏng cảm biến T/H, CO của
> thiết bị nằm ngoài phân phối huấn luyện). `ai_input`/`ai_inference` được giữ lại trong thư mục để
> tham khảo nhưng đã bỏ khỏi `firmware/CMakeLists.txt`; `ai_scheduler` giờ dùng `gas_ews`.
> Phần còn lại của file này mô tả luồng cũ.


Runs the best-performing AQI alert model from the `ungdungdidong` research repo directly on the
ESP32-S3, instead of depending on a server to run inference. It produces one **AI signal**
(`SAFE` / `ALERT`) that a small scheduler publishes over MQTT and — only when
`CONFIG_SA_AI_CONTROL_RELAY=y` (default: observe-only) — uses to auto-control the Fan relay. It never talks to
GPIO/relay drivers except through the existing `relay`/`buzzer` components, and it never fights a
human for control of the relay (see "Relay ownership" below; `aiot-edge` has no competing
server-side auto-control service, unlike the sibling `smart-air-cps` repo this module was
originally prototyped against — see § 4).

```
Sensors (SHT3x/GM702B/GM102B, polled every 5s by sensor_task)
        │
        ▼
ai_input_feed_sample()      -- hourly-averaging ring buffer (ai/ai_input)
        │  live window every SA_AI_INFER_INTERVAL_SEC (default 60s): 23 finalized
        │  hours + running mean of the in-progress hour; < 24h → edge-padded,
        │  flagged "provisional" (SA_AI_WARMUP_PADDING)
        ▼
ai_infer()                  -- TFLite Micro, 2-model ensemble (ai/ai_inference)
        │
        ▼
ai_result_t { ready, p_alert }   -- ensemble-averaged P(canh_bao)
        │
        ▼
ai_scheduler                -- FreeRTOS task (ai/ai_scheduler)
        │  - threshold (SA_AI_ALERT_THRESHOLD_PCT) + hysteresis (ON/OFF_EVALS) → model ALERT
        │  - OR absolute CO/NO2 limits on a ~30s EMA, checked every 5s
        │    (SA_AI_RULE_CO_UGM3 / SA_AI_RULE_NO2_UGM3) → immediate ALERT
        │  - device/{id}/ai/state  (MQTT, new topic, telemetry only)
        │  - only if SA_AI_CONTROL_RELAY=y: Fan on + 3 short beeps on ALERT,
        │    Fan off on SAFE only if the AI switched it on (see § 4)
        ▼
relay component (unchanged) → Fan GPIO
```

## 1. Model contract

Source: `ungdungdidong` repo, model selection documented in `Tien_Trinh.md` and
`Thu_Nghiem_3_Huong_Alert_Recall_90.md` mục 7. The deployed decision is **not one model** — it's a
soft-vote ensemble of 2 binary (an_toàn/cảnh_báo) checkpoints, transfer-learned from a Beijing
pretrain backbone, which reached the best safety trade-off found in that project (87.3% alert
recall / 15.9% false alarm on the HCMC test set, vs. 74.6%/14.2% for the original single-model
baseline):

| | |
|---|---|
| Member models | `outputs_binary_beijing_freeze`, `outputs_binary_beijing_nofreeze` |
| Architecture | `CNN1DEncoder(num_classes=2)` — stem Conv1D → 3× depthwise-separable Conv1D → GAP → Dense(64→2), 4,530 params each |
| Input | `(1, 4, 24)` float32 — 24 **consecutive hourly** samples, channel order **[Temperature, Humidity, CO, NO2]** (fixed, matches real sensor order). Units: °C, %RH, **µg/m³, µg/m³** — the gas drivers report ppm, so `sensor_task` converts with `AI_CO_PPM_TO_UGM3` (1145.6) / `AI_NO2_PPM_TO_UGM3` (1881.6) before feeding `ai_input` |
| Normalization | z-score, **identical for both models** (same HCMC train split): |
| | `mean = [27.4282, 58.9987, 1056.4513, 77.0846]` |
| | `std  = [4.4998, 27.3067, 644.6595, 42.7013]` |
| Output | 2-class softmax: `0 = an_toan (safe)`, `1 = canh_bao (alert)` |
| Decision | average the two models' softmax probabilities → `p_alert`; ALERT when `p_alert >= SA_AI_ALERT_THRESHOLD_PCT/100` (default 0.50 = the argmax the metrics above were measured with) for `SA_AI_ALERT_ON_EVALS` consecutive inferences (one every `SA_AI_INFER_INTERVAL_SEC`), back to SAFE after `SA_AI_ALERT_OFF_EVALS` inferences below it (default 1/5). Final state = model ALERT **or** the absolute CO/NO2 threshold rule. Trade-off table: `INTEGRATION_REVIEW.md` mục 4 |

Exported artifacts (from `ungdungdidong/src/export_tflite.py`, PyTorch → ONNX → onnx2tf → TFLite
INT8, full integer quantization):

| File | Size |
|---|---:|
| `ai/ai_inference/model/model_beijing_freeze_int8.tflite` | 14,664 bytes |
| `ai/ai_inference/model/model_beijing_nofreeze_int8.tflite` | 14,664 bytes |

Per-model quantization params (input/output scale & zero-point) are in
`ai/ai_inference/model/model_contract_{freeze,nofreeze}.json`. The C code reads these directly off
each model's own flatbuffer at runtime (`TfLiteTensor::params`) rather than hardcoding them, so
they only need to match — never be retyped.

### Model verification (host-side, done — see `model/AI_EXPORT_REPORT.md`)

Ran the full HCMC test set (3,590 windows, 63 true alert windows) through both the original
PyTorch models **and** the exported TFLite INT8 models, on a PC, before ever touching firmware:

| | PyTorch (original) | TFLite INT8 (exported) |
|---|---:|---:|
| Ensemble alert_recall | 87.30% | **87.30%** (identical) |
| Ensemble false_alarm_rate | 15.93% | 16.10% (+0.17pp) |
| Ensemble argmax agreement | — | 98.16% |

INT8 quantization did not change the safety-critical metric (alert_recall) at all, and only
degraded false_alarm_rate by 0.17 percentage points. Reproduce with:

```bash
cd ungdungdidong
python -m venv .venv_export && .venv_export/Scripts/pip install onnx onnx2tf tensorflow torch
.venv_export/Scripts/python -m src.export_tflite \
    --ckpt_dirs outputs_binary_beijing_freeze outputs_binary_beijing_nofreeze --out_dir ai_export
```

## 2. Windowing: bridging 5s sensor polling to a 24-HOUR training window

The model was trained on 24 **consecutive hourly** station readings. Firmware polls sensors every
`SA_SENSOR_POLLING_INTERVAL` seconds (default 5s) — a completely different cadence. Feeding the
last 24 raw 5s samples straight into the model (≈2 minutes of near-constant readings) would look
nothing like what the model learned.

`ai/ai_input` (pure C99, no ESP-IDF headers — see `ai_input.h`/`ai_input.c`) bridges this:

- every sensor sample is folded into a running mean for "the wall-clock hour it belongs to";
- when the hour rolls over, the finished hourly mean is pushed into a 24-slot ring buffer;
- **24h warm-up**: `ai_infer()` is never called until the ring buffer holds 24 contiguous hours.
  During warm-up (and after every reboot/OTA, since the buffer is **not** persisted to NVS — see
  "Known limitations") the AI scheduler publishes `{"ready": false, "warmup_hours_filled": N}` and
  never touches the relay;
- **gap handling**: if the wall clock jumps by more than 1 hour between two finalized hours (a
  reboot, a long outage, or an entire hour with zero valid sensor readings), the buffer resets and
  warm-up starts over — matches the training pipeline's own rule that a window is only valid
  across strictly consecutive hours (`ungdungdidong/src/data.py: pair_ok`). This avoids ever
  feeding the model a window with a hidden time discontinuity.

Verified independently of ESP-IDF with a plain host-compiler unit test (`ai/tools/test_ai_input_host.c`,
14 checks: warm-up, correct hour ordering, gap-reset, all-invalid-hour-reset, window version). All pass:

```bash
gcc -std=c99 -Wall -Iai/ai_input/include ai/tools/test_ai_input_host.c ai/ai_input/src/ai_input.c \
    -o /tmp/test_ai_input -lm && /tmp/test_ai_input
# -> "All tests passed."
```

## 3. API

```c
// ai/ai_input/include/ai_input.h
void ai_input_feed_sample(const ai_sensor_sample_t *sample);   // called by sensor_task, every poll
bool ai_input_get_window(float out[4][24]);                    // false during warm-up
bool ai_input_get_window_versioned(float out[4][24], uint32_t *version); // + counter, +1 per finalized hour
bool ai_input_is_ready(void);

// ai/ai_inference/include/ai_inference.h
esp_err_t ai_inference_init(void);
esp_err_t ai_infer(const float window[4][24], ai_result_t *out);  // ai_result_t: ready, signal (argmax), confidence, p_alert, error

// ai/ai_scheduler/include/ai_scheduler.h  -- the ONLY function the rest of firmware calls
esp_err_t ai_scheduler_start(const char *device_id);
```

`ai_scheduler_start()` is called once from `sysload_init()`, right after `sensor_task_start()`.
It is a **no-op** (no task created, zero relay/MQTT/buzzer calls ever) unless
`CONFIG_SA_AI_ENABLED=y` — strictly opt-in for the first hardware bring-up.

## 4. Relay ownership & conflict avoidance

`relay.c` was, and still is, **not modified**. Only ONE new writer exists: `ai_scheduler`, and it
only ever touches `CONFIG_SA_AI_FAN_RELAY_CHANNEL` (default 1 = Fan, per the app's own channel
labeling — `relay_1=Fan, relay_2=Lamp, relay_3=Filter`,
see `app/lib/screens/devices/device_dashboard_screen.dart`).

**Context from the sibling `smart-air-cps` repo** (a separate fork in the same `meeTeam05` org,
diverged from `aiot-edge` — see its own `Bao_Cao...` history): that repo has an extra
`server/ai-service/app.py`, an already-deployed cloud service that listens to
`device/+/telemetry` and publishes `relay_set` MQTT commands whenever a per-device `auto_mode` DB
flag is on. **`aiot-edge` does not have this** — as of this writing there is only ONE other
possible writer of the Fan relay here: a human tapping it in the app (which itself talks to the
`relay_set` command topic exactly like `smart-air-cps`'s cloud service would). The override
mechanism below was designed to cover both cases uniformly (it does not care WHO changed the
relay), so it still applies even though only the "human" case is currently possible in this repo
— and it would keep working unchanged if a similar server-side auto-control feature is ever added
to `aiot-edge` later.

Resolution (implemented, no changes to `relay.c`/`mqtt.c`/`sysload.c`/`server/` needed). All of
this applies only when `CONFIG_SA_AI_CONTROL_RELAY=y`; by default the AI is observe-only and never
touches the relay or buzzer.

- **Fan ownership:** on ALERT the AI switches the Fan on only if it is currently off, and remembers
  that it did so. On SAFE it switches the Fan off **only if the AI itself switched it on**. A Fan
  that a user switched on is never switched off by the AI.
- **Override:** every 30s `ai_scheduler` polls `relay_get_all()`. If a Fan the AI switched on is
  found off, someone else took over: the AI gives up ownership and stays hands-off for
  `CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN` minutes (default 30), so it does not switch it straight
  back on. It still runs inference and publishes `ai/state` every hour during the cooldown.
- **device_mode OFF** forces every relay off; the AI drops ownership without starting a cooldown,
  so this is not mistaken for a manual override.

Not handled: ownership is kept in RAM only. If the AI switched the Fan on and the device reboots
(relay state is restored from NVS), the AI no longer knows it owns that Fan and will not switch it
off. A user-facing `auto_mode` switch (app + shadow/command) is the long-term fix — see
`INTEGRATION_REVIEW.md` #5.

## 5. Fallback / fail-safe behavior

- `ai_inference_init()` failure (e.g. tensor arena too small) at boot → logged, `ai_scheduler` task
  exits immediately, firmware continues exactly as if `SA_AI_ENABLED=n`. Never crashes the device.
- `ai_infer()` failure on any given hour → logged, `ai/state` published with `ready:false`, relay
  untouched that hour; retried the next hour automatically.
- 24h warm-up → `ready:false`, relay untouched.
- A detected time gap while the AI had switched the Fan on → the stale decision is dropped and the
  Fan the AI switched on is switched off (rather than left on for the 24h+ warm-up).
- An external override → relay untouched for the cooldown window, AI signal still computed/published.

## 6. MQTT

New topic only, existing `telemetry`/`shadow` schemas are untouched (per
`docs/MQTT_PROTOCOL.md` — do not add fields to a schema the server validates strictly without also
updating server-side validation, which was out of scope here):

```
device/{device_id}/ai/state
{"ready": true, "ai_state": 0, "p_alert": 0.17, "threshold": 0.5, "controls_relay": false, "ts": 1777631761}
{"ready": false, "warmup_hours_filled": 6, "controls_relay": false, "ts": 1777631761}
```

`ai_state` is the hysteresis-filtered decision (0 = SAFE, 1 = ALERT); `p_alert` is the raw
ensemble probability for that hour, so thresholds can be re-evaluated offline from logged data.

```
```

The device must be allowed to publish this topic: `server/api/src/services/emqx.js` → `deviceRules()` includes `device/{id}/ai/state`. EMQX runs with `no_match = deny` + `deny_action = disconnect`, so a device whose ACL lacks this rule gets **disconnected** on every `ai/state` publish. ACL rules are only written when a device is first registered (`createDeviceUser`) — devices registered before this rule was added must have their ACL updated (re-register, or add the rule via the EMQX dashboard/API) before enabling `SA_AI_ENABLED`.

## 7. Build

```bash
cd firmware
idf.py menuconfig   # Smart-Air AI Scheduler -> enable "SA_AI_ENABLED" (observe-only);
                    # enable "SA_AI_CONTROL_RELAY" only after the observe-only trial
idf.py build
idf.py -p <PORT> flash monitor
```

**Not verified in this environment** — no ESP-IDF toolchain or ESP32-S3 board was available where
this was written (`IDF_PATH` unset, no `idf.py`). What WAS verified here:

- the exported `.tflite` models against the real PyTorch models on the real HCMC test set
  (§ "Model verification" above);
- the `ai/ai_input` windowing/ring-buffer logic, compiled and run with a plain host `gcc`
  (§ "Windowing" above);
- the exact op set required (`TRANSPOSE, RESHAPE, CONV_2D, RELU6, PAD, DEPTHWISE_CONV_2D, MEAN,
  FULLY_CONNECTED`), read directly off both `.tflite` files with
  `tf.lite.experimental.Analyzer.analyze()` — not guessed;
- the EMBED_FILES-generated linker symbol names in `ai_inference.cpp` follow ESP-IDF's documented
  convention but **were not link-tested**.

What is **not** verified and needs a real board: `idf.py build` itself (the esp-tflite-micro C++
API surface in `ai_inference.cpp` was written to match the upstream tflite-micro API as of the
ESP-IDF 5.4.x era, but could have drifted — fix any compile error against the actual dependency
version the component manager pulls), the EMBED_FILES symbol names actually linking, and every
runtime resource number below.

## 8. Benchmark checklist (run this once real hardware is available)

`CONFIG_SA_AI_TENSOR_ARENA_SIZE` defaults to 24KB — a rough estimate, not a measurement. After
flashing:

1. `idf.py build` → note **flash usage** (`.bin` size delta) and static **RAM usage**
   (`idf.py size` — look at `.bss`/`.data` for the `ai_inference`/`ai_scheduler` components).
2. Boot with `SA_AI_ENABLED=y`, watch UART for `ai_inference_init OK` — if you instead see
   `AllocateTensors failed`, raise `CONFIG_SA_AI_TENSOR_ARENA_SIZE` in menuconfig and rebuild.
3. Time one `ai_infer()` call (wrap it in `esp_timer_get_time()` before/after, or add
   `ESP_LOGI` timestamps around the call in `ai_scheduler.c`) — this runs at most once/hour so
   latency budget is generous, but confirm it doesn't block for an unreasonable amount of time.
4. Confirm via UART logs that `sensor_task`/MQTT keep their normal cadence while `ai_scheduler`
   is running (it's a separate, lower-priority task — should not need this, but verify once).
5. Feed fake sensor data for >24h (or temporarily shrink the window/warm-up for a bench test) and
   confirm (with `SA_AI_CONTROL_RELAY=y`) an ALERT transition drives the Fan relay + a buzzer
   beep, that switching the Fan off in the app suppresses AI control for the cooldown window, and
   that a Fan switched on in the app is not switched off by the AI.
6. Read the `stack high-water mark after first inference` log line and trim/raise
   `AI_SCHEDULER_TASK_STACK_SIZE` (currently 8192) accordingly.

## 9. Known limitations

1. **24h warm-up after every reboot/OTA** — the hourly ring buffer is not persisted to NVS
   (deliberate choice — avoids added NVS wear/complexity; accepted trade-off).
2. **Geographic/climate scope** — inherited from the underlying model (trained on HCMC data,
   tropical monsoon climate, traffic-dominated pollution sources); see `ungdungdidong/CLAUDE.md`
   mục 8 for the full caveat. Re-training for another region is out of scope here.
3. **Small positive test set** (63 alert windows) underlies the 87.3%/15.9% headline numbers —
   see `ungdungdidong/Thu_Nghiem_3_Huong_Alert_Recall_90.md` mục 7.5 for the caveat already
   documented there.
4. **App-driven relay changes** are handled by fan ownership + the override cooldown (§ 4), but
   there is no user-facing auto/manual switch yet and ownership is lost on reboot.
5. **High false-alarm share** — at the default threshold ~91% of ALERT hours on the HCMC test set
   are false alarms, and alert recall on the validation split is only ~61% (vs 87% on test). See
   `INTEGRATION_REVIEW.md` mục 4 before enabling relay control.

## 10. File map

```
ai/
├── ai_input/      -- hourly windowing ring buffer (pure C99, host-testable)
├── ai_inference/  -- TFLite Micro wrapper (2-model ensemble) + embedded .tflite models
├── ai_scheduler/  -- FreeRTOS task: relay/buzzer/MQTT glue, override cooldown, fail-safe
├── tools/
│   └── test_ai_input_host.c   -- host-side unit test for ai/ai_input
└── README.md      -- this file
```

Note: components are named `ai/ai_input`, `ai/ai_inference`, `ai/ai_scheduler` (prefixed, not just
`input`/`inference`/`scheduler`) because ESP-IDF derives a component's registered name from its
directory's basename, and bare names like "input" risk colliding with other components/managed
dependencies in the project's flat component namespace.
