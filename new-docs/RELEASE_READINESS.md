# Release Readiness

## Status

The React Native release pipeline is validated, but this is **not yet production-ready**. Android release packaging passed with a temporary validation keystore; production signing, iOS archive validation, API/device checks, and visual evidence remain required.

## Completed validation

| Check | Result |
| --- | --- |
| TypeScript, ESLint, Jest | Pass — 26 suites, 117 tests |
| Android debug APK | Pass |
| Android release APK | Pass with temporary `/tmp` keystore only |
| Release artifact | `mobileApp/android/app/build/outputs/apk/release/app-release.apk` (73,225,588 bytes) |
| Native package contents | `libreactnative`, `libreact_codegen_rnsvg`, and all five Flutter font assets present |
| Minification | Disabled (`enableProguardInReleaseBuilds = false`); no shrinker behavior is claimed |
| Source audit | No source `console.*` calls, custom debug menu, or app-level development flag found; direct runtime dependencies are referenced by app code or required native/navigation integration |

## Blocked validation

- Production keystore/certificate, signing identity, and store upload credentials were intentionally not supplied.
- iOS pods, archive, signing, and device run require macOS/Xcode.
- A real release API environment, Keychain/session checks, SSE lifecycle, and Flutter-vs-RN screenshot comparison require a device/emulator.

## Required production configuration

Never commit a keystore or signing values. In protected CI secrets or untracked Gradle properties, provide:

- `SMART_AIR_RELEASE_STORE_FILE`
- `SMART_AIR_RELEASE_STORE_PASSWORD`
- `SMART_AIR_RELEASE_KEY_ALIAS`
- `SMART_AIR_RELEASE_KEY_PASSWORD`

Release builds intentionally fail when any value is absent. Use an untracked `.env.production` based on `mobileApp/.env.production.example`, or set `ENVFILE` to a protected CI environment file. It must define only the public API endpoint, for example `API_BASE_URL=https://api.example.com/api`; never place tokens or device secrets there.

## Android release procedure

1. Run `npm ci` in `mobileApp/` and supply protected signing/environment values.
2. Run `cd android && ENVFILE=../.env.production ./gradlew assembleRelease`.
3. Verify `app/build/outputs/apk/release/app-release.apk`, its signing certificate, API endpoint, and required native assets.
4. Install on a physical device and complete `docs/NATIVE_VALIDATION_CHECKLIST.md` before distribution.

## iOS release procedure

1. On macOS, provide the protected release environment and signing profile.
2. Run `cd mobileApp/ios && ENVFILE=../.env.production pod install`.
3. Archive the `mobileApp` Release scheme in Xcode or with `xcodebuild archive`; validate signing and bundled fonts.
4. Run the native checklist and attach visual-comparison evidence before App Store submission.
