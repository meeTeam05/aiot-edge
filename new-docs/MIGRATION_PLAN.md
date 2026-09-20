# React Native Migration Architecture Plan

## Scope and Constraints

This plan defines the architecture for the future `mobileApp/` React Native TypeScript client. `mobileApp/` does not yet exist. It must reproduce the routed Flutter application in `app/`; `docs/FLUTTER_ANALYSIS.md` defines mobile behavior and UI, while `docs/API_ANALYSIS.md` defines backend contracts. No application code or dependencies are created by this plan.

Use functional components, hooks, TypeScript, React Navigation, REST, and SSE. Preserve the Atmosphere design system, Flutter navigation behavior, endpoint paths/payloads, access-token lifecycle, and command/shadow reconciliation. Do not connect mobile directly to MQTT or change `server/`.

## 1. Proposed Project Structure

```text
mobileApp/
├── src/
│   ├── app/                 # app providers, bootstrap, lifecycle listeners
│   ├── navigation/          # root/auth/tab/detail navigators and typed params
│   ├── features/
│   │   ├── auth/            # screens, auth API, hooks, validators
│   │   ├── homes/           # homes, rooms, membership UI
│   │   ├── devices/         # list, dashboard, commands, shadow, telemetry
│   │   ├── notifications/   # feed and event mapping
│   │   ├── provisioning/    # BLE preflight and five provisioning steps
│   │   ├── ota/
│   │   └── settings/        # calibration and device settings
│   ├── components/
│   │   ├── atoms/           # buttons, fields, cards, pills, switches
│   │   ├── shell/           # app bar, bottom tabs, BLE step shell
│   │   └── charts/          # sparkline implementation
│   ├── design/              # colors, spacing, radius, type, icons, themes
│   ├── api/                 # HTTP client, endpoint functions, errors, SSE client
│   ├── models/              # domain interfaces and DTO normalizers
│   ├── state/               # session/UI stores and query-key definitions
│   ├── services/            # BLE, secure storage, environment, local-device HTTP
│   ├── hooks/               # reusable feature-independent hooks
│   ├── assets/              # migrated fonts/images
│   └── test/                # unit/component/contract/visual test helpers
├── android/ ios/
└── package.json
```

Keep feature code cohesive: a screen should depend on its feature hook and shared components, not issue HTTP requests itself. Keep server DTO normalization at the API/model boundary, not scattered through rendering code.

## 2. Navigation Architecture

Use a `NavigationContainer` with a typed root navigator:

```text
Root
├── Bootstrap (restore secure session)
├── Auth stack: Login, Register
└── App stack
    ├── Bottom tabs: Home, Notifications, Profile
    ├── Homes stack: Homes, Create Home, Home Detail
    ├── Provision stack: Power On → BLE Scan → Wi-Fi → Cloud → Name
    └── Device stack: Dashboard → Commands / Settings → Calibration / OTA
```

The bootstrap gate replaces Flutter’s splash and router redirect logic: while secure session restoration is pending, render Splash; without a session, render only the auth stack; with a session, render the app stack. Clear session and reset to auth after a terminal refresh failure. Tabs remain mounted/persistent when switching, matching Flutter’s indexed shell. Detail/provision pages are pushed above tabs and therefore do not show bottom navigation.

Define a `RootParamList` for `homeId`, `deviceId`, calibration `sensor`, and provisioning state (`homeId`, `mac`, `deviceId`, optional `ssid`). No deep link configuration is required initially because Flutter has none; add it only with an explicit product/backend requirement.

## 3. State Management Strategy

Use a two-layer model, subject to dependency approval when `mobileApp/` is created:

| Flutter Riverpod responsibility | React Native solution |
| --- | --- |
| `AsyncNotifierProvider` remote state | TanStack Query (or the project’s existing equivalent): query keys, loading/error data, mutation invalidation, and stale snapshot refresh. |
| Riverpod families by device/home | Parameterized query keys, for example `['shadow', deviceId]` and `['commands', deviceId]`. |
| `authProvider` and forced-logout signal | Small Zustand store (or Context + reducer if no store is approved) for session, access token, restored state, theme, and logout/reset action. |
| `realtimeEventsProvider` | One authenticated SSE service that feeds query-cache updates and invalidations. |
| Widget-local `State` | `useState`, `useReducer`, refs, and screen-scoped timers/controllers. |
| `AppState.themeMode` | Persisted UI preference in the session/UI store; use system appearance when selected. |

