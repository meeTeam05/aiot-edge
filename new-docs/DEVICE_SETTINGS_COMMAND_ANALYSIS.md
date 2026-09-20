# Device Settings and Command History Analysis

## Scope

This is a read-only analysis. Flutter (`app/`) remains the mobile source of truth, and the Fastify API (`server/`) remains unchanged.

## Command History

### Route, navigation, and layout

`GoRouter` maps `/devices/:id/commands` to `CommandHistoryScreen`. It sits outside the tab shell; the back action returns to `/devices/:id` (including a safe direct-entry fallback). The dashboard's **View all →** action is its entry point.

The screen has an Atmosphere back app bar, horizontally scrollable filter chips (**All**, **Done**, **Failed**, **Pending**), pull-to-refresh, and a padded command list. Each `HistoryRow` has a semantic icon, human-readable command label, relative timestamp, and status pill. Tapping a row opens a modal bottom sheet with selectable, monospaced `key: value` payload lines.

### State, data, and presentation

`commandsProvider(deviceId)` is an auto-disposed Riverpod notifier. It requests `DeviceService.getCommands(deviceId)`, listens for `command.updated` SSE events, upserts by command ID, and sorts newest-first. The model is `{id, payload, status, created_at, executed_at?}`; `created_at` is required and dates render as `Xs ago`, `Xm ago`, `Xh ago`, or `D/M HH:mm` after 24 hours.

The shared async widget supplies the initial loading and error presentation. A filtered empty list shows **No commands yet** with explanatory text; there is no distinct failed-filter message. Pull-to-refresh invalidates the provider. Status mapping is: `done` → green Done, `sent` → brand Sent, `error` → danger Error, `timeout` → warning Timeout, otherwise → accent Pending. Failed includes `error` and `timeout`; Pending includes `pending` and `sent`.

`GET /devices/:id/commands?limit=&offset=` requires bearer authentication and device-home membership. It returns newest-first command rows; default limit is 50, maximum 200, and offset is non-negative. Although the API supports offset pagination, Flutter does not expose load-more or page controls: its default initial page is the full UI. The REST response currently does not select `error_message`, so History cannot show backend execution details.

## Device Settings

### Route, layout, and implemented behavior

`/devices/:id/settings` maps to `GeneralSettingsScreen`, outside the tabs, with back fallback to the dashboard. It reads `devicesProvider` and `roomsProvider(device.homeId)` and has blocking loading, retryable load failure, and missing-device states.

The scroll layout contains:

- **General** card: inline device-name editing (submit/check), copyable monospaced device ID with success snackbar, room picker (including **No room**), and firmware version linking to OTA.
- **Sensor calibration** card: CO and NO₂ rows, both labelled “Calibration recommended.”
- **Danger zone**: a destructive confirmation before deletion; success navigates to `/home` and failure remains visible as a snackbar.

Name and room changes call `PUT /devices/:id` with `{name}` or `{room_id: UUID|null}`, then invalidate the device list. Delete calls `DELETE /devices/:id`; the backend requires owner/admin, returns `204`, and cleans associated external credentials. Copying is device-local clipboard behavior. There are no settings rows marked coming soon in this Flutter screen.

### OTA and calibration entry points

Firmware opens `/devices/:id/ota`. `OtaScreen` shows the current version and online/offline pill, catalog loading/error/empty/data states, current-version badges, and one in-flight Update button. `GET /devices/:id/ota/versions` returns `{device_id,current_version,device_online,versions:[{version,filename,url}]}`. `POST /devices/:id/ota` with `{version}` accepts a request with `202`; it rejects offline devices with `409`. Progress is delivered later as `ota.progress` SSE, but this Flutter screen only confirms request submission and does not render progress.

Calibration opens `/devices/:id/calibrate/co` or `/devices/:id/calibrate/no2`. The three-step wizard shows preparation guidance, explicit start/pending elapsed time, then success/failure. It submits `POST /devices/:id/command` with `{payload:{type:"calibrate_co"}}` or `calibrate_no2`, then polls command history every two seconds for up to seven minutes. It accepts only `done` as success. The generic command API validates both types; no calibration-specific endpoint exists.

## Existing React Native State

Phase 4.6 provides typed command models, `GET /devices/:id/commands` query hooks, REST command mutations, and SSE command-cache upserts. The dashboard renders only the latest three commands; there is no Command History route/screen, filter UI, payload sheet, pagination UI, or `error_message` source.

`DeviceDetailScreen` has only a settings coming-soon alert. `AppStackParamList` has no settings, OTA, calibration, or command-history routes. There is no React Native API/query layer for device update/delete, OTA catalog/request, or room-edit mutations. `ota.progress` is normalized by the shared realtime layer but not displayed.

## Required Migration Order

1. Add Command History navigation and UI over the existing command query/SSE cache; preserve first-page-only behavior, client filters, pull-to-refresh, status labels, timestamps, and payload sheet.
2. Add Settings navigation and its device/room mutation data layer, then the General and Danger Zone UI with Flutter confirmations and cache invalidation.
3. Add the OTA catalog/request data layer and screen; retain the offline/server-error behavior before considering progress UI.
4. Migrate the calibration wizard and its command-completion polling as a separate feature. Do not substitute desired shadow, direct MQTT, or a new backend API.

Key risks are API role enforcement on settings mutations, preserving cache freshness after rename/room/delete, keeping command history's REST and SSE ordering consistent, and not treating OTA `202` or a calibration command submission as completion.
