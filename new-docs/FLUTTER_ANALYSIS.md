# Flutter Application Analysis

## Scope and Source of Truth

This is a read-only analysis of `app/`, the Smart Air Flutter client. It is the authoritative reference for the React Native migration: preserve its behavior, API contract, visual system, and user flows. The Flutter app targets Android and iOS (web intentionally renders an unsupported notice because provisioning requires BLE).

`docs/DEVELOPMENT_LOG.md` was not present when this analysis was made.

## 1. Project Structure and Modules

| Location | Responsibility |
| --- | --- |
| `lib/main.dart` | Bootstrap: validates environment, disables runtime font downloads, adds Riverpod `ProviderScope`, refreshes devices when the app resumes, and creates `MaterialApp.router`. |
| `lib/core/` | Configuration, GoRouter, Dio client, bearer-token refresh interceptor, secure storage, typed exceptions, and back-navigation fallback. |
| `lib/design/` | Atmosphere design system: palette, spacing/radius tokens, typography, Material themes, and semantic Lucide icon registry. |
| `lib/models/` | API/domain models; Freezed and JSON generated code is checked in for most models. |
| `lib/services/` | REST, SSE, BLE, and local-device HTTP adapters. |
| `lib/providers/` | Riverpod state orchestration for auth, homes/rooms, devices/shadow/commands/telemetry, notifications, and OTA catalog. |
| `lib/screens/` | Page-level auth, homes, provisioning, devices, profile, and notification interfaces. |
| `lib/widgets/` | Shared visual atoms, device card, async rendering helper, persistent app shell, and BLE step shell. |
| `test/` | Unit, provider, widget, lifecycle, route-guard, and golden visual tests. |

`pubspec.yaml` configures SDK constraints (Dart 3, Flutter 3.10+), bundled fonts and image assets. `analysis_options.yaml` enables `flutter_lints` and ignores only `invalid_annotation_target`. `app/android` contains the native BLE/settings channel used by `BleService`.

The active feature modules are authentication, homes/rooms, device monitoring/control, notifications, OTA, and five-step provisioning. `screens/ble_scan_screen.dart`, `screens/provision/ble_scan_screen.dart`, `screens/provision/wifi_setup_screen.dart`, `widgets/add_device_sheet.dart`, and `ui_mockup.dart` exist but are not imported by the router; treat them as retained/legacy UI until product direction says otherwise.

## 2. Screens and UI

All routed pages use the Atmosphere system: Plus Jakarta Sans, semantic colors, rounded bordered cards, and shared `Atmosphere*` controls. Primary reachable screens are:

| Screen / route | Purpose and key interactions |
| --- | --- |
| Splash `/` | Restores auth state, then sends the user to login or Home. |
| Login `/login`, Register `/register` | Validated email/password forms; register auto-logs in. “Forgot password” is explicitly a coming-soon snackbar. |
| Home `/home` | Persistent tab; device list/cards, pull-to-refresh, home selector, and add-device entry. No home sends the user to create one. |
| Notifications `/notifications` | Persistent tab; notification list derived from REST/SSE; a tap opens its device. |
| Profile `/profile` | Persistent tab; account summary, home links, theme selector, about/logout. Profile editing and notification settings are coming soon. |
| Homes, Create Home, Home Detail | Browse/create homes; edit/delete a home; add/edit/delete rooms; invite a member. Home detail is reused from `/profile/home/:homeId`. |
| Provision steps 1–5 | Power-on instruction, BLE scan/preflight, Wi-Fi credential transfer, cloud-announce polling, then device name/room selection. `BleStepShell` supplies progress dots, cancellation, and CTAs. |
| Device dashboard `/devices/:id` | Device presence and mode switch, four live sensor tiles (temperature, humidity, CO, NO2) with 30-point sparklines, three relay cards (Fan/Lamp/Filter), recent commands, settings, and pull-to-refresh. It collapses sensor/relay grids for narrow width or larger text scaling. |
| Command history | Filterable all/done/failed/pending command list; tapping reveals selectable JSON payload. |
| Device settings | Rename/copy device ID/change room; opens OTA or CO/NO2 calibration; destructive deletion has confirmation. |
| Calibration | Three in-page states: instructions, pending calibration, and success/failure result. |
| OTA | Displays current version/online state and catalog entries; requests one update at a time. |

Important dashboard behavior: relay and mode actions are not optimistically committed. The UI tracks the returned command ID, waits for command/SSE status and matching reported shadow state, schedules a shadow refresh grace period, shows an offline-queue notice after the pending timeout, and displays error/timeout feedback.