TanStack Query owns server snapshots; the store must not duplicate device, telemetry, or command lists. Feature hooks encapsulate mutations and their cache updates. On logout, clear query cache, stop SSE, clear only secure session data, and reset navigation.

## 4. API and Realtime Layer

`api/httpClient.ts` should accept a base URL from environment configuration, defaulting only through a documented development configuration—not a hardcoded production secret. It sends JSON, has 10-second connect/send/receive-equivalent behavior where the chosen client supports it, and normalizes `{error}` into typed `ApiError`/`NetworkError` values.

The request interceptor reads the in-memory access token and attaches `Authorization: Bearer <token>` except on login, register, and refresh. The response interceptor must:

1. Ignore auth-route 401s and already retried requests.
2. Share exactly one refresh promise across concurrent protected 401s.
3. Call `POST /auth/refresh` with the secure refresh token.
4. Replace the in-memory access token and stored refresh token, retry the failed request once.
5. On refresh failure, securely clear session, stop realtime, clear query cache, and return to Auth.

Secure storage persists `refreshToken` and serialized user only. Access tokens remain memory-only. Do not log tokens or the one-time provisioning `secret_key`.

`api/realtime.ts` opens `GET /realtime` with the bearer token, retains the last numeric event ID, parses SSE frames, reconnects from one to 30 seconds, and sends `Last-Event-ID` when supported by the selected client. Handle `device.status`, `telemetry.point`, `shadow.reported`, `command.updated`, and `ota.progress` by safely merging or invalidating the corresponding query. On `replay.reset`, refetch relevant REST snapshots. Stop it on logout and when no authenticated app session exists.

## 5. Data Model Mapping

Place API-shaped DTOs and app interfaces in `src/models/`. Preserve server snake_case at the transport boundary; normalize only once to camelCase domain objects if that convention is adopted.

| Flutter model | TypeScript domain/interface |
| --- | --- |
| `User` | `User { id, email, fullName? }` |
| `Home`, `Room` | `Home`, `Room` with timezone/address and home membership references |
| `Device`, `DeviceShadow` | `Device`, `DeviceShadow { reported, desired, updatedAt }` |
| `Command` | Discriminated `CommandPayload` (`relay_set`, `device_mode`, calibration, `set_time`) and `Command` status union |
| `TelemetryPoint` | `TelemetryPoint { ts: Date, temperature?, humidity?, coPpm?, no2Ppm?, mode? }` |
| `RealtimeEvent`, `NotificationItem` | `RealtimeEvent` union by event type and `NotificationItem` |
| OTA models | `OtaVersionInfo`, `DeviceOtaCatalog` |
| BLE models | `BleDeviceInfo`, `BlePreflightStatus`, `BleProvisioningResult`, `SensorSnapshot` |

Use runtime guards/normalizers for untrusted JSON, ISO dates, optional fields, and lowercase MAC device IDs. Preserve command statuses `pending | sent | done | error | timeout` exactly.

## 6. Design System Migration

Create `design/tokens.ts` before screens. It is the single source for the values in Flutter `design/tokens.dart`: brand `#0F6B5C`, accent `#2C6BF0`, semantic palette, 2–32 spacing scale, and radii 22/14/16/999. Add light/dark palettes matching `palette.dart` and use `StyleSheet`/theme hooks rather than raw colors in feature screens.

| Flutter system | React Native equivalent |
| --- | --- |
| `AtmosphereTheme`, `Palette` | Theme provider plus typed `useColors()` hook. |
| Plus Jakarta Sans / JetBrains Mono | Bundle the same font files; map weights 400/500/600/700 and mono text style. |
| `AtmosphereCard`, buttons, fields, pills, switch | Shared typed atom components with matching border, radius, padding, semantic labels, disabled/loading states. |
| App shell/app bar/bottom nav | Safe-area-aware shared shell components and React Navigation tab bar. |
| `BleStepShell`, `StepDots` | Shared provisioning layout and progress indicator. |
| `CustomPainter` dot logo/sparkline | SVG/canvas implementation that preserves geometry and last-30-point rendering behavior. |

