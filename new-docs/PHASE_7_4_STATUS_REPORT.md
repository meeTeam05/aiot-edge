# Phase 7.4 Status

## OTA

Status: Completed

Files changed:

- `mobileApp/src/features/device/ota/{OtaScreen.tsx,hooks/useDeviceOta.ts,models/otaProgressModels.ts,realtime/{otaProgressMapper.ts,otaProgressRealtimeService.ts}}`
- `mobileApp/src/features/device/ota/reconciliation/OTAReconciliationService.ts`
- `mobileApp/__tests__/{deviceOtaDataFoundation.test.ts,deviceOtaUi.test.tsx,otaRealtime.test.ts,otaReconciliation.test.ts}`

Behavior implemented:

- The device-scoped OTA cache now represents `idle`, `requesting`, `accepted`, `downloading`, `waiting_reboot`, `checking_device`, `completed`, `failed`, and `timeout`.
- `POST /devices/:id/ota` writes `requesting`, then `accepted` only after the existing accepted acknowledgement. Network/request failures enter a retryable `failed` state with the normalized error.
- Firmware progress remains driven only by supported `ota.progress` frames. Reboot starts existing device-data reconciliation; completion requires an online device whose existing `firmwareVer` exactly matches the requested version. An online mismatch fails; a device that never returns online times out.
- Duplicate IDs and older OTA progress timestamps are ignored. No `ota.completed` event was added.

Flutter parity:

Flutter treats the OTA HTTP response as a request acknowledgement rather than firmware completion. RN retains that behavior and its already-approved post-reboot reconciliation verifies completion only against existing device data. The request/progress/retry presentation uses existing theme controls and does not add a transport or backend contract.

Known limitations:

- Firmware publishes no independent completion event, so completion cannot survive app process loss without a newly approved server-side request identity.
- OTA reconciliation requires the app to remain active enough to observe the reboot frame and query device data. Physical-device/background timing has not been tested.

## Calibration

Status: Completed

Files changed:

- `mobileApp/src/features/device/calibration/hooks/useCalibration.ts`
- `mobileApp/src/services/realtime/realtimeEventRouter.ts`
- `mobileApp/__tests__/{calibrationDataFoundation.test.ts,calibrationWizardUi.test.tsx,realtimeArchitecture.test.ts}`

Behavior implemented:

- The existing preparation/ready/running/result UI maps Flutter's calibration lifecycle: preparation, command start, command polling, success only on `done`, failure on `error`, timeout on server timeout or expired seven-minute polling, and retry.
- Calibration remains generic `POST /devices/:id/command` with only `calibrate_co` and `calibrate_no2`; confirmation continues to poll the existing 100-record command history every two seconds.
- The shared router invalidates the active calibration command-history query after `command.updated`. That query refetches through REST and can finish polling sooner. SSE itself never marks calibration successful, updates telemetry, or changes shadow state.
- Route cleanup aborts in-flight polling without writing a synthetic terminal result.

Flutter parity:

Matches Flutter's three-screen wizard and seven-minute command-completion wait. Flutter calls generic command submission and command-history polling; RN reuses the same established contracts and keeps REST command status authoritative.

Known limitations:

- Calibration cannot prove an adjusted sensor value or alter telemetry locally; it only reports the backend command outcome, as Flutter does.
- App background/resume and physical device command timing have not been exercised.

## Cache Strategy

- OTA state is isolated to `['device', deviceId, 'ota', 'progress']`; the existing catalog key is invalidated after request/terminal transitions.
- Reboot reconciliation invalidates only the device's OTA catalog, selected device key, and `['devices']` home list. It does not clear telemetry, shadow, notifications, homes, or unrelated devices.
- `replay.reset` continues to invalidate existing device snapshot roots; cached OTA catalog data is thereby marked stale for its normal query refresh, while progress does not manufacture a completion state.
- Calibration's active command-history query is invalidated after command SSE frames and refetches REST data. No calibration-specific global store, optimistic shadow, or telemetry cache write exists.

## Tests

Added/updated coverage for OTA requesting/accepted/request failure, download/reboot/failure/stale frame handling, reconciliation completion/mismatch/timeout/cancellation, replay-reset OTA catalog staleness, and narrow cache scope. Calibration coverage includes payloads, polling, `done`, error, timeout, cancellation, retry UI, and REST-refresh acceleration from `command.updated`.

Final verification:

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test -- --runInBand`: PASS
- `git diff --check`: PASS

## Remaining Risks

- No real device, native background/resume session, or server replay-retention scenario was tested.
- Request/reconciliation state is intentionally memory/cache scoped and is not persisted across a terminated app.
- New firmware completion, sensor-health, or calibration-result endpoints would require explicit backend approval.

## Next Phase Recommendation

Phase 7.5 should be hardware and native lifecycle QA: validate OTA reboot/reconnect/version verification, calibration command completion, SSE reconnect/replay, background/resume behavior, dark theme, narrow/large-text layouts, and accessibility on Android and iOS.
