# Rà soát tích hợp module AI (`ai/`) vào hệ thống

Ngày rà soát: 2026-09-23 — nhánh `feature/ai-inference`.

Tài liệu này tổng hợp các vấn đề phát hiện khi đưa module AI (dự báo cảnh báo chất lượng không khí
chạy trên ESP32-S3) vào `aiot-edge`: vấn đề nào **đã sửa**, vấn đề nào **còn mở**, và vì sao chúng
quan trọng. Mô tả kiến trúc chi tiết của module nằm ở [README.md](README.md).

---

## 0. Tóm tắt nhanh

| # | Vấn đề | Mức độ | Trạng thái | Commit |
|---|---|---|---|---|
| 1 | Sai đơn vị CO/NO2 (ppm vs µg/m³) | 🔴 Nghiêm trọng | ✅ Đã sửa, đã xác nhận đơn vị tại nguồn | `2c5aff6` |
| 2 | Topic `ai/state` không có trong ACL → EMQX ngắt kết nối thiết bị | 🔴 Nghiêm trọng | 🟡 Sửa một phần | `7441a28` |
| 3 | Sai tên symbol của model nhúng (lỗi link) | 🟠 Lỗi build | ✅ Đã sửa (chưa build thử) | `58a4a6c` |
| 4 | `target_link_libraries(... tflite-lib)` không tồn tại | 🟠 Lỗi build | ✅ Đã sửa (chưa build thử) | `58a4a6c` |
| 5 | AI tranh quyền điều khiển quạt với người dùng | 🟡 Logic / sản phẩm | 🟡 Đã làm hướng (a); hướng (b) còn mở | chưa commit |
| 6 | Nhận nhầm "người dùng can thiệp" sau khi bật lại device_mode | 🟡 Logic | ✅ Đã sửa | chưa commit |
| 7 | `ai_input` không có khoá, 2 task đọc/ghi song song | 🟡 Logic | ✅ Đã sửa | `d432327` |
| 8 | Lệch nguồn thời gian (DS3231 vs `time(NULL)`) | 🟡 Logic | ✅ Đã sửa | chưa commit |
| 9 | Stack task 4096 byte, `now_ms()` tràn sau ~49 ngày | ⚪ Nhỏ | ✅ Đã sửa (stack cần đo trên board) | chưa commit |
| 10 | Dữ liệu huấn luyện (trạm ngoài trời) ≠ cảm biến thiết bị (trong nhà) | 🔴 Chất lượng mô hình | 🟡 Đã thêm chế độ chỉ quan sát (mặc định); vẫn cần dữ liệu thực | chưa commit |
| 11 | Ngưỡng 0.5 → ~91% cảnh báo là báo nhầm | 🟡 Chất lượng mô hình | 🟡 Đã đo đánh đổi, đưa ngưỡng/hysteresis vào Kconfig; chưa chọn giá trị mới | chưa commit |
| 12 | Model `nofreeze` INT8 dưới ngưỡng khớp 98% | ⚪ Chất lượng mô hình | ❌ Chưa xử lý — máy thiếu `tensorflow`/`onnx2tf` | — |
| 13 | Topic `ai/state` chưa có trong `docs/MQTT_PROTOCOL.md`, server chưa đọc | ⚪ Tài liệu | ❌ Chưa sửa | — |
| 14 | Mô hình PM2.5 không phù hợp mục tiêu (dữ liệu trạm ngoài trời, trạm 4 hỏng T/H, CO thiết bị ngoài phân phối) | 🔴 Chất lượng mô hình | ✅ Thay bằng `ai/gas_ews` (CO/NO2 QCVN 03:2019/BYT) — chưa build trên board | chưa commit |
| 15 | `static const char *TAG` không dùng khi `SA_AI_ENABLED=n` (mặc định) → lỗi `-Werror=all` | 🟠 Lỗi build | ✅ Đã sửa (chuyển vào `#if`) | chưa commit |

