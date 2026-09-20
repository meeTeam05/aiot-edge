# Profile and Notifications Analysis

## Scope

This document records the current Flutter behavior in `app/` before migrating the persistent Profile and Notifications tabs. Flutter is the source of truth; the existing backend and its contracts must be reused unchanged.

## Profile

### Structure and user information

`ProfileScreen` is the third persistent shell tab at `/profile`. It uses the branded Atmosphere app bar and a padded `ListView` containing:

1. **Profile** title.
2. Account card: a 64px brand-tint initial avatar, optional `User.fullName`, required session email, and Edit icon.
3. **HOMES** card: rows for `homesProvider`, each navigating to `/profile/home/:homeId`; it shows a spinner while loading, `No homes yet` when empty, or `Failed to load homes` on error.
4. **APP SETTINGS** card: Theme selector, Notifications, and About rows.
5. Confirmation-backed danger **Logout** button.

`User` is the session model (`id`, `email`, nullable `full_name`/`fullName`); no `/users/me` or profile-edit API exists. The avatar initial uses the first full-name character, otherwise email, otherwise `?`.

### Settings and logout

Theme is a Flutter-only in-memory `ValueNotifier<ThemeMode>` with Light, Dark, and System choices; it defaults to Light and is not persisted or sent to the API. Edit Profile and Notification Settings deliberately show `coming soon` snackbars. About opens a dialog with `Smart Air v0.1.0` and the product description.

Logout shows Cancel/Logout confirmation. Confirming calls `authProvider.logout()`: `POST /auth/logout` is attempted with Bearer authentication, errors are ignored, local access/refresh/user state is cleared, and session-scoped device/home/realtime providers are invalidated. The backend revokes all refresh sessions and returns `{ success: true }` when reachable.

### Profile APIs and state

Profile uses no dedicated API. It reads the restored auth user and `homesProvider`, whose initial request is `GET /homes`. Home management is outside this tab: the selected row opens the existing home-detail route. The current React Native Profile screen is only a logout placeholder.

## Notifications

### Structure and states

`NotificationsScreen` is the second persistent tab at `/notifications`. It has the brand app bar, a `Notifications` title, and an expanded feed.

- **Loading:** four `line2` skeleton cards, 108px high, 12px apart.
- **Data:** separated 16px-horizontal cards. Each card has a severity-colored 40px icon tile; title; body; device name; and local `d/M HH:mm` timestamp. Tapping it pushes `/devices/:id` outside the tab shell.
- **Empty:** shared empty state: `No notifications yet`, explanatory device-event copy, and **Open devices**, which goes to `/home`.
- **Error:** shared warning empty state, raw error text, and **Retry**, which invalidates the provider.

### Model and REST contract

`NotificationItem` maps server fields to `id`, `type`, `deviceId`, `deviceName`, `title`, `body`, `severity`, `occurredAt`, and arbitrary `payload`. `occurred_at` is parsed to local time; an invalid/missing timestamp falls back to local Unix epoch. Severity is normally `success`, `warning`, `danger`, or `info`.

`NotificationService.listNotifications()` calls authenticated `GET /notifications?limit=50`, with optional `before_id` for older numeric event IDs. The backend accepts limit 1–100 (default 50), validates `before_id`, filters events to homes accessible by the authenticated active user, returns newest-first, and exposes no notification mutation endpoint.

### Realtime and state management

`notificationsProvider` is a Riverpod `AsyncNotifier<List<NotificationItem>>`: it first loads REST data, then listens to the shared SSE provider. It prepends unseen entries by SSE event ID and resolves a device name from `devicesProvider`, falling back to the device ID.

It generates feed entries only for:

- `device.status` → online/offline;
- terminal `command.updated` statuses (`done`, `error`, `timeout`), with command-specific title/body; and
- `ota.progress` statuses `rebooting` or `failed`.

The backend projects the same event categories into `notification_events`; the REST response is authoritative on restart. The Flutter provider does not implement pagination UI, manual refresh, or special `replay.reset` handling for this feed.

### Read/unread behavior

There is no read/unread field in `NotificationItem`, no UI indicator, and no read/mark-read endpoint. An older migration contains a legacy `notifications.read` column, but the active route uses `notification_events` and does not expose it. React Native must not invent read/unread state or an API.

## React Native Migration Plan

### Models and API layer

- Add feature-local `NotificationItem`, DTO, severity/type unions, date normalization, and runtime response guards under `src/features/notifications/models/`.
- Add `GET /notifications` to `src/features/notifications/api/`, preserving `limit`, optional `before_id`, Bearer authentication, snake_case boundary fields, and existing Axios error normalization.
- Reuse existing `User`, `Home`, session store, `GET /homes`, and logout infrastructure for Profile; do not add a profile API.

### Query hooks and realtime

- Use TanStack Query for `['notifications', { limit, beforeId }]`; initially expose the Flutter-equivalent first page only, even though the API supports a cursor.
- Create an event-to-notification mapper. When the future shared SSE service is added, prepend only supported, non-duplicate event IDs to the first-page query cache; resolve names from the devices cache, otherwise use the ID.
- Profile reads `useSessionStore` and `useHomesQuery`. Theme selection belongs in the planned Zustand UI-preference state, preserving Light/Dark/System and avoiding server persistence unless Flutter changes.

### Components and screens

- Profile: branded header, account card, Homes settings card, settings rows/theme menu, About dialog, logout confirmation, and loading/empty/error Homes card.
- Notifications: header, four-card loading state, notification tile, shared empty/error presentation, and device-detail navigation callback.
- Reuse Atmosphere tokens and, once approved, the same semantic Lucide icons. Preserve detail routes above the tab shell.

### Recommended order

1. Migrate Profile presentation over existing session/homes/logout state, including confirmation and coming-soon/About behavior.
2. Add typed notifications REST model/API/query and parity UI states.
3. Add the global SSE service, cache append/deduplication, and `replay.reset` REST invalidation after device realtime architecture is established.
4. Validate visual, accessibility, dark/system-theme, tab persistence, and device-route behavior against Flutter tests/goldens.

## Risks and constraints

- Do not add profile editing, notification preferences, read/unread controls, or notification mutations: Flutter/back end mark these as absent or coming soon.
- Logout must clear local session even if its server request fails.
- Notification timestamps and device names must preserve Flutter fallback/display behavior.
- Direct MQTT is not a mobile integration path; use the existing REST/SSE contracts only.
