# Nhật ký công việc: module AI (`ai/`)

Ghi lại việc đã làm, kết quả kiểm chứng và việc còn mở, theo ngày. Chi tiết kỹ thuật nằm trong các tài liệu được dẫn link; file này chỉ tóm tắt.

Nhánh: `feature/ai-inference`. Repo huấn luyện đi kèm: `ungdungdidong/gas_ews/`.

---

## 2026-09-26

### Cửa sổ model 20 phút, chạy cho cả CO và NO2

- So sánh cửa sổ 30 / 20 / 15 / 10 phút: cùng seed, chỉ đổi `F.WINDOW`. Chọn **20 phút (120 bước)**. Bảng so sánh ở `ungdungdidong/gas_ews/README.md` mục 5.
- Kết quả hệ thống (model ∨ ngoại suy ∨ luật), tập TEST mô phỏng, so với bản 30 phút:

  | | 30 phút | 20 phút |
  |---|---|---|
  | Model chạy từ (sau khởi động) | phút 40 | **phút 30** |
  | CO báo trước / lead trung vị | 91% / +5.1 phút | 92% / +6.5 phút |
  | NO2 báo trước / báo nhầm mỗi ngày | 100% / 0.25 | 100% / 0.19 |
  | OOD CO báo trước (máy phát điện) | 89% | 92% |
  | Kích thước model | 22.9 KB, 14,234 tham số | 20.9 KB, 12,186 tham số |

- Dữ liệu thật (`eval_real`):
  - EN54 và Kashtan vẫn 0 báo nhầm.
  - Cảnh báo sớm CO ở hội trường giảm từ 0.42 xuống 0.28 lần/ngày.
  - CO ×1.3 (qua mô hình cảm biến) báo trước tăng từ 90% lên 97%.
  - NO2 lead trung vị ngắn hơn (21.5 → 15.7 phút).
- Dữ liệu thiết bị thật (3.2 giờ): model NO2 báo khoảng 5 phút, **nằm trọn trong** khoảng ngoại suy đã báo sẵn, nên không thêm báo nhầm mới.
- **Sửa lỗi ở bước chọn cấu hình trên VAL** (`train.py`): trước đây bước này được phép chọn "chỉ model", trong khi firmware luôn OR ngoại suy. Với cửa sổ 20 phút nó đã chọn đúng cấu hình không có ngoại suy, làm số liệu đánh giá không khớp với thứ chạy trên thiết bị. Giờ chỉ xét các cấu hình có ngoại suy.
- Đã xuất sang firmware (`export_firmware`): model, `gas_ews_contract.h`, `gas_ews_selftest.h`, golden vector. Bản 30 phút cũ được sao lưu ở `ungdungdidong/outputs_gas_ews_w180_backup/` (không nằm trong git).
- Chỉ có 1 seed: chênh lệch vài điểm % chỉ đủ để nói bản 20 phút **không kém đi**.

### Rà soát

- [gas_ews/REVIEW_MODEL.md](gas_ews/REVIEW_MODEL.md): rà riêng phần model và lịch hoạt động của model trên hệ thống.
  - M1: model nhạy với độ ẩm; T < 22.5 °C / RH < 47.9 % bị kẹp bởi dải INT8.
  - M2: model NO2 chưa có ích hơn ngoại suy; giữ lại để hai khí dùng cùng một cơ chế.
  - M3: chưa đo trên chip.
- Trả lời câu hỏi "nạp cửa sổ từ cơ sở dữ liệu":
  - Với cửa sổ model thì không có lợi: 10 phút preheat luôn nằm trong cửa sổ, và dữ liệu thật cho thấy mọi lần khởi động lại đều có đỉnh preheat (CO lên tới 394–5000 ppm).
  - Với **TWA 8 giờ sau mất điện** thì có lợi. Chưa làm.

### Sửa lỗi nhỏ

- `ai_input_reset()` không đặt lại `s_samples_fed`, làm test host của `ai_input` lỗi 1/44. Đã sửa; test đạt hết. Luồng này không còn nằm trong build.

---

## 2026-09-25

### Đo và làm rõ thời gian chạy AI

- `ai_scheduler.c` thêm đo thời gian bằng `esp_timer`:
  - thời gian `gas_ews_model_init` (AllocateTensors + self-test);
  - lần suy luận đầu tiên: chạy ở giây thứ mấy sau boot và mất bao nhiêu µs;
  - mỗi giờ: thời gian suy luận trung bình và lớn nhất.

  Trước đó README ghi là có đo `Invoke()`, nhưng code chỉ log stack.
- Thêm [tools/sim_gas_ews_timeline.c](tools/sim_gas_ews_timeline.c): chạy `gas_ews.c` thật trên máy tính để lấy mốc thời gian. Các mốc:
  - preheat 0–10 phút;
  - STEL từ ~11 phút;
  - ngoại suy từ ~15 phút;
  - model từ ~30 phút (trước ngày 26/9 là ~40 phút);
  - TWA đủ 8 giờ lịch sử sau ~8 giờ 10 phút.
- [gas_ews/README.md](gas_ews/README.md) thêm mục "Thời gian chạy thực tế": chu kỳ, mốc sau khởi động, phản ứng khi khí tăng đột ngột, chi phí một lần suy luận.

### Rà soát tổng thể

- [gas_ews/REVIEW_HOAT_DONG.md](gas_ews/REVIEW_HOAT_DONG.md): hệ thống đã phù hợp chưa, và giải thích TWA (là gì, vai trò, vì sao "8 giờ mới đủ").
- 4 vấn đề chính, **chưa sửa**:
  - A. Cảnh báo không tới được ai ở cấu hình mặc định.
  - B. `device_mode` OFF làm ngừng giám sát khí.
  - C. Reboot làm mất TWA. Ví dụ mô phỏng: CO 25 ppm, reboot ở giờ 5 → báo trễ 5 giờ.
  - D. QCVN 03:2019 là ngưỡng cho nơi làm việc, không phải nhà ở.

---

## Kiểm chứng hiện có (trên máy tính)

| Kiểm tra | Kết quả |
|---|---|
| Golden test `gas_ews.c` so với Python (8,342 bước, 3 bộ dữ liệu) | 0 sai khác |
| Test host `ai_input` (luồng cũ) | đạt |
| `ai_scheduler.c` với `-Wall -Wextra -Werror` (header giả lập ESP-IDF) | sạch ở cả 3 cấu hình |
| INT8 so với float | khớp 99.91% (CO) / 99.995% (NO2) số bước |

**Chưa làm:** `idf.py build`, chạy trên board, đo `Invoke()`/arena/stack thật.

## Việc còn mở

1. Build + flash, đọc log thời gian/arena/stack/self-test ([REVIEW_MODEL.md](gas_ews/REVIEW_MODEL.md) M3).
2. Còi khi `level=2` kể cả ở chế độ chỉ quan sát; server lưu `ai/state`, app hiển thị (A).
3. Giám sát khí tiếp khi `device_mode` OFF (B).
4. Cờ hiệu chuẩn NO2, chặn điều khiển quạt/còi khi chưa hiệu chuẩn.
5. Giữ TWA qua reboot (`RTC_NOINIT_ATTR` + DS3231), và/hoặc nạp TWA từ DB sau mất điện (C).
6. Mở rộng dải T/RH khi mô phỏng rồi train lại (M1).
7. Chạy thêm 3–5 seed cho cửa sổ 20 và 30 phút.
8. Chốt môi trường sử dụng (nơi làm việc / nhà ở) và bộ ngưỡng (D).
