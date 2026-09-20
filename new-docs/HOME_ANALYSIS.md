# Flutter Home Analysis

## Scope

This is a read-only analysis of Flutter’s routed `HomeScreen` (`app/lib/screens/home_screen.dart`). Flutter remains the source of truth. The screen is the Home branch of the persistent `StatefulShellRoute.indexedStack`, reached at `/home` after authentication; it is not a home-management or device-dashboard screen.

## 1. Screen Structure and Widget Hierarchy

```text
Scaffold (Atmosphere background)
├── AtmosphereAppBar.brand (dot logo + “Atmosphere”)
├── CustomScrollView
│   ├── Header: “My Devices” + monitoring subtitle
│   └── devicesProvider AsyncValue
│       ├── loading: three 140px rounded skeleton cards
│       ├── error: EmptyState + Retry
│       ├── empty: EmptyState + Add a device
│       └── data: padded SliverList<DeviceCard>
└── floating Add Device action
```

Each `DeviceCard` has a deterministic four-tone card treatment based on the device ID, device icon, truncated device name, optional uppercase mode pill, online/offline pill, room line, and full-width **View Detail** button. It has no inline device control. The tab itself does not implement pull-to-refresh.

## 2. Navigation Entry and User Actions

`router.dart` places `/home` in the first persistent shell branch; Home, Notifications, and Profile remain mounted when tabs change. Authenticated users arriving at `/`, `/login`, or `/register` redirect to `/home`.

- Tap a device/card action → `/devices/:id` (outside the tab shell; no bottom bar).
- Add Device with zero homes → `/homes/create`.
- With one home → `/provision?homeId=<encoded id>`.
- With multiple homes → modal “Choose a home” list (name/address); selecting one dismisses it and opens the same provisioning route.
- If homes are loading and have no cached values → show `Loading homes...` SnackBar and do not navigate.

## 3. State Management and Providers

`HomeScreen` is a Riverpod `ConsumerWidget`.

| Provider | Screen responsibility | Source / behavior |
| --- | --- | --- |
| `devicesProvider` | Primary list, loading/error/empty state | `AsyncNotifier`; initially calls `DeviceService.getDevices()`. |
| `homesProvider` | Add Device route selection only | `AsyncNotifier`; calls `HomeService.getHomes()`. It does not filter the device list. |
| `roomsProvider(homeId)` | Resolves `roomId` to card label | Family `AsyncNotifier`; requested once per distinct `device.homeId` represented in current device data. |
| `realtimeEventsProvider` | Indirect device-list updates | `devicesProvider` subscribes, not Home directly. |

The screen reads `devicesAsync.valueOrNull ?? []` before building room lookups. It builds a `roomId → room.name` map from any available room-provider values. A device with no room uses **No room assigned**; with an unresolved non-null room ID it shows **Room unavailable** (including while its room request is still pending or failed).

## 4. API Services and Models

| Need | Flutter service / endpoint | Contract used by Home |
| --- | --- | --- |
| Device summaries | `DeviceService.getDevices()` → `GET /devices` | Array of accessible devices; no Home query/filter is sent. |
| Homes for provisioning choice | `HomeService.getHomes()` → `GET /homes` | `id`, `name`, optional `address`, owner/timezone metadata. |
| Rooms for labels | `HomeService.getRooms(homeId)` → `GET /homes/:homeId/rooms` | `id`, `home_id`, `name`, optional icon. |

`Device` is a Freezed model: `id`, `name`, `homeId` (`home_id`), optional `roomId` (`room_id`), `online` (default false), `lastSeen`, `firmwareVer`, `mode`, `relay1..3`, and `createdAt`. Preserve snake_case only at the transport boundary in React Native, normalizing to typed TypeScript domain models once. `Home` contains `id`, `name`, optional `address`/`ownerId`, and timezone; `Room` contains `id`, `homeId`, `name`, optional icon.

## 5. Device Data Flow

```text
GET /devices → DeviceService → devicesProvider → Home list / DeviceCard
GET /homes/:homeId/rooms → roomsProvider(homeId) → room-name map → DeviceCard
SSE device.status / shadow.reported → devicesProvider patches summary fields → card rerender
SSE replay.reset → devicesProvider refetches GET /devices
```

`device.status` patches `online`, `lastSeen`, and optional firmware. `shadow.reported` patches summary `mode` and relay values. Home currently displays only status/mode, but the React Native query cache must retain these updates so the list remains consistent with later dashboard work. `replay.reset` triggers a guarded refetch; concurrent refreshes are suppressed. The authenticated Axios layer must continue to provide the existing Bearer/refresh behavior.

## 6. Loading, Error, and Empty Behavior

- **Loading:** exactly three neutral `line2` skeleton blocks, 140px high, 16px apart, padded horizontally by 20px. Header and FAB remain available.
- **Device error:** a non-scrolling centered `EmptyState`: warning icon, **Failed to load devices**, raw error text, and **Retry**, which invalidates/refetches `devicesProvider`.
- **No devices:** centered radar empty state: **No devices yet**, explanatory copy, and **Add a device**. The FAB performs the same action.
- **Rooms/homes:** their errors do not replace the device list. Homes only influence Add Device; room failures degrade a card label to **Room unavailable**.

## 7. Required React Native Components

Implement only after a feature plan is approved:

| Flutter element | React Native equivalent |
| --- | --- |
| `CustomScrollView` + `SliverList` | `FlatList` with `ListHeaderComponent`, `ListEmptyComponent`, and padded footer. |
| `AtmosphereAppBar.brand` | Safe-area-aware shared brand app bar. |
| `DeviceCard`, status/mode pills, ghost button | Typed shared card/pill/button components using Atmosphere tokens. |
| Skeleton `Container`s | Three fixed-height skeleton views; no new dependency required. |
| `EmptyState` | Shared centered empty/error component with accessible Retry/Add Device actions. |
| `FloatingActionButton` / modal sheet | Positioned Pressable plus accessible bottom-sheet implementation; reuse existing dependencies or propose one before installation. |
| `devicesProvider` | TanStack Query `['devices']`, a typed device API service, and later SSE cache patch/invalidation. |
| `roomsProvider(homeId)` | Parameterized `['rooms', homeId]` queries; combine available results into a room-name lookup. |
| `homesProvider` | `['homes']` query used only by the Add Device decision tree. |

## 8. Migration Constraints and Test Cases

Do not introduce Home filtering, optimistic device controls, direct MQTT, or a new API. Preserve all copy, route parameters, state fallbacks, and the one-home/many-homes decision tree. Add React Native tests for populated/empty/error/loading states, room-name fallback, Add Device branching, navigation to device detail/provisioning, and SSE/query-cache patch behavior. Use Flutter’s `home_screen_test.dart`, `devices_provider_test.dart`, 390dp counterpart tests, and Home golden images as migration references.
