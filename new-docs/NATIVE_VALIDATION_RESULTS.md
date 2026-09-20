# Native Validation Results

Date: 2026-09-20  
Phases: 5.1 and 5.3 — native validation; no product, Flutter, or backend contracts changed.

## Phase 5.3 update

`lucide-react-native` and its native `react-native-svg` peer were added for Flutter-equivalent semantic vector icons. Flutter's five checked-in fonts were registered through the React Native asset linker. A post-change Android debug build completed and generated `android/app/build/outputs/apk/debug/app-debug.apk` (166,428,490 bytes, 2026-09-20 03:37 ICT). The build executed `react-native-svg` codegen/compile tasks, so native SVG and Android font packaging are verified at build time.

The attempted post-change release build produced no updated release artifact or terminal success evidence in this constrained runner; do not treat the older release APK as Phase 5.3 validation. iOS still cannot be built here. No emulator/device session, screenshot comparison, Keychain exercise, or runtime API environment validation was performed.

## Phase 5.4 update

Release signing no longer falls back to the Android debug keystore. `assembleRelease` first failed as intended when the four `SMART_AIR_RELEASE_*` values were absent. It then passed with a one-day throwaway keystore in `/tmp` and `ENVFILE=../.env.production.example`; no production signing value or secret was written to the repository. The resulting APK is `android/app/build/outputs/apk/release/app-release.apk` (73,225,588 bytes, 2026-09-20 03:47 ICT). Archive inspection found `libreactnative`, `libreact_codegen_rnsvg`, and all five bundled Flutter fonts. Release minification remains disabled, so no R8/ProGuard shrinker result is claimed.

## Environment

| Item | Result |
| --- | --- |
| Build host | Linux 6.8, x86_64; OpenJDK 17.0.20 |
| Android tooling | Android SDK platform-tools present; no usable ADB daemon/device in this sandbox |
| iOS tooling | Not available: Linux host, no `xcodebuild` or CocoaPods |
| Active API environment | No `mobileApp/.env` file was present; `.env.example` defines the required `API_BASE_URL` shape without exposing an active value |

## Android

| Check | Result | Evidence / follow-up |
| --- | --- | --- |
| Gradle configuration | Pass with warnings | Autolinking/build reached `react-native-config`, Keychain, safe-area-context, screens, and new `react-native-svg`; AGP emits legacy variant/deprecation warnings. |
| `./gradlew assembleDebug` | Pass | Post-Phase-5.3 run generated `app/build/outputs/apk/debug/app-debug.apk`; SVG codegen/Java compile and linked Android font assets were included. |
| `./gradlew assembleRelease` | Pass for signing-path validation | A fresh APK was built with a temporary `/tmp` validation keystore and the non-secret production environment example. It is not production-signed. |
| APK generation | Debug and release verified | The release artifact path and native asset/module contents were inspected. |
| Environment loading | Partially verified | `react-native-config` is linked and `src/services/environment.ts` validates a build-time `API_BASE_URL`. Runtime validation is blocked because no active environment file/device session was available. |
| Release signing | Not release-ready | `release` currently uses the debug keystore, matching the generated project comment. Configure production signing outside source control before release. |

## iOS

Not tested. This host is not macOS and lacks Xcode/CocoaPods, so workspace generation, native-module linking, debug run, archive, and signing validation remain required on a macOS CI runner or developer machine.

## Device-Level Validation

Authentication (Keychain persistence, restart restoration, logout, and single-flight refresh), navigation, SSE connection/reconnect/background lifecycle, OTA request, and calibration timing were not exercised on a device or emulator. `adb devices` could not start its daemon in this sandbox due unavailable USB/netlink permissions. The automated suites below cover the corresponding unit/component contracts but do not replace native validation.

## Automated Verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test -- --runInBand` | Pass — 26 suites, 117 tests |

## Remaining Native Issues

1. Re-run and retain an Android release build with the protected production keystore, then verify its certificate and distribution-store requirements.
2. Add an active non-secret development environment file or CI environment injection, then confirm `API_BASE_URL` at runtime.
3. Replace debug-keystore release signing with protected production signing configuration.
4. Run iOS pod, simulator, archive, and signing checks on macOS.
5. Execute the Phase 5.0 device checklist for Keychain, navigation, SSE foreground/background lifecycle, command reconciliation, OTA, and calibration.