**Chưa build bằng ESP-IDF, chưa chạy trên board.** Đã kiểm tra được:
- test host của `ai_input` (14 kiểm tra) chạy bằng gcc của MSYS2 (`C:\msys64\ucrt64\bin\gcc.exe`): tất cả đạt;
- `ai_scheduler.c` biên dịch sạch với `-Wall -Wextra -Werror` trên stub header (không phải header
  ESP-IDF thật), ở cả hai cấu hình `SA_AI_CONTROL_RELAY=n` và `=y`.

`SA_AI_ENABLED` mặc định là `n`, nên khi chưa bật thì firmware chạy như trước (chỉ thêm việc gom dữ
liệu vào `ai_input`, rất nhẹ). Khi bật, mặc định AI **chỉ publish** (`SA_AI_CONTROL_RELAY=n`).

---

## 1. Luồng dữ liệu (để hiểu các vấn đề bên dưới)

```
sensor_task (5s/lần)
   │  nhiệt độ, độ ẩm, CO, NO2 + timestamp (DS3231 hoặc time(NULL))
   ▼
ai_input_feed_sample()        gom trung bình theo từng giờ → vòng đệm 24 giờ (+ bộ đếm phiên bản)
   │
   ▼  (mỗi 5s kiểm tra ngưỡng CO/NO2; suy luận mỗi SA_AI_INFER_INTERVAL_SEC trên cửa sổ live
   │   = 23 giờ đã chốt + trung bình giờ đang chạy; chưa đủ 24h thì đệm, đánh dấu provisional)
ai_scheduler ──► ai_infer()   2 model TFLite INT8, lấy trung bình softmax → p_alert
   │  ngưỡng + hysteresis (Kconfig) → SAFE / ALERT
   ├─► MQTT  device/{id}/ai/state
   └─► chỉ khi SA_AI_CONTROL_RELAY=y: relay_set(Fan) + 3 tiếng bíp khi chuyển sang ALERT
```

Các file tích hợp vào firmware:
- [firmware/CMakeLists.txt](../firmware/CMakeLists.txt) — thêm 3 component `../ai/*`.
- [sensor_task.c](../firmware/components/core/sensor_task/sensor_task.c) — gọi `ai_input_feed_sample()` mỗi lần đọc cảm biến.
- [sysload.c](../firmware/components/core/sysload/sysload.c) — gọi `ai_scheduler_start()` sau `sensor_task_start()`.

---

## 2. Các vấn đề đã giải quyết

### ✅ #1 — Sai đơn vị CO/NO2

**Vấn đề.** Mô hình được huấn luyện trên dữ liệu trạm quan trắc với CO trung bình **1056**, NO2 trung
bình **77** — đây là đơn vị **µg/m³**. Firmware lại đưa vào giá trị **ppm** (CO khoảng 3–13, NO2
khoảng 0.03–0.12).

**Vì sao nghiêm trọng.** Sau chuẩn hoá z-score, CO = 5 ppm thành `(5 − 1056) / 644.7 ≈ −1.63`,
NO2 = 0.05 ppm thành `(0.05 − 77.08) / 42.7 ≈ −1.80`. Đầu vào INT8 của model chỉ biểu diễn được tới
khoảng **−1.82** (scale 0.0607, zero-point −98). Nghĩa là mô hình **luôn thấy không khí sạch nhất có
thể**, dù CO thật có tăng vọt. Quyết định gần như chỉ còn dựa vào nhiệt độ và độ ẩm.

**Cách sửa.**
- Thêm hằng số quy đổi ở 25°C, 1 atm vào [ai_input.h](ai_input/include/ai_input.h):
  `AI_CO_PPM_TO_UGM3 = 1145.6`, `AI_NO2_PPM_TO_UGM3 = 1881.6` (= khối lượng mol / 24.45 × 1000).
- `sensor_task` nhân với hệ số này trước khi đưa vào `ai_input`.
- Đổi tên trường thành `co_ugm3` / `no2_ugm3` để về sau không ai đưa nhầm ppm vào.