## 3. Navigation and Authentication Flow

`GoRouter` uses `StatefulShellRoute.indexedStack` for persistent Home, Notifications, and Profile tabs. Detail, homes, provisioning, and device-setting routes sit outside the shell, so they do not show bottom navigation. `BackNavigationScope`/`handleBackOrFallback` supplies safe fallbacks for direct detail routes.

The router listens to `authProvider`: while state restores it avoids redirects; unauthenticated users may access only `/`, `/login`, and `/register`; all other locations redirect to `/login`; authenticated users at login/register redirect to `/home`. There are parameterized device, home, and calibration routes and query parameters for provisioning (`homeId`, `mac`, `deviceId`, `ssid`). No custom URL scheme, universal-link, or other deep-link configuration was found.

## 4. State Management and Data Flow

Riverpod 2 is the primary solution. `AsyncNotifierProvider` represents remote loading/data/error state; `family`/`autoDispose` scope state to a device or query. `AppState.themeMode` is a separate global `ValueNotifier` for light/dark/system theme.

- `authProvider`: restores persisted user/refresh token, handles login/register/logout, listens to forced logout, and invalidates session-scoped providers.
- `homesProvider` and `roomsProvider(homeId)`: CRUD updates immutable in-memory lists after API success.
- `devicesProvider`: device list and SSE updates for online status and reported mode/relays. `shadowProvider(deviceId)`, `commandsProvider(deviceId)`, telemetry snapshot/history/live providers own their respective views.
- `realtimeEventsProvider`: auto-disposed SSE stream. Device, telemetry, and notification providers subscribe and merge events into their current state.
- `notificationsProvider`: prepends de-duplicated notifications generated from device status, OTA, and terminal-command events; `otaCatalogProvider(deviceId)` fetches on demand.

Screens use `ConsumerWidget` or `ConsumerStatefulWidget`; local `State` is used for form controllers, loading flags, filters, dialogs, timers, and temporary selection. Data normally flows API/SSE → service → provider → widget; user mutations flow widget → notifier/service → API → provider state, then realtime reconciliation.

## 5. Models and Local Data

Freezed + `json_serializable` models are `User`, `Home`, `Room`, `Device`, `DeviceShadow`, `Command`, and `TelemetryPoint`. Snake-case server fields map through `@JsonKey`, including `home_id`, `relay_1`, `created_at`, `co_ppm`, and `no2_ppm`. `NotificationItem`, `RealtimeEvent`, `DeviceOtaCatalog`/`OtaVersionInfo`, and BLE structures are manual immutable classes.

Dates parse ISO strings and are generally converted to local time for display. Device IDs are trimmed/lower-cased before device API calls. `TelemetryPoint.tryFromJson` discards malformed timestamps. Secure storage persists only `refresh_token` and serialized `user_json`; the access token remains memory-only.

## 6. Services and API Integration

The shared Dio client uses `API_BASE_URL` (default `https://minhnhat05.xyz/api`), JSON headers, and 10-second connect/send/receive timeouts. `AuthInterceptor` adds `Authorization: Bearer <access token>`, performs exactly one shared in-flight refresh for non-auth 401 responses, retries once, then clears secure storage and signals forced logout. Services map server `{error}` bodies to `ApiException`; timeouts/connection errors become `NetworkException` where classified.

| Domain | Existing requests |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| Homes/rooms | `GET/POST /homes`, `PUT/DELETE /homes/:id`, `GET/POST /homes/:id/rooms`, `PUT/DELETE /rooms/:id`, `POST /homes/:id/invite` |
| Devices | `GET/POST /devices`, `PUT/DELETE /devices/:id`, `GET /devices/:id/shadow`, `PUT /devices/:id/shadow/desired`, `POST /devices/:id/command`, `/relay/:channel`, `/mode`, `/ota`, and `GET /ota/versions`, `/commands`, `/telemetry` |
| Notifications/realtime | `GET /notifications?limit=&before_id=` and authenticated `GET /realtime` SSE with `Last-Event-ID` replay. |

SSE reconnects with exponential backoff from one to 30 seconds. `replay.reset` marks connection degraded and reloads snapshots. Telemetry history uses ranges 1h/6h/24h/7d/30d and aggregation values `null`, `5m`, `15m`, `1h`, and `6h`.

Provisioning crosses three channels: BLE scans names beginning `SMART_AIR_` or legacy `SmartAir-`; it writes Wi-Fi SSID/password to FF01/FF02 and receives JSON via FF03; the app registers with `POST /devices`, sends the returned secret to the device-local `GET /api/info` then `POST /api/config`, and polls `GET /devices/announce/:id` for cloud acknowledgement. Preserve this ordering and its validation/timeouts.

