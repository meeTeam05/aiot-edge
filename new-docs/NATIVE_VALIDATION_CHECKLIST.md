# Native Validation Checklist

Use this checklist on a clean Android device/emulator and iOS simulator/device against the same authenticated API environment used by Flutter. Flutter remains the visual and behavioral reference. Record platform, OS version, device model, API base URL (without secrets), result, and evidence for every failed item.

## 1. Build Validation

- [ ] Android: `cd mobileApp/android && ./gradlew assembleDebug`; install/run with `npm run android`.
- [ ] Android release APK: `cd mobileApp/android && ./gradlew assembleRelease`.
- [ ] iOS: on macOS, install pods in `mobileApp/ios`, then run `npm run ios`.
- [ ] iOS archive: build the `mobileApp` scheme in Xcode or run `xcodebuild ... archive` with the release signing configuration.
- [ ] Automated: `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand` pass from `mobileApp/`.

## 2. Authentication Validation

- [ ] A fresh install opens Login; protected content is not briefly visible.
- [ ] Restored refresh token/user returns to the app shell; an invalid session returns to Login.
- [ ] Verify login success, invalid-credential error, registration with automatic authentication, and logout clearing local state.
- [ ] Force one protected 401: verify a single refresh/retry, no duplicate refreshes, and forced logout if refresh fails.

## 3. Navigation Validation

- [ ] Verify Auth stack, then persistent Home/Notifications/Profile tabs retain their state when switched.
- [ ] From Home/Notifications, open Device Detail, Command History, Settings, OTA, and CO/NO₂ Calibration; these must sit above the tab shell.
- [ ] Verify back returns to the direct parent and direct-entry fallback returns to a safe parent route.
- [ ] No custom deep links are required: Flutter has none. Verify parameterized native routes receive the correct device ID/sensor.

## 4. Home Validation

- [ ] Compare loading, empty, and retryable-error states with Flutter.
- [ ] Verify home selector/room grouping, selected-home persistence while tabbing, device-card copy, and pull-to-refresh.
- [ ] Verify an empty account follows Flutter’s Create Home/Add Device entry behavior; do not treat current provisioning placeholders as completed provisioning.

## 5. Device Validation

### Dashboard

- [ ] Verify initial loading/retry, online/offline/last-seen data, reported shadow mode, firmware, and sensor-card missing/mode-off states.
- [ ] Verify Fan, Lamp, and Filter reflect reported relays only; verify mode-off restrictions and mode-off confirmation.

### Commands

- [ ] For each relay and mode command, verify only the affected control is pending/disabled and no optimistic device/shadow value appears.
- [ ] Verify `pending`, `sent`, `done` plus matching reported shadow, `error`, and timeout/queued feedback.
- [ ] Verify Command History filters, refresh, timestamps, payload sheet, and back navigation.

## 6. Realtime Validation

- [ ] Verify authenticated SSE connects with the access token and reconnects after network loss/background-resume.
- [ ] Inject/observe `device.status`, `shadow.reported`, `telemetry.point`, and `command.updated`; confirm the correct query cache/view changes.
- [ ] Verify `replay.reset` invalidates/refetches affected snapshots rather than retaining stale data.
- [ ] Record Android/iOS streaming-fetch and lifecycle results; these need physical-device validation.

## 7. OTA Validation

- [ ] Verify catalog loading, retryable error, empty catalog, current-version badge, and offline presentation.
- [ ] On an online authorized device, request an available version and verify only request-accepted feedback for HTTP `202`.
- [ ] Do not validate OTA completion/progress UI: Flutter does not provide completion UI and React Native intentionally does not render `ota.progress`.

## 8. Calibration Validation

- [ ] Verify CO and NO₂ preparation content, Start command payload, elapsed timer, and two-second REST polling.
- [ ] Verify only `done` shows success; verify command error, server timeout, and seven-minute expiry show retryable failure.
- [ ] Verify Retry returns to the ready step and no sensor/shadow value changes before device-reported data arrives.

## 9. Known Differences and Risks

- BLE preflight and the five-step provisioning flow are not migrated; existing provision destinations are foundations/placeholders.
- Dashboard sparkline rendering and Flutter’s narrow-screen/large-text responsive grid behavior need visual comparison.
- Placeholder glyphs remain where Flutter uses its semantic Lucide icon set; perform screenshot comparison in light/dark themes and at larger text sizes.
- Secure storage, Clipboard behavior, SSE streaming/reconnect, dialogs, and command/calibration timing require native device coverage. The React Native Clipboard API is deprecated upstream and awaits an approved replacement.
- Backend command history does not expose execution-error detail; neither client can display it without an approved contract change.

## 10. Final Release Checklist

- [ ] Build and retain the Android release APK and iOS archive from clean working trees.
- [ ] Verify the release API environment/base URL, TLS, auth refresh, and SSE endpoint; never log tokens or provisioning secrets.
- [ ] Confirm release builds contain no development menu/debug logs or test API configuration.
- [ ] Re-run type-check, lint, Jest, targeted backend tests, and the relevant manual sections above.
- [ ] Attach screenshots/recordings for Flutter-versus-React-Native visual review, document known differences, and obtain release approval.
