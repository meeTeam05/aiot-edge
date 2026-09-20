# Device Dashboard Analysis

## Scope

This is a read-only analysis of the Flutter device experience. `app/` remains the mobile source of truth, and `server/` remains the API source of truth. No React Native, Flutter, or backend code is changed by this phase.

## 1. Route, Screen, and States

`GoRouter` maps `/devices/:id` to `DeviceDashboardScreen(deviceId)`. It is outside the persistent tab shell, so opening it from Home or Notifications removes the bottom tabs. Back navigation falls back to `/home` for direct entries. Related routes are `/devices/:id/commands`, `/settings`, `/calibrate/:sensor`, and `/ota`.

```text
Scaffold / pull-to-refresh scroll view
├── back Atmosphere app bar: device name or ID + Settings action
├── online/offline presence (last-seen fallback)
├── DeviceModeCard
├── responsive sensor grid: Temperature, Humidity, CO, NO₂
├── responsive Relay cards: Fan, Lamp, Filter
└── Recent activity card: up to three commands + View all
```

The dashboard is a `ConsumerStatefulWidget`. It uses one-column sensor tiles below 360px or above 1.4x text scale, and one-column relays above 1.7x scale (otherwise two columns at 360px+). Sensor and relay controls are visually dimmed/disabled while reported mode is off. Mode-off asks for confirmation because sensors pause and all relays turn off; attempting a relay control while off shows **Turn device on first**. The Settings icon opens the settings route; **View all** opens command history.

Initial device, shadow, or live-telemetry loading blocks the page with a spinner. A missing device or initial device/shadow/telemetry failure shows a retryable error page. Command-history failure is non-blocking and remains inside Recent activity. Pull-to-refresh refetches devices, shadow, live telemetry, and commands while retaining the normal page.

## 2. Models and Transport Mapping

`Device` maps `id`, `name`, required `home_id`, nullable `room_id`, `online` (default `false`), nullable `last_seen`, `firmware_ver`, `mode`, `relay_1..relay_3`, and `created_at`. The list endpoint obtains mode/relay summary values from the reported shadow, so those four fields can be null.

`DeviceShadow` is `{ reported: Map, desired: Map, updatedAt? }`; maps are deliberately open-ended because firmware reports contain sensor values and timestamps as well as controls. `Command` is `{ id, payload, status, created_at, executed_at? }`. `TelemetryPoint` is `{ ts, temperature?, humidity?, co_ppm?, no2_ppm?, mode? }`; invalid/non-string timestamps are discarded. Transport snake_case is normalized at the client boundary; dates are displayed locally.

## 3. Shadow and Command Semantics

`GET /devices/:id/shadow` returns the authoritative reported/desired snapshot. Reported state describes what the device has confirmed: dashboard mode, relays, and fallback sensor values come from it. Desired state is declarative and supports only `mode` plus `relay_1..3`; `PUT /devices/:id/shadow/desired` merges those keys, validates a 4 KiB payload and forbids an enabled desired relay with effective mode off. If online, the server publishes a desired/delta response to MQTT. Flutter intentionally does **not** use desired-shadow updates for interactive dashboard controls.

Controls use commands instead:

| Action | Endpoint / request | Immediate response | Resolution |
| --- | --- | --- | --- |
| Relay | `POST /devices/:id/relay/:channel` with `{state:boolean}` | `201 {command_id}` | Reported `relay_n` must match. |
| Mode | `POST /devices/:id/mode` with `{mode:"on"|"off"}` | `201 {command_id}` | Reported `mode` must match. |
| Generic | `POST /devices/:id/command` with `{payload}` | `201 {command_id}` | Used for typed relay/mode, calibration, or set-time commands. |

The command lifecycle is `pending → sent → done|error|timeout`; the server queues pending commands and flushes them when a device becomes online. Flutter disables only the affected control after a successful submission—there is no optimistic relay/mode change. It watches the command ID: `done` waits for the matching reported shadow (then performs one shadow refresh after one second if needed); `error` displays a failure; `timeout`, or five seconds still pending, clears local loading and says the command is queued for reconnection. This reconciliation behavior must be retained.

## 4. Telemetry

