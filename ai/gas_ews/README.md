# `ai/gas_ews`: Cảnh báo sớm CO/NO2 theo QCVN 03:2019/BYT (trên ESP32-S3)

Module này thay thế luồng AI PM2.5 cũ (`ai_input` + `ai_inference`, xem [../INTEGRATION_REVIEW.md](../INTEGRATION_REVIEW.md)). Hai component cũ vẫn giữ nguyên trong thư mục nhưng **đã được bỏ khỏi danh sách build** trong `firmware/CMakeLists.txt`.

Phần huấn luyện, đánh giá và nguồn gốc của mọi hằng số nằm ở repo `ungdungdidong/gas_ews/` (xem README ở đó).

## Ngưỡng

| Khí | TWA (8 giờ) | STEL (15 phút) |
|---|---|---|
| CO | 20 mg/m³ = **17.46 ppm** | 40 mg/m³ = **34.92 ppm** |
| NO2 | 5 mg/m³ = **2.66 ppm** | 10 mg/m³ = **5.31 ppm** |

Quy đổi ở 25°C, 1 atm theo công thức của QCVN.

## Luồng xử lý

```
sensor_task (mỗi 5s) ── gas_ews_feed(ppm, T, RH, đồng hồ đơn điệu esp_timer)
   │  bỏ qua 10 phút preheat sau khởi động, hoặc sau khi mất dữ liệu > 60s
   │  gộp thành bước 10s; lấp mẫu khí thiếu tối đa 60s
   │  STEL = TB 15 phút | TWA = Σ(C·t) / 8 giờ | ngoại suy STEL sau 10 phút
   ▼
ai_scheduler (mỗi 5s; mỗi bước 10s mới thì chạy model một lần)
   │  gas_ews_get_window() → 120×8 (20 phút) → gas_ews_model_infer() (INT8, 21 KB)
   │  → gas_ews_set_model_result()
   ▼
Mỗi khí:  VƯỢT NGƯỠNG  = STEL ≥ ngưỡng OR TWA ≥ ngưỡng                      (luật, luôn chạy)
          CẢNH BÁO SỚM = VƯỢT NGƯỠNG OR ngoại suy ≥ ngưỡng OR model ≥ ngưỡng (bật sau 20s, tắt sau 5 phút)
   ├─► MQTT device/{id}/ai/state   (khi đổi trạng thái, và mỗi 60s)
   └─► chỉ khi SA_AI_CONTROL_RELAY=y: quạt + còi
```

**Model không bao giờ tắt được phần luật.** Nếu model lỗi hoặc không qua self-test lúc boot, luật QCVN và cảnh báo từ ngoại suy vẫn chạy bình thường.

## Thời gian chạy thực tế

### Chu kỳ

| Việc | Chu kỳ | Ghi chú |
|---|---|---|
| `sensor_task` đọc cảm biến → `gas_ews_feed()` | 5 s | `SA_SENSOR_POLLING_INTERVAL`, phải ≤ 10 s |
| Một bước xử lý (STEL, TWA, ngoại suy, luật) | 10 s | bước chỉ được chốt khi mẫu đầu tiên của bước kế tiếp tới |
| `ai_scheduler` thức dậy | 5 s | kiểm tra bước mới, đổi trạng thái, quạt bị tắt tay |
| Chạy model (`gas_ews_model_infer`) | 10 s | đúng 1 lần mỗi bước mới, khi `model_ok` |
| Publish `ai/state` | ngay khi đổi trạng thái + mỗi 60 s | |
| Log thời gian suy luận | 1 giờ (360 lần chạy) | `inference timing: ... avg ... max ...` |

Độ trễ từ lúc có mẫu đến lúc `ai/state`/quạt phản ứng: bước 10 s được chốt khi mẫu kế tiếp tới, scheduler nhận trong ≤ 5 s → **≤ ~15 s**, cộng thêm debounce bật (2 bước liên tiếp = 10 s nữa).

### Mốc sau khi khởi động

Tính từ mẫu cảm biến đầu tiên. Số đo bằng cách chạy chính `gas_ews.c` trên máy tính với mẫu 5 s đều đặn (không phải ước lượng):

| Thời điểm | Chuyện gì xảy ra |
|---|---|
| 0 – 10 phút | Preheat: bỏ qua CO/NO2, `warmup=true`, `level=0`. **Không theo dõi được.** |
| ~10 phút 10 s | Hết preheat, bắt đầu nhận khí |
| ~11 phút | Có STEL (cần ≥ 6 bước = 1 phút dữ liệu) → **luật QCVN bắt đầu chạy** |
| ~15 phút | Có ngoại suy (cần 30 bước = 5 phút liên tục) → cảnh báo sớm từ ngoại suy chạy |
| **~30 phút** | `model_ok` (120 bước = 20 phút liên tục, cả 2 khí) → **model chạy lần đầu**, sau đó cứ 10 s một lần |
| ~8 giờ 10 phút | TWA 8 giờ mới đủ dữ liệu thật (trước đó phần thiếu được tính là 0, TWA thấp hơn thực tế) |