**Đã xác nhận tại nguồn.** Bài báo của tập dữ liệu (HealthyAir,
[PMC9720438](https://pmc.ncbi.nlm.nih.gov/articles/PMC9720438/)) ghi: trạm đo CO/NO2 bằng ppm, rồi
quy đổi toàn bộ sang **µg/m³** với hệ số (Bảng 5) CO = **1146**, NO2 = **1882**. Hằng số trong
firmware (1145.6 / 1881.6) khớp với các hệ số này.

### 🟡 #2 — Topic `ai/state` bị EMQX chặn và ngắt kết nối thiết bị (sửa một phần)

**Vấn đề.** AI publish lên `device/{id}/ai/state`, nhưng ACL của thiết bị
([emqx.js](../server/api/src/services/emqx.js) → `deviceRules()`) không có topic này. EMQX đang cấu
hình ([emqx.conf](../server/emqx/emqx.conf)):

```
no_match    = deny
deny_action = disconnect
```

**Vì sao nghiêm trọng.** Khi bật AI, thiết bị bị **ngắt MQTT mỗi 10 phút** (lúc đang chờ đủ 24h) hoặc
**mỗi giờ** (sau đó). Telemetry, lệnh relay, OTA đều bị ảnh hưởng — tức là bật AI làm hỏng cả hệ thống.

**Đã sửa.** Thêm quyền `publish` cho `device/{id}/ai/state` vào `deviceRules()`.

**Chưa xong.** ACL chỉ được ghi **một lần khi đăng ký thiết bị** (`createDeviceUser`). Thiết bị đã
đăng ký trước đó **không tự có quyền mới**. Trước khi bật `SA_AI_ENABLED` trên thiết bị cũ, phải:
- đăng ký lại thiết bị, **hoặc**
- thêm quyền qua EMQX dashboard / API, **hoặc**
- (hướng lâu dài) viết một bước đồng bộ ACL cho mọi thiết bị khi server khởi động.

### ✅ #3 — Sai tên symbol của file model nhúng

**Vấn đề.** ESP-IDF sinh symbol cho `EMBED_FILES` từ **tên file**, không kèm thư mục
(`get_filename_component(... NAME)` trong `data_file_embed_asm.cmake`). File
`model/model_beijing_freeze_int8.tflite` → symbol `_binary_model_beijing_freeze_int8_tflite_start`.
Code lại khai báo `_binary_model_model_...` (thừa một `model_` do tưởng có tính cả thư mục).

**Hậu quả.** Lỗi link `undefined reference` khi bật AI.

**Đã sửa** trong [ai_inference.cpp](ai_inference/src/ai_inference.cpp).

### ✅ #4 — Target CMake `tflite-lib` không tồn tại

**Vấn đề.** [ai_inference/CMakeLists.txt](ai_inference/CMakeLists.txt) có dòng
`target_link_libraries(${COMPONENT_LIB} PRIVATE tflite-lib)`. `tflite-lib` là tên component trong
repo ví dụ cũ, không phải target mà `espressif/esp-tflite-micro` đăng ký.

**Đã sửa.** Bỏ dòng này. Dependency đã khai báo trong `idf_component.yml`, component manager tự thêm
vào requirements.

### ✅ #6 — Nhận nhầm "người dùng can thiệp" sau khi bật lại device_mode

**Vấn đề.** Khi device_mode chuyển OFF → ON, `relay_force_all_off_silent()` tắt mọi relay. Nếu trước
đó AI đã bật quạt, AI thấy quạt tắt khác với lệnh cuối → coi như người dùng can thiệp → dừng 30 phút.

**Đã sửa** trong [ai_scheduler.c](ai_scheduler/src/ai_scheduler.c): khi `device_mode_get()` là
false, AI bỏ quyền sở hữu quạt mà không bắt đầu cooldown. Sau khi bật lại, quạt đang tắt không còn bị
coi là người dùng can thiệp.

Còn một kẽ hở nhỏ: nếu device_mode tắt rồi bật lại trong vòng 30 giây (giữa hai lần kiểm tra), AI
vẫn có thể coi đó là can thiệp và dừng 30 phút. Không nguy hiểm.

### ✅ #7 — `ai_input` không có khoá

**Vấn đề.** `sensor_task` (ghi) và `ai_scheduler` (đọc, ghim vào `APP_CPU`) chạy trên hai core khác
nhau, cùng truy cập biến static trong `ai_input.c` mà không có khoá. Nếu `ai_input_get_window()` đọc
đúng lúc `push_hour()` đang ghi, cửa sổ 24h có thể bị lẫn dữ liệu cũ/mới.

**Đã sửa.** Mọi hàm public của [ai_input.c](ai_input/src/ai_input.c) chạy trong `portMUX` critical
section. Khi build trên máy tính (không có `ESP_PLATFORM`), khoá là no-op nên test host vẫn biên dịch
được.

### ✅ #8 — Lệch nguồn thời gian

**Vấn đề.** `ai_input` gom giờ theo timestamp do `sensor_task` truyền vào (ưu tiên DS3231), còn
`ai_scheduler` quyết định "đã chạy giờ này chưa" bằng `time(NULL)`. Hai đồng hồ lệch nhau thì suy
luận có thể chạy lại trên cửa sổ cũ hoặc chạy trễ gần 1 giờ.

**Đã sửa.** `ai_input` có thêm bộ đếm phiên bản cửa sổ, tăng 1 mỗi khi chốt xong một giờ
(`ai_input_get_window_versioned()`, đọc cửa sổ và bộ đếm trong cùng một khoá). Scheduler chạy suy
luận khi bộ đếm đổi, không dùng `time(NULL)` nữa. Mỗi giờ mới chốt được suy luận đúng một lần, dù
DS3231 và đồng hồ hệ thống lệch nhau. Test host có thêm ca kiểm tra bộ đếm.

### ✅ #9 — Các lỗi nhỏ trong `ai_scheduler.c`

- Stack tăng lên **8192**. Sau lần suy luận đầu tiên, task log `stack high-water mark` một lần. Đọc
  con số này trên board thật để chỉnh lại.
- `now_ms()` dùng `esp_timer_get_time()` (64-bit), không còn tràn sau ~49 ngày. Đã thêm `esp_timer`
  vào `PRIV_REQUIRES`.
- Bỏ biến `ai_disabled_permanently`: biến này chỉ được gán, không nơi nào đọc.

---

## 3. Các vấn đề sửa một phần hoặc chưa giải quyết

### 🟡 #5 — AI tranh quyền điều khiển quạt với người dùng

**Vấn đề cũ.** Mỗi giờ AI đặt quạt theo kết quả: ALERT → bật, SAFE → tắt. Người dùng bật quạt bằng
tay → 30 phút sau, nếu AI thấy SAFE, AI tắt quạt.

**Đã làm hướng (a)** vì chỉ phải sửa trong `ai/`:
- ALERT: AI chỉ bật quạt khi quạt đang tắt, và ghi nhớ rằng chính AI đã bật.
- SAFE: AI chỉ tắt quạt **nếu chính AI đã bật nó**. Quạt do người dùng bật thì AI không bao giờ tắt.
- Người dùng tắt quạt mà AI đã bật: AI bỏ quyền sở hữu và dừng `SA_AI_OVERRIDE_COOLDOWN_MIN` phút,
  không bật lại ngay.
- Mất cửa sổ 24h (gap, cảm biến lỗi cả giờ) trong lúc AI đang giữ quạt bật: AI tắt quạt đó, không để
  quạt chạy suốt 24h+ chờ khởi động lại.

**Còn mở:**
- Quyền sở hữu chỉ nằm trong RAM. AI bật quạt, rồi thiết bị reboot/OTA → relay khôi phục trạng thái
  bật từ NVS, nhưng AI không còn biết mình đã bật → quạt bật cho đến khi người dùng tắt.
- Người dùng vẫn chưa có công tắc bật/tắt chế độ tự động trong app. Hướng **(b)** (cờ `auto_mode`
  lưu NVS, điều khiển qua shadow/command + nút trong app, xem `docs/MQTT_PROTOCOL.md`) vẫn là giải
  pháp đầy đủ, nhưng phải sửa cả server và app.

### 🟡 #10 — Dữ liệu huấn luyện khác xa dữ liệu thiết bị

Mô hình học từ **trạm quan trắc ngoài trời ở TP.HCM** (thiết bị tham chiếu, đã hiệu chuẩn). Thiết bị
dùng cảm biến MEMS giá rẻ GM702B/GM102B, đặt **trong nhà**, chưa hiệu chuẩn. Kể cả khi đơn vị đã đúng
(#1), phân phối giá trị vẫn có thể khác hẳn. Firmware có sẵn lệnh `calibrate_co` / `calibrate_no2`
(`docs/MQTT_PROTOCOL.md` mục 4.1), nên hiệu chuẩn trước khi đánh giá AI.

**Đã làm:** thêm Kconfig `SA_AI_CONTROL_RELAY`, **mặc định `n`**. Khi đó AI chỉ publish `ai/state`
(kèm `p_alert` thô của từng giờ để phân tích lại) và không đụng tới relay/buzzer. Payload có trường
`controls_relay` để phía server biết thiết bị đang ở chế độ nào.

**Còn cần:** hiệu chuẩn cảm biến, chạy chế độ chỉ quan sát vài ngày, so tỉ lệ ALERT với thực tế rồi
mới bật `SA_AI_CONTROL_RELAY`. Về lâu dài cần dữ liệu đo từ chính thiết bị để fine-tune.

### 🟡 #11 — Ngưỡng dự báo và tỉ lệ báo nhầm

**Đã làm:**
- `ai_infer()` trả thêm `p_alert` (xác suất `canh_bao` trung bình của ensemble). Quyết định giờ nằm
  trong scheduler: ALERT khi `p_alert >= SA_AI_ALERT_THRESHOLD_PCT/100` trong
  `SA_AI_ALERT_ON_HOURS` giờ liên tiếp; về SAFE sau `SA_AI_ALERT_OFF_HOURS` giờ liên tiếp dưới
  ngưỡng. Nếu scheduler bỏ lỡ một giờ thì bộ đếm hysteresis đếm lại từ đầu.
- Mặc định **50 / 1 / 1**, tức là giống hệt hành vi cũ (argmax, không hysteresis), để các chỉ số đã
  công bố vẫn đúng.
- Đã đo đánh đổi ngưỡng × hysteresis cho đúng cặp model firmware (xem mục 4).

**Chưa làm:** chọn giá trị mặc định mới. Mục 4 cho thấy không cấu hình nào vừa giữ recall cao vừa
hết báo nhầm, nên đây là quyết định sản phẩm, tốt nhất dựa trên `p_alert` thu được ở chế độ chỉ quan sát.

### ❌ #12 — Model `nofreeze` sau lượng tử hoá INT8

[AI_EXPORT_REPORT.md](ai_inference/model/AI_EXPORT_REPORT.md) tự cảnh báo: model `nofreeze` chỉ khớp
**97.69%** với bản PyTorch gốc, dưới ngưỡng 98% mà chính báo cáo đặt ra. Ensemble vẫn giữ nguyên
recall (87.30%), nên ảnh hưởng thực tế nhỏ, nhưng nên xem lại tập calibration khi export lần sau.

**Chưa làm được:** máy hiện tại không có `tensorflow` / `onnx2tf` / `onnx`, nên không export lại
được. Lệnh export ở [README.md](README.md) mục 1.

### ❌ #13 — Tài liệu và phía server

- `device/{id}/ai/state` chưa được mô tả trong [docs/MQTT_PROTOCOL.md](../docs/MQTT_PROTOCOL.md)
  (bảng mục 2 và mục 3). Payload hiện tại xem [README.md](README.md) mục 6. Payload đã đổi so với
  bản đầu: bỏ `confidence`, thêm `p_alert`, `threshold`, `controls_relay`.
- Server và bridge chưa subscribe topic này (`bridgeRules()` không có), app cũng chưa hiển thị. Hiện
  tại dữ liệu AI publish lên nhưng **không ai đọc**. Chế độ chỉ quan sát (#10) chỉ có ích khi phía
  server lưu lại topic này.

---

## 4. Ngưỡng dự báo của AI

| Thông số | Giá trị |
|---|---|
| Quy tắc quyết định | Trung bình softmax 2 model → `p_alert`; ALERT nếu `p_alert >= SA_AI_ALERT_THRESHOLD_PCT/100` (mặc định 0.50) |
| Hysteresis | `SA_AI_ALERT_ON_EVALS` / `SA_AI_ALERT_OFF_EVALS` lần suy luận liên tiếp (mặc định 1/5) |
| Tần suất | Mỗi `SA_AI_INFER_INTERVAL_SEC` (mặc định 60s) trên cửa sổ live: 23 giờ đã chốt + trung bình giờ đang chạy (`ai_input_get_live_window`) |
| Thời gian khởi động | Model chạy sau ~30s dữ liệu: chưa đủ 24 giờ thì lặp giờ cũ nhất để đệm, `ai/state` có `provisional=true` và `window_real_hours` (tắt bằng `SA_AI_WARMUP_PADDING=n`) |
| Ngưỡng tuyệt đối | Độc lập với model, mỗi 5s trên EMA ~30s: CO ≥ `SA_AI_RULE_CO_UGM3` (30000) hoặc NO2 ≥ `SA_AI_RULE_NO2_UGM3` (200) → ALERT ngay; hết khi < 90% ngưỡng. Vẫn chạy khi model lỗi/đang đệm |
| Hành động | Mặc định chỉ publish. Với `SA_AI_CONTROL_RELAY=y`: ALERT → bật quạt (nếu đang tắt) + 3 tiếng bíp; SAFE → tắt quạt chỉ khi AI đã bật nó |

**Nhãn `canh_bao`** (đã kiểm tra trong `ungdungdidong/src/data.py` và `src/train_binary.py`): PM2.5
**của giờ cuối cùng trong cửa sổ** > 50 µg/m³ (mức Kém + Xấu→Nguy hại theo QĐ 1459/QĐ-TCMT). Đây là
**ước lượng giờ hiện tại** (virtual sensor PM2.5), không phải dự báo giờ tới.

### Đánh đổi ngưỡng × hysteresis

Script: `ungdungdidong/src/eval_firmware_threshold.py` (`python -m src.eval_firmware_threshold`).
Kết quả đầy đủ (36 cấu hình) ở
`ungdungdidong/outputs_ensemble_binary_beijing/firmware_threshold_sweep.json`. Script mô phỏng đúng
logic scheduler **cũ** (suy luận mỗi giờ, hysteresis theo giờ liên tiếp) — scheduler hiện suy luận
mỗi phút trên cửa sổ live nên bảng dưới chỉ còn là tham khảo cho `SA_AI_ALERT_THRESHOLD_PCT`. Dùng bản
PyTorch của đúng 2 model firmware (bản INT8 lệch rất ít, xem #12). Tập VAL có 144 giờ cảnh báo trên
3610 giờ; tập TEST có 63 trên 3590 giờ (27 đợt cảnh báo liên tục).

| Ngưỡng | ON/OFF (giờ) | VAL recall | VAL FA | TEST recall | TEST FA | TEST precision | Quạt bật (giờ/ngày) | Đợt bắt được (TEST) |
|---:|:---:|---:|---:|---:|---:|---:|---:|---:|
| **0.50** | **1/1 (hiện tại)** | 61.1% | 10.6% | 87.3% | 15.9% | 8.9% | 4.1 | 24/27 |
| 0.50 | 2/1 | 47.9% | 6.9% | 77.8% | 11.0% | 11.2% | 2.9 | 21/27 |
| 0.50 | 2/2 | 52.8% | 9.9% | 79.4% | 15.4% | 8.4% | 4.0 | 21/27 |
| 0.60 | 1/1 | 55.6% | 7.8% | 82.5% | 13.0% | 10.2% | 3.4 | 21/27 |
| 0.70 | 1/1 | 48.6% | 5.9% | 76.2% | 9.4% | 12.6% | 2.5 | 19/27 |
| 0.70 | 2/1 | 38.2% | 3.7% | 61.9% | 5.8% | 16.0% | 1.6 | 15/27 |
| 0.80 | 1/1 | 41.0% | 3.5% | 61.9% | 6.3% | 14.9% | 1.8 | 16/27 |

Recall, FA và precision tính theo **giờ**: recall là tỉ lệ giờ cảnh báo thật mà AI đang ở trạng thái
ALERT; FA là tỉ lệ giờ an toàn mà AI đang ở trạng thái ALERT.

**Cách hiểu:**
1. **Con số 87.3% recall là lạc quan.** Trên tập VAL (144 giờ cảnh báo, hơn gấp đôi TEST), cùng cấu
   hình chỉ đạt **61.1%**. TEST chỉ có 63 giờ cảnh báo nên con số dao động mạnh.
2. **Precision không vượt quá ~20% ở mọi cấu hình.** Nâng ngưỡng hay thêm hysteresis chỉ đổi chỗ
   giữa bỏ sót và báo nhầm. Gốc vấn đề là khả năng phân biệt của mô hình (4 cảm biến rẻ tiền không
   mang đủ thông tin về PM2.5), không phải con số ngưỡng.
3. Hysteresis 2/2 gần như không giảm báo nhầm (quạt tắt chậm hơn bù lại phần bật chậm). Nếu dùng
   hysteresis thì **2/1** hiệu quả hơn.
4. Nếu cần giảm thời gian quạt chạy: 0.60 với 1/1 (báo nhầm giảm ~18%, recall TEST giảm 5 điểm) hoặc
   0.50 với 2/1 (quạt chạy ít hơn ~30%, bật chậm 1 giờ). Nên chọn sau khi có `p_alert` thật từ thiết bị.

---

## 5. Việc cần làm tiếp (theo thứ tự)

1. [ ] `idf.py build` với `SA_AI_ENABLED=y`, thử cả `SA_AI_CONTROL_RELAY=n` và `=y` — xác nhận #3, #4 đã hết lỗi, sửa nếu API tflite-micro lệch phiên bản.
2. [x] Chạy test host của `ai_input` (gcc MSYS2): 14/14 đạt.
3. [ ] Cập nhật ACL cho các thiết bị đã đăng ký trước (#2).
4. [ ] Quyết định có làm hướng (b) `auto_mode` cho #5 không (hướng (a) đã xong).
5. [x] Sửa #6, #8, #9.
6. [ ] Server lưu `ai/state` (#13), hiệu chuẩn cảm biến, chạy AI ở chế độ chỉ quan sát vài ngày (#10).
7. [ ] Chọn ngưỡng / hysteresis từ dữ liệu thật (#11) — bảng đánh đổi ở mục 4.
8. [ ] Export lại model `nofreeze` trên máy có `tensorflow` + `onnx2tf` (#12).
9. [ ] Bổ sung `ai/state` vào `docs/MQTT_PROTOCOL.md` (#13).
10. [ ] Chạy checklist benchmark trên board thật ([README.md](README.md) mục 8): RAM, flash, thời gian suy luận, tensor arena, stack high-water mark.