The live dashboard requests the last 30 minutes from `GET /devices/:id/telemetry`, limited to 720 points. It uses the latest point before reported-shadow sensor values, renders Temperature (°C), Humidity (%), CO (ppm), and NO₂ (ppm), and keeps the last 30 non-null values per metric for sparklines. When mode is off, sensor tiles display their disabled presentation rather than live values.

The endpoint accepts ISO `from`/`to`, optional `agg`, and `limit`; its allowed range is at most 90 days. Raw results include mode; aggregated results average the four numeric metrics. Flutter also defines history ranges: 1h/raw, 6h/5m, 24h/15m, 7d/1h, and 30d/6h. Live cache normalization drops points older than 30 minutes, deduplicates exact timestamp-plus-value points, sorts ascending, and caps at 720.

## 5. Realtime Architecture

Flutter opens authenticated `GET /realtime` SSE, persists the last event ID only while the stream is alive, and reconnects from one to 30 seconds. A stream event is `{id, type, device_id, occurred_at, payload}`. Invalid SSE payloads are ignored; a 401 stops the stream. Server events are durable and authorized by home membership—mobile clients must not connect directly to MQTT.

| Event | Payload used by Flutter | Cache behavior |
| --- | --- | --- |
| `device.status` | `online`, optional `firmware` | Patch device-list presence, last seen, firmware. |
| `shadow.reported` | complete `reported`, incremental `patch` | Merge into device summary and device shadow. |
| `telemetry.point` | `ts`, optional four metrics, `mode` | Normalize/append to the live 30-minute series and update latest. |
| `command.updated` | `command_id`, `status`, `payload`, optional error message | Upsert/sort command history and resolve a pending control. |
| `ota.progress` | firmware OTA progress payload | Used by later OTA work, not this dashboard page. |
| `replay.reset` | replay-unavailable reason | Mark live telemetry degraded and refetch device/shadow/telemetry snapshots. |

The backend rejects stale reported-shadow updates using the firmware timestamp, writes PostgreSQL before Redis cache, and sends the merged snapshot plus patch over SSE. This makes the reported shadow—not the client command response—the final UI authority.

## 6. BLE and OTA Relationship

BLE belongs to provisioning, not normal dashboard control. Flutter scans Smart Air advertisements, completes platform/Bluetooth/location preflight, connects with a 10-second timeout, requests MTU 256 for provisioning, writes Wi-Fi SSID/password through FF01/FF02, and listens for JSON provisioning result on FF03 (30-second timeout). It then uses the local device HTTP API and server announce polling before entering the cloud-backed device flow. Preserve this native permission, GATT, local-network, and timeout work as a later, isolated migration.

OTA is cloud/MQTT-backed rather than BLE-backed. Flutter's device Settings → OTA page fetches `GET /devices/:id/ota/versions` and requests `POST /devices/:id/ota` with `{version}`. The server requires the device to be online, returns `202` accepted, and publishes the artifact URL/hash to MQTT; subsequent progress arrives as `ota.progress` SSE. Do not fold OTA or BLE dependencies into the dashboard foundation.

## 7. React Native Migration Plan

1. Create typed device, shadow, command, telemetry, and realtime-event mappers under the existing device feature, preserving nullable transport values and normalized IDs.
2. Add read-only query hooks for device summary, shadow, commands, and the 30-minute live telemetry snapshot; render exact loading/error/not-found states before controls.
3. Add a single authenticated SSE owner above feature queries. Patch the Home device cache, device-shadow cache, command cache, and normalized telemetry cache; invalidate/refetch on `replay.reset`.
4. Implement the dashboard layout and responsive/accessibility behavior over the existing Atmosphere tokens, then add pull-to-refresh and command-history/settings route handoffs.
5. Add typed relay/mode mutations with per-control pending state and the exact command-plus-reported-shadow reconciliation rules. Test success, delayed shadow, error, timeout, offline queue notice, and concurrent controls.
6. Migrate command history, settings, calibration, OTA, and finally BLE provisioning as separate features. Do not add MQTT, optimistic control updates, a new backend API, or a broad chart dependency solely for the existing sparklines.

Primary risks are SSE replay/reset handling, races between terminal command events and shadow reports, nullable/malformed telemetry, and native BLE differences. Resolve them with cache-level event tests, deterministic command reconciliation tests, snapshot refresh fallbacks, and Android/iOS validation against Flutter widget/golden references.