Mất dữ liệu > 60 s (mất điện, reboot, `device_mode` OFF) → quay lại từ đầu bảng này. Mất ngắn hơn: giá trị khí được lấp tối đa 60 s nên không ảnh hưởng. Nếu chỉ một cảm biến khí mất > 60 s (các cảm biến khác vẫn đọc được) thì không preheat lại, nhưng `model_ok` tắt và model phải đợi thêm 20 phút dữ liệu liên tục.

### Phản ứng khi khí tăng đột ngột (mô phỏng, chưa tính model)

Không khí sạch CO 2 ppm, sau 60 phút khí tăng vọt và giữ 30 phút:

| Kịch bản | Cảnh báo sớm (ngoại suy) | Vượt ngưỡng (STEL) | Về an toàn sau khi khí giảm |
|---|---|---|---|
| CO 40 ppm | không bật (cần ≥ 1.5 × STEL = 52 ppm) | +13 phút 10 s | 7 phút |
| CO 50 ppm | không bật | +10 phút 30 s | ~10 phút |
| CO 100 ppm | **+60 s** | +5 phút 20 s | ~15 phút |
| NO2 8 ppm | **+50 s** | +10 phút 10 s | 10 phút |

- STEL là trung bình 15 phút nên luôn chậm vài phút: đó là định nghĩa của QCVN, không phải độ trễ của hệ thống.
- Với CO trong khoảng 35–52 ppm, chỉ model mới có thể báo trước khi STEL vượt ngưỡng (ngưỡng model CO = 0.90).
- Về an toàn = STEL xuống dưới ngưỡng rồi thêm 5 phút debounce tắt (30 bước).

### Chi phí một lần suy luận

| | Giá trị | Nguồn |
|---|---|---|
| Phép nhân-cộng (MAC) | 159,264 / lần | đếm từ `gas_ews_int8.tflite` (4 CONV_2D + 2 FULLY_CONNECTED) |
| Thời gian trên PC (TFLite + XNNPACK) | ~3 µs | đo, chỉ để tham khảo |
| Thời gian trên ESP32-S3 | **chưa đo**, ước lượng vài ms | đọc từ log trên board |
| Tỉ lệ CPU | ≈ vài ms / 10 s < 0.1% | |

Trên board, ba dòng log sau cho số thật:

```
ai_scheduler: gas_ews_model_init (AllocateTensors + 2-window self-test): X us
ai_scheduler: first inference at T s after boot (step N): X us; stack high-water mark: Y bytes free
ai_scheduler: inference timing: 360 runs, avg X us, max Y us        <- mỗi giờ
```

`T` phải xấp xỉ 1800 s + thời gian boot trước khi `sensor_task` đọc mẫu đầu tiên. Nếu lớn hơn nhiều: có bước bị thiếu dữ liệu (kiểm tra `SA_SENSOR_POLLING_INTERVAL` và cảm biến).

## File

| File | Nguồn |
|---|---|
| `include/gas_ews.h`, `src/gas_ews.c` | Port C99 của `features.py`, không phụ thuộc ESP-IDF, test được trên máy tính |
| `include/gas_ews_model.h`, `src/gas_ews_model.cpp` | Wrapper TFLite Micro (4 op: CONV_2D, FULLY_CONNECTED, LOGISTIC, RESHAPE) |
| `include/gas_ews_contract.h` | **Tự sinh** từ `model_contract.json`, không sửa tay |
| `src/gas_ews_selftest.h` | **Tự sinh**: 2 cửa sổ int8 kèm kết quả mong đợi, để tự kiểm tra lúc boot |
| `model/gas_ews_int8.tflite` | **Tự sinh**: 12,186 tham số, 20,896 B, cửa sổ 120 bước × 8 kênh (20 phút) |

Sau khi train lại, chạy lệnh sau để cập nhật cả 3 file tự sinh và các golden vector:

```bash
cd ungdungdidong
PYTHONPATH=. .venv_export/Scripts/python -m gas_ews.export_firmware --fw D:/project/aiot-edge
```

## Đã kiểm chứng (trên máy tính)

- **Golden test** ([../tools/test_gas_ews_host.c](../tools/test_gas_ews_host.c)): `gas_ews.c` tái tạo đúng từng bước của Python (ppm sau khi lấp mẫu, STEL, TWA, ngoại suy, 8 kênh model, `model_ok`, cờ luật, cờ ngoại suy) trên 3 bộ dữ liệu:
  - mô phỏng CO 10 giờ;
  - mô phỏng NO2 10 giờ;
  - **3.2 giờ dữ liệu thật của thiết bị** (có dao động thời gian lấy mẫu 5–6 giây và các lần khởi động lại).

  Tổng cộng 8,342 bước, **0 sai khác**. Kèm theo là unit test cho preheat, xử lý khoảng mất dữ liệu và bộ debounce của model.

  Để chắc test thực sự bắt được lỗi, tôi đã thử sửa sai một hằng số trong code: test báo lỗi ngay.

  ```bash
  cd ai/tools
  gcc -std=c99 -O2 -Wall -Wextra -I../gas_ews/include test_gas_ews_host.c ../gas_ews/src/gas_ews.c -o test_gas_ews -lm
  ./test_gas_ews golden        # -> "All tests passed."
  ```