Treat Flutter golden images as visual acceptance references. Preserve responsive dashboard behavior: one or two sensor columns based on narrow width/text scale, relay collapse at large type, safe areas, and accessible labels.

## 7. Feature Migration Order

1. Scaffold `mobileApp/`, TypeScript/tooling, environment boundary, assets, design tokens, shared atoms, and test harness.
2. Implement models, secure session, HTTP client, token refresh, error normalization, and protected navigation.
3. Build Splash, Login, Register, persistent tabs, Home device list, Profile theme/logout, and empty/error/loading states.
4. Migrate homes/rooms/home detail and notification REST feed, then attach SSE cache updates.
5. Migrate device dashboard: snapshots, live telemetry window (30 minutes/720 points), sparklines, command history, shadow, relay/mode state reconciliation, and settings.
6. Migrate calibration and OTA using existing command/OTA contracts.
7. Migrate native BLE preflight and all five provisioning screens after the backend/auth/device foundations are verified.
8. Run behavior, accessibility, device, and visual parity validation; resolve retained Flutter legacy-screen scope by explicit decision.

## 8. Technical Risks and Solutions

| Risk | Required solution |
| --- | --- |
| Refresh-token rotation/replay detection | A single-flight refresh coordinator; never issue parallel refresh calls. |
| SSE client differences across RN platforms | Validate headers and reconnect support before adopting a library; retain last event ID and REST fallback. |
| Command status races | Track command ID per pending control; resolve only after terminal command state and matching reported shadow, with the Flutter grace/queue feedback. |
| BLE/native variance | Isolate BLE behind `services/ble`; test Android API permission paths, Bluetooth/location/settings flows, GATT FF01–FF03, and local HTTP. |
| Pixel drift | Implement tokens/atoms first and compare each screen to Flutter golden references at representative widths and theme modes. |
| API contract drift | Keep endpoint DTOs centralized; add contract tests using documented payloads and do not use direct MQTT. |
| New dependencies | `mobileApp/` has no manifest yet. Obtain approval and record the reason before adding navigation, query/store, secure-storage, SSE, BLE, SVG, or font packages. |

## Implementation Guardrails

Before each feature, read `docs/DEVELOPMENT_LOG.md`, the relevant Flutter screen/provider/service/test, and the API contract. State the proposed files and narrow scope before editing. After completing a feature, document its implementation, verification, issues, and next step in `docs/DEVELOPMENT_LOG.md`.




---

## 9. Technology Decisions

This section defines the approved technology choices for /mobileApp.

Do not replace these technologies without explicit approval.

### Core Framework

Framework:

- React Native
- TypeScript


### Navigation

Use:

- React Navigation

Architecture:

- Root Navigator
- Auth Stack
- App Stack
- Bottom Tab Navigator
- Feature-specific Stack Navigator


Navigation rules:

- Preserve Flutter navigation behavior.
- Protected routes must match Flutter auth rules.
- Detail screens must not display bottom tabs unless Flutter does.


### State Management

Use a two-layer state architecture.


## Server State

Technology:

- TanStack Query


Responsibilities:

- API data fetching
- Cache management
- Query invalidation
- Loading/error states
- Background refresh


Managed data:

- Homes
- Rooms
- Devices
- Shadow state
- Commands
- Telemetry
- Notifications


Do not duplicate server state inside global stores.


## Client State

Technology:

- Zustand


Responsibilities:

- Authentication session
- Access token memory state
- Theme preference
- UI-only state
- Temporary application state


Do not store:

- Device lists
- Telemetry
- Commands

inside Zustand.


### HTTP Client

Use:

- Axios


Responsibilities:

- API requests
- Authorization headers
- Refresh token interceptor
- Error normalization


Rules:

- Never hardcode production URLs.
- Never log tokens.
- Preserve backend request/response contracts.


### Secure Storage

Use:

- Keychain/Keystore compatible storage.


Store:

- refreshToken
- serialized user data


Never store:

- accessToken
- device secret_key