## 7. Dependencies and React Native Equivalents

| Flutter package | Current role | React Native migration need |
| --- | --- | --- |
| `flutter_riverpod` | Async global/family state | Existing `mobileApp` state architecture; otherwise a typed store/query layer that supports subscriptions and cache invalidation. |
| `go_router` | Auth redirects and tab/detail navigation | React Navigation with protected stacks and persistent bottom tabs. |
| `dio` | REST, interceptors, SSE stream | Existing HTTP client plus interceptor/retry support; use an SSE-capable implementation. |
| `flutter_secure_storage` | Refresh token/user persistence | Keychain/Keystore-backed secure storage. |
| `flutter_blue_plus`, `permission_handler` | BLE scan/provision and platform preflight | A maintained BLE library plus platform permission/settings handling. |
| `wifi_scan` | Declared but no source use found | Do not add unless a migrated feature begins using it. |
| `freezed`, `json_serializable` | Immutable model generation | TypeScript interfaces plus explicit runtime validation/normalization. |
| `google_fonts` | Typography API; fonts are bundled | Load the existing local font files rather than remote fetching. |
| `lucide_icons` | Semantic icon map | Lucide React Native, preserving names and semantic registry. |
| `fl_chart` | Declared but no direct source use found; dashboard uses custom `SparklinePainter` | Implement sparklines with SVG/canvas; do not add a chart library merely for the current dashboard. |

## 8. Assets, Theme, and Configuration

Bundled assets are `assets/images/logo.png`, `device_placeholder.png`, Plus Jakarta Sans (400/500/600/700), and JetBrains Mono (400). Icons are Lucide; the dot logo and sparklines are custom painters, not image assets. There are no Lottie/Rive animation assets. Golden baselines under `test/goldens/goldens/` are visual migration references.

Use `design/tokens.dart` as the visual contract: brand `#0F6B5C`, accent `#2C6BF0`, semantic colors, spacing 2–32, card radius 22, button radius 14, input radius 16, and light/dark palettes. The design supports safe areas, text scaling, and responsive dashboard grids. Compile-time `API_BASE_URL` and `MQTT_BROKER_URI` configure runtime URLs; the app itself uses REST/SSE rather than direct MQTT.

## 9. Core Workflows and Background Behavior

1. **Session:** restore secure user data on launch; lazily refresh access token after a protected 401; logout clears local state even if server logout fails.
2. **Homes/devices:** users create/select homes, assign rooms, register/rename/move/delete devices, and invite members.
3. **Provisioning:** permission/Bluetooth/location preflight → scan → Wi-Fi write → local credential handoff → server announce polling → naming/room assignment → dashboard.
4. **Monitoring:** obtain REST snapshots, maintain a rolling 30-minute/720-point live series, and merge SSE telemetry/shadow/status updates.
5. **Control:** send typed relay/mode commands; reconcile command lifecycle with reported shadow before removing loading state.
6. **Maintenance:** send calibration commands and wait for completion; request OTA version update; derive in-app notifications from realtime activity.

On mobile resume, an authenticated session refreshes the device list. SSE lifecycle is tied to provider disposal/auth invalidation; it is not a native background service. No offline queue is stored locally—the “queued” message refers to server/device command delivery.

## 10. Migration Considerations and Recommended Order

| Module | Complexity | Risks/dependencies | Recommended order |
| --- | --- | --- | --- |
| Design tokens, fonts, atoms, shell | Medium | Pixel parity, dark theme, safe area, accessibility/text scaling | 1 |
| Models, env, secure session, HTTP/auth interceptor | High | Refresh rotation must be single-flight; do not persist access token | 2 |
| Router and auth screens | Medium | Preserve redirect rules and tab-stack behavior | 3 |
| Homes, rooms, device list/profile/notifications | Medium | Provider invalidation and SSE-derived notification mapping | 4 |
| Device dashboard, commands, shadow, telemetry | High | Race-safe command/shadow reconciliation and rolling telemetry normalization | 5 |
| BLE provisioning | Very high | Native permissions, Android API-level differences, GATT UUIDs, BLE/local HTTP/cloud ordering and timeouts | 6 |
| Calibration, OTA, golden/accessibility validation | Medium | Terminal command states, online gating, visual parity | 7 |

Before each migration module, inspect the named Flutter screen, providers, models, services, tests, and golden images. Reuse server request/response shapes exactly; do not substitute direct MQTT, modify the backend, redesign UI, or silently omit the retained legacy screens without an explicit product decision.