- `ai_scheduler.c` biên dịch sạch với `-Wall -Wextra -Werror` (dùng header giả lập ESP-IDF) ở cả 3 cấu hình: AI tắt, chỉ quan sát, điều khiển quạt.
- Model INT8 đã được kiểm tra trên PC bằng TFLite interpreter: quyết định khớp bản float ở 99.91% (CO) / 99.995% (NO2) số bước.

## CHƯA kiểm chứng (cần board thật)

1. `idf.py build`: API của tflite-micro trong `gas_ews_model.cpp` (cùng API mà `ai_inference.cpp` đã dùng) và tên symbol của `EMBED_FILES`.
2. Log lúc boot phải có `gas_ews model ready: ... arena used X/Y B ...; self-test OK`.
   - Nếu self-test báo sai: runtime trên chip cho kết quả khác interpreter tham chiếu, model sẽ tự tắt.
   - Chỉnh `CONFIG_SA_GAS_EWS_ARENA_SIZE` theo con số X trong log.
3. Thời gian một lần suy luận, thời điểm model chạy lần đầu và stack high-water mark: xem 3 dòng log ở mục "Chi phí một lần suy luận".

## Trước khi bật điều khiển quạt (`SA_AI_CONTROL_RELAY`)

- **Phải hiệu chuẩn cảm biến** (preheat ≥ 24 giờ, sau đó chạy `calibrate_co` / `calibrate_no2`). Khi chưa hiệu chuẩn, GM102B đọc khoảng 2 ppm NO2 trong không khí sạch, mà STEL của NO2 chỉ là 5.3 ppm. Trên dữ liệu thật hiện có, phần ngoại suy đã bật cảnh báo sớm NO2 khoảng 13 phút chỉ vì lý do này.
- Chạy ở chế độ chỉ quan sát vài ngày, kiểm tra `ai/state`, sau đó mới bật.
- `SA_AI_FAN_ON_LEVEL`: 1 = bật quạt từ mức cảnh báo sớm (mặc định), 2 = chỉ khi đã vượt ngưỡng.
- Còi: 3 tiếng bíp ngắn khi có cảnh báo sớm, 5 tiếng bíp dài khi vượt ngưỡng.

## MQTT `device/{id}/ai/state` (schema mới)

```json
{"standard":"QCVN 03:2019/BYT","level":1,"level_name":"canh_bao_som","warmup":false,
 "model_ready":true,"model_ok":true,
 "co": {"ppm":12.7,"stel15":16.8,"twa8h":2.1,"proj10":14.0,"p_model":0.004,"level":0,
        "rule":false,"proj_alarm":false,"model_alarm":false},
 "no2":{"ppm":2.08,"stel15":4.31,"twa8h":0.4,"proj10":3.9,"p_model":0.0,"level":1,
        "rule":false,"proj_alarm":true,"model_alarm":false},
 "controls_relay":false,"ts":1777631761}
```

- `level`: 0 = an toàn, 1 = cảnh báo sớm, 2 = vượt ngưỡng. Giá trị ở gốc là mức cao nhất của hai khí.
- Giá trị chưa biết (đang preheat, thiếu dữ liệu, model chưa chạy) được gửi là `null`.
- Server hiện chưa đọc topic này (xem INTEGRATION_REVIEW #13), và ACL EMQX phải cho phép thiết bị publish lên nó (#2).

## Giới hạn đã biết

- Có khoảng **10 phút không theo dõi được** sau mỗi lần khởi động hoặc sau khi `device_mode` bật lại, do cảm biến MOS cần preheat. Model cần thêm 20 phút mới chạy; luật STEL chạy ngay sau preheat.
- TWA trượt theo từng phút (gom 1 phút) để tiết kiệm RAM. Python dùng đúng cách tính này nên hai bên khớp nhau.
- Lịch sử chỉ nằm trong RAM: khởi động lại thì TWA 8 giờ bắt đầu lại từ 0.
- `sensor_task` phải đọc cảm biến với chu kỳ ≤ 10 giây (`SA_SENSOR_POLLING_INTERVAL`). Nếu chậm hơn, các bước 10 giây sẽ thiếu dữ liệu.
- Model được train trên mô phỏng và kiểm thử trên dữ liệu thật công khai. Bước kiểm chứng cuối cùng vẫn là thiết bị này đặt cạnh một máy đo tham chiếu.
- RAM tĩnh: khoảng 12 KB cho `gas_ews` (7.5 KB là 480 xô TWA), 16 KB arena, 3.8 KB buffer cửa sổ trong scheduler.
