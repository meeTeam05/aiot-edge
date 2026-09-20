# Phase 7 Migration Status Report

Audit date: 2026-09-20  
Scope: repository inspection only; Flutter (`app/`) remains the source of truth.

## 1. Overall Status

**In progress (not formally started in `DEVELOPMENT_LOG.md`).**

There is no Phase 7 entry in the development log. However, the React Native app already contains substantial implementations for the Flutter-analysis Phase 7 areas—calibration, OTA request/catalog, dashboard control, and their tests. It is therefore neither “not started” nor complete: it needs a formally tracked Phase 7 continuation focused on the remaining realtime, maintenance, home-management, and validation gaps.

## 2. Feature Status Table

| Feature | Status | Evidence | Missing / risk |
|---|---|---|---|
| Home Dashboard | Partial | `mobileApp/src/features/home/{HomeScreen.tsx,components/DeviceSummaryCard.tsx,hooks/useHomeQueries.ts}`; `homeUi`, `homeDataFoundation`, and `homeNavigation` tests | Device cards show name, room, mode, and online state, but not Flutter’s dashboard-grade sensor summaries. There is no persistent active-home filter/state equivalent to Flutter’s home selector behavior. |
| Device Detail | Mostly completed | `features/device/DeviceDetailScreen.tsx`, `components/DeviceDashboardBlocks.tsx`, dashboard API/query hooks; `deviceDashboard*` tests | Core status, sensor tiles/sparklines, relays, mode, pull-to-refresh, settings and command-history entries exist. Real-device/SSE and visual/accessibility parity remain to be validated. |
| Device Control | Mostly completed | `api/deviceCommandApi.ts`, `hooks/useDeviceCommandMutations.ts`, `hooks/useDeviceControls.ts`, `services/commandReconciliation.ts`; `deviceCommandFoundation` and `deviceControlIntegration` tests | Relay and mode controls use command/shadow reconciliation. Broader device-setting and physical-device command behavior still need parity validation. |
| Data Layer | Mostly completed | Shared `api/httpClient.ts`, feature APIs, TanStack Query hooks, `state/sessionStore.ts`, provisioning Zustand session, `services/realtime/*` | Strong typed Axios/query boundaries and targeted cache updates exist. Missing feature domains (home CRUD and realtime notifications/OTA progress) are not yet represented in the cache router. |
| Notifications | Partial | `features/notifications/{NotificationsScreen.tsx,api/notificationsApi.ts,hooks/useNotificationsQuery.ts}`, REST/UI tests | REST first-page list works. RN explicitly defers realtime notification cache updates; unlike Flutter’s `notifications_provider.dart`, it does not derive/de-duplicate items from device, command, or OTA SSE events. No native push implementation was found in either client. |
| OTA Firmware Update | Partial | `features/device/ota/{OtaScreen.tsx,api, hooks,models}`, `deviceOta*` tests | Catalog display and `202 Accepted` request flow exist. `ota.progress` is parsed by RN realtime models but not routed to OTA UI/cache; no in-app progress/reboot/failure lifecycle is shown. |
| Calibration | Mostly completed | `features/device/calibration/{CalibrationWizardScreen.tsx,api,hooks,services,models}`, calibration tests | CO/NO2 start, poll, retry, instructions, and result UI exist. Needs physical-device timing/terminal-state validation and visual/accessibility parity. |
| Command history | Mostly completed | `features/device/commands/*`; command-history UI/data tests | Filtering, refresh, status presentation, and payload sheet exist. Verify full Flutter visual parity and live event behavior on device. |
| Device settings | Mostly completed | `features/device/settings/*`; settings UI/data tests | Rename, copy ID, room assignment, delete, OTA and calibration entry points exist. Needs end-to-end mutation/error and visual validation. |
| Homes and household management | Partial / largely missing | RN has `homeApi.listHomes`, `HomeSelector`, and profile home listing; Flutter has `homes_screen.dart` and `profile/home_detail_screen.dart` | RN lacks home browse/detail/edit/delete, room CRUD, member invite/manage flows, and related navigation. |
| Profile and auth | Partial | `features/profile/*`, `features/auth/*`, root/auth navigation and data tests | Login/register/session/theme/logout are present. Flutter home-detail management is absent; profile-edit and notification settings are also future/coming-soon in Flutter, so they are not RN parity blockers. |
| Provisioning | Mostly completed | `features/provision*`, `features/provisioning/*`, devices name/room/completion features; 6.5/6.6 log entries and tests | Functional lifecycle has been implemented through final cache handoff. Native BLE/local-network/real-device verification and deliberate comparison with Flutter’s combined optional name/room step remain. |

## 3. Existing Implementation Evidence

### Home dashboard and home data