### Realtime Communication

Use:

- Server Sent Events (SSE)


Rules:

- Mobile communicates with backend through REST/SSE.
- Mobile must not connect directly to MQTT.
- Preserve Last-Event-ID replay behavior.


### BLE

BLE implementation must be isolated:

services/ble/

The BLE library choice must:

- Support Android and iOS.
- Support required GATT characteristics.
- Support permission handling.

Do not mix BLE logic with UI components.

---

# 10. Feature Development Workflow

Every feature migration must follow this workflow.


## Step 1 - Analyze

Before coding:

Read:

- Flutter screen
- Flutter providers
- Flutter services
- Flutter models
- API contract


Create implementation understanding.


## Step 2 - Plan

Before modifying code:

Describe:

- Files to create
- Files to modify
- Data flow
- Testing approach


Do not start coding without a plan.


## Step 3 - Implement

Implementation requirements:

- Follow AGENTS.md rules.
- Use existing architecture.
- Avoid unnecessary dependencies.
- Preserve Flutter behavior.


## Step 4 - Validate

After implementation:

Verify:

- UI behavior
- API communication
- Loading states
- Error handling
- Navigation behavior
- Edge cases


## Step 5 - Document

After completion:

Update:

docs/DEVELOPMENT_LOG.md


Include:

- Feature name
- Implementation summary
- Files changed
- Testing result
- Known issues
- Next steps


---

# 11. Definition of Done

A feature is considered completed only when:


## Functionality

- Feature works correctly.
- User flow matches Flutter.
- Backend API integration works.


## UI

- Layout matches Flutter.
- Colors match design tokens.
- Typography matches.
- Responsive behavior is preserved.


## Code Quality

- TypeScript types are defined.
- Components follow project architecture.
- No unnecessary dependencies added.


## Testing

Completed:

- Unit tests where applicable.
- Component tests where applicable.
- Manual verification.


## Documentation

Completed:

- DEVELOPMENT_LOG.md updated.
- Known limitations documented.


---

# 12. Phase Implementation Plan


## Phase 1: React Native Foundation

Goal:

Create the base mobileApp project.


Tasks:

- Initialize React Native TypeScript project.
- Configure TypeScript.
- Configure environment variables.
- Setup folder structure.
- Setup design tokens.
- Setup theme foundation.
- Setup testing framework.


Output:

Working React Native application shell.


---

## Phase 2: Authentication Foundation


Tasks:

- Secure storage.
- HTTP client.
- Token handling.
- Refresh interceptor.
- Login/Register.
- Protected navigation.


Output:

User can authenticate and enter the application.


---

## Phase 3: Core Application


Tasks:

- Bottom tab navigation.
- Home.
- Profile.
- Homes and rooms.


Output:

Main application flow completed.


---

## Phase 4: IoT Features


Tasks:

- Device list.
- Device dashboard.
- Shadow state.
- Commands.
- Telemetry.
- SSE realtime.


Output:

Main IoT functionality completed.


---

## Phase 5: Advanced Features


Tasks:

- BLE provisioning.
- Calibration.
- OTA.


Output:

Complete feature parity with Flutter.


---

# 13. Migration Completion Criteria

Migration is completed when:


- React Native reproduces Flutter user flows.
- All required APIs are integrated.
- Backend remains unchanged.
- UI matches approved Flutter behavior.
- Tests pass.
- Documentation is complete.
- DEVELOPMENT_LOG.md contains migration history.



## Dependency Management Rules

Before installing any package:

Explain:

- Why this dependency is required.
- Why existing dependencies cannot solve the problem.
- Impact on bundle size and maintenance.

Never install packages automatically without approval.

After adding dependency:

Update package documentation.



## Environment Rules

Use separate environments:

.env.development
.env.production


Never:

- Hardcode API URL.
- Commit secrets.
- Store credentials in source code.


Environment variables must be documented.



## Git Workflow

For each migration feature:

Create a dedicated branch.

Example:

feature/mobileApp-auth
feature/mobileApp-device-dashboard


Commit format:

feat(mobileApp): migrate login screen

Before merging:

- Tests pass.
- DEVELOPMENT_LOG.md updated.
- Migration notes completed.



