# Bao cao export TFLite INT8

## outputs_binary_beijing_freeze

- ONNX: `ai_export\outputs_binary_beijing_freeze\outputs_binary_beijing_freeze.onnx` (24377 bytes)

- TFLite INT8: `ai_export\outputs_binary_beijing_freeze\outputs_binary_beijing_freeze_int8.tflite` (14664 bytes)

- Argmax agreement (PyTorch vs TFLite INT8, test set 3590 cua so): **98.22%**

- PyTorch  : alert_recall=82.54% false_alarm_rate=19.11%

- TFLite INT8: alert_recall=82.54% false_alarm_rate=19.45%

## outputs_binary_beijing_nofreeze

- ONNX: `ai_export\outputs_binary_beijing_nofreeze\outputs_binary_beijing_nofreeze.onnx` (24377 bytes)

- TFLite INT8: `ai_export\outputs_binary_beijing_nofreeze\outputs_binary_beijing_nofreeze_int8.tflite` (14664 bytes)

- Argmax agreement (PyTorch vs TFLite INT8, test set 3590 cua so): **97.69%**

- PyTorch  : alert_recall=80.95% false_alarm_rate=15.17%

- TFLite INT8: alert_recall=80.95% false_alarm_rate=14.69%


**CANH BAO: agreement 97.69% < nguong 98% -- quantization co the da lam hong model nay, KHONG nen dung truc tiep, can xem lai calibration set / do INT8.**


## Ensemble (outputs_binary_beijing_freeze + outputs_binary_beijing_nofreeze) -- quyet dinh THUC SU tren firmware

- Argmax agreement ensemble PyTorch vs ensemble TFLite INT8: **98.16%**

- Ensemble PyTorch : alert_recall=87.30% false_alarm_rate=15.93%

- Ensemble TFLite INT8: alert_recall=87.30% false_alarm_rate=16.10%

- Doi chieu ket qua train truoc do (`outputs_ensemble_binary_beijing/ensemble_binary_results.json`): alert_recall=87.30% false_alarm_rate=15.93%