- Screens/components: `mobileApp/src/features/home/HomeScreen.tsx`, `components/{HomeHeader,HomeSelector,DeviceSummaryCard,HomeEmptyState,HomeLoadingState}.tsx`.
- Data: `api/homeApi.ts`, `services/homeDataService.ts`, `hooks/useHomeQueries.ts`, `models/homeModels.ts`.
- Tests: `homeUi.test.tsx`, `homeDataFoundation.test.ts`, `homeNavigation.test.tsx`.

### Device monitoring, detail, and controls

- Screen/components: `features/device/DeviceDetailScreen.tsx`, `components/{DeviceDashboardBlocks,Sparkline}.tsx`.
- Data/control: `api/{deviceDashboardApi,deviceCommandApi}.ts`, `hooks/{useDeviceDashboardQueries,useDeviceControls,useDeviceCommandMutations}.ts`, `services/commandReconciliation.ts`.
- Tests: `deviceDashboardUi.test.tsx`, `deviceDashboardDataFoundation.test.ts`, `deviceCommandFoundation.test.tsx`, `deviceControlIntegration.test.tsx`.

### Realtime and cache architecture

- App root: `mobileApp/src/app/RootApp.tsx` provides TanStack Query, theme, safe-area, navigation, and `RealtimeProvider`.
- Query keys: home (`['devices']`, `['homes']`, `['rooms', homeId]`), device (`['device', id]`, shadow, telemetry, commands), notifications, OTA, calibration.
- Realtime: `services/realtime/{realtimeClient,realtimeEvents,realtimeEventRouter,RealtimeProvider}.ts(x)` patches device/shadow/telemetry/command caches and invalidates snapshots on replay reset.
- State: `state/sessionStore.ts` owns authenticated session; `features/provisioning/session/provisioningSessionStore.ts` owns temporary serializable provisioning state.
- Tests: `realtimeArchitecture.test.ts`, plus feature-specific query/mutation tests above.

### Notifications

- Screen/data: `features/notifications/{NotificationsScreen.tsx,api/notificationsApi.ts,hooks/useNotificationsQuery.ts,models/notificationModels.ts}`.
- Tests: `notificationsUi.test.tsx`, `notificationsDataFoundation.test.ts`.
- Parity finding: Flutter `providers/notifications_provider.dart` creates notifications from realtime device/command/OTA events; RN’s `NotificationsScreen.tsx` documents this as deferred.

### OTA and calibration

- OTA: `features/device/ota/{OtaScreen.tsx,api/deviceOtaApi.ts,hooks/useDeviceOta.ts,models/otaModels.ts}`; tests `deviceOtaUi.test.tsx`, `deviceOtaDataFoundation.test.ts`.
- Calibration: `features/device/calibration/{CalibrationWizardScreen.tsx,api/calibrationApi.ts,hooks/useCalibration.ts,services/calibrationPolling.ts,models/calibrationModels.ts}`; tests `calibrationWizardUi.test.tsx`, `calibrationDataFoundation.test.ts`.

### Other established RN surfaces

- Command history: `features/device/commands/*`, with UI/data tests.
- Settings: `features/device/settings/*`, with cache mutation coverage.
- Auth/profile/navigation: `features/{auth,profile}/*`, `navigation/{RootNavigator,AppNavigator,AppTabNavigator}.tsx`, and auth/profile/navigation tests.
- Provisioning and post-provisioning: Phase 6.5/6.6 implementation is recorded in `docs/DEVELOPMENT_LOG.md` and has dedicated BLE, provisioning, naming, room, completion, and final-handoff tests.

## 4. Missing Migration Items

1. Add realtime-derived notification mapping, cache insertion/de-duplication, and replay-reset behavior equivalent to Flutter’s `NotificationsNotifier`.
2. Route `ota.progress` events into a typed OTA cache/UI state for request, download/apply, reboot, success, and failure feedback; preserve the current `202` request semantics.
3. Finish home/household management: homes list/detail, home edit/delete, room CRUD, member invite/manage, and navigation parity with Flutter’s home-detail screen.
4. Decide whether Home cards need Flutter-equivalent sensor summaries and implement active-home filtering only after comparing exact Flutter interaction requirements.
5. Validate device-detail/control, OTA, calibration, and provisioning behavior against a real device and backend SSE timing.
6. Perform visual, accessibility, font-scale, narrow-layout, and dark-theme parity checks for the completed feature set; Flutter has responsive dashboard behavior that needs device-level confirmation.
7. Confirm the intentionally split/required RN room-assignment and additional completion screen are accepted product deviations from Flutter’s combined optional Step 5.

## 5. Recommended Next Phase

**Continue existing Phase 7 as Phase 7.1: Realtime Notifications and OTA Progress.**

This is the highest-value cohesive slice because RN already has the authenticated SSE client, typed event parser, query cache router, REST notifications screen, and OTA request UI. Completing those missing event routes closes the clearest functional gaps without adding a new backend contract. Follow with Phase 7.2 for household/home management and Phase 7.3 for device/visual/physical validation.
