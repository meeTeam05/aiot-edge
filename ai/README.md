# `ai/` — On-device AQI alert inference for ESP32-S3

Runs the best-performing AQI alert model from the `ungdungdidong` research repo directly on the
ESP32-S3, instead of depending on a server to run inference. It produces one **AI signal**
(`SAFE` / `ALERT`) that a small scheduler uses to auto-control the Fan relay — it never talks to
GPIO/relay drivers except through the existing `relay`/`buzzer` components, and it never fights a
human for control of the relay (see "Relay ownership" below; `aiot-edge` has no competing
server-side auto-control service, unlike the sibling `smart-air-cps` repo this module was
originally prototyped against — see § 4).

```
Sensors (SHT3x/GM702B/GM102B, polled every 5s by sensor_task)
        │
        ▼
ai_input_feed_sample()      -- hourly-averaging ring buffer (ai/ai_input)
        │  (once per hour, once 24h of history exists)
        ▼
ai_infer()                  -- TFLite Micro, 2-model ensemble (ai/ai_inference)
        │
        ▼
AiSignal { SAFE | ALERT, confidence }
        │
        ▼
ai_scheduler                -- FreeRTOS task (ai/ai_scheduler)
        │  - device/{id}/ai/state  (MQTT, new topic, telemetry only)
        │  - relay_set(Fan, ...) + buzzer_beep_pattern() (3 short beeps) on
        │    ALERT, unless a human currently owns the Fan relay (override cooldown)
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
| Input | `(1, 4, 24)` float32 — 24 **consecutive hourly** samples, channel order **[Temperature, Humidity, CO, NO2]** (fixed, matches real sensor order) |
| Normalization | z-score, **identical for both models** (same HCMC train split): |
| | `mean = [27.4282, 58.9987, 1056.4513, 77.0846]` |
| | `std  = [4.4998, 27.3067, 644.6595, 42.7013]` |
| Output | 2-class softmax: `0 = an_toan (safe)`, `1 = canh_bao (alert)` |
| Decision | average the two models' softmax probabilities, then argmax — **no threshold calibration** |

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
11 checks: warm-up, correct hour ordering, gap-reset, all-invalid-hour-reset). All pass:

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
bool ai_input_is_ready(void);

// ai/ai_inference/include/ai_inference.h
esp_err_t ai_inference_init(void);
esp_err_t ai_infer(const float window[4][24], ai_result_t *out);  // ai_result_t: ready, signal, confidence, error

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

Resolution (implemented, no changes to `relay.c`/`mqtt.c`/`sysload.c`/`server/` needed): every 30s,
`ai_scheduler` polls `relay_get()` on the Fan channel and compares it to what it last commanded.
Any mismatch is treated as "someone else just took over", and `ai_scheduler` backs off that
channel for `CONFIG_SA_AI_OVERRIDE_COOLDOWN_MIN` minutes (default 30) before resuming automatic
control. It still runs inference and publishes `ai/state` every hour during the cooldown — it
just doesn't touch the relay.

## 5. Fallback / fail-safe behavior

- `ai_inference_init()` failure (e.g. tensor arena too small) at boot → logged, `ai_scheduler` task
  exits immediately, firmware continues exactly as if `SA_AI_ENABLED=n`. Never crashes the device.
- `ai_infer()` failure on any given hour → logged, `ai/state` published with `ready:false`, relay
  untouched that hour; retried the next hour automatically.
- 24h warm-up, or a detected time gap → same fail-safe (`ready:false`, relay untouched).
- An external override → relay untouched for the cooldown window, AI signal still computed/published.

## 6. MQTT

New topic only, existing `telemetry`/`shadow` schemas are untouched (per
`docs/MQTT_PROTOCOL.md` — do not add fields to a schema the server validates strictly without also
updating server-side validation, which was out of scope here):

```
device/{device_id}/ai/state
{"ready": true, "ai_state": 0, "confidence": 0.83, "ts": 1777631761}
{"ready": false, "warmup_hours_filled": 6, "ts": 1777631761}
```

## 7. Build

```bash
cd firmware
idf.py menuconfig   # Smart-Air AI Scheduler -> enable "SA_AI_ENABLED"
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
   confirm an `AI STATE=ALERT` transition drives the Fan relay + a buzzer beep, then confirm a
   manual app relay toggle correctly suppresses AI control for the cooldown window.

## 9. Known limitations

1. **24h warm-up after every reboot/OTA** — the hourly ring buffer is not persisted to NVS
   (deliberate choice — avoids added NVS wear/complexity; accepted trade-off).
2. **Geographic/climate scope** — inherited from the underlying model (trained on HCMC data,
   tropical monsoon climate, traffic-dominated pollution sources); see `ungdungdidong/CLAUDE.md`
   mục 8 for the full caveat. Re-training for another region is out of scope here.
3. **Small positive test set** (63 alert windows) underlies the 87.3%/15.9% headline numbers —
   see `ungdungdidong/Thu_Nghiem_3_Huong_Alert_Recall_90.md` mục 7.5 for the caveat already
   documented there.
4. **App-driven relay changes** are handled by the override cooldown (§ 4), but that mechanism was
   designed to also cover a server-side auto-control service like the one in the sibling
   `smart-air-cps` repo (`server/ai-service`), which `aiot-edge` does not currently have.

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
