# Backend API Analysis

## Scope

This document analyzes the completed backend in `server/` for React Native integration. The backend is the API source of truth. Reuse its routes, JSON fields, authentication, authorization, and error behavior; do not introduce a parallel API, direct mobile MQTT client, or schema change.

## 1. Architecture

The API is a Node.js ESM Fastify application (`server/api/src/app.js`). Every public route is registered under `/api`. Nginx proxies `/api/*`, disables buffering for `/api/realtime`, exposes OTA artifacts at `/ota/`, and EMQX WebSocket at `/mqtt`. Docker Compose runs the Fastify API with PostgreSQL/TimescaleDB, Redis, EMQX, Nginx, and Cloudflare Tunnel.

```text
React Native → HTTPS /api → Nginx → Fastify
                                      ├─ PostgreSQL / TimescaleDB (durable data)
                                      ├─ Redis (shadow, announce, OTA caches)
                                      └─ EMQX bridge → firmware MQTT
                                      └─ PostgreSQL LISTEN/NOTIFY → SSE clients
```

Fastify plugins provide the PostgreSQL pool/transactions, Redis client, JWT verifier, MQTT bridge, and SSE manager. The application rejects startup if required secrets for JWT, PostgreSQL, Redis, and EMQX are absent. Request logs redact authorization, cookies, passwords, refresh tokens, secret keys, and refresh responses.

There is no separate controller layer or ORM. Route modules are the controllers and issue parameterized SQL or delegate to services. Shared business services are `commands`, `shadow`, `ota`, `device-cleanup`, `emqx`, `realtime-events`, `notification-events`, and MQTT inbound handlers.

## 2. Database Model

PostgreSQL is the durable source of truth; Redis is a cache/ephemeral coordination store. Core entities are:

| Entity | Purpose |
| --- | --- |
| `users`, `refresh_tokens`, `refresh_token_reuse_markers` | Accounts, hashed rotating refresh tokens, and replay detection. |
| `homes`, `home_members`, `rooms` | Multi-home membership with `owner`, `admin`, and `member` roles. |
| `device_types`, `devices` | Registered MAC-address device IDs, home/room membership, secret-key hash, online state, firmware version. |
| `device_shadows` | JSONB `reported` and `desired` state; database write-through cache backing. |
| `commands` | Persisted queue: `pending → sent → done/error/timeout`, payload, sender, timestamps, error text. |
| `telemetry` | TimescaleDB hypertable: timestamped JSON payloads, with QoS1 deduplication index. |
| `realtime_events`, `notification_events` | Durable replayable events and materialized user-facing notifications. |
| `external_cleanup_jobs` | Durable retry queue for EMQX device-user cleanup. |

Legacy tables for automations, notifications, and FCM tokens exist in the schema, but the current mobile API exposes `notification_events`, not a push-token or automation endpoint.

## 3. Authentication and Authorization

All protected requests require `Authorization: Bearer <accessToken>`. JWTs contain `sub` (user UUID) and email; expiry defaults to 15 minutes. A global Fastify pre-handler returns `401 {"error":"Unauthorized"}` for invalid/missing access tokens.

`POST /auth/login` returns both an access token and refresh token. The refresh token is SHA-256 hashed at rest, rotated on every `POST /auth/refresh`, and has a default 30-day lifetime. The refresh endpoint accepts `body.refreshToken` first (the mobile path), then the HttpOnly cookie fallback. Reuse detection revokes refresh sessions except for a five-second concurrent refresh race grace path. Logout revokes all refresh tokens for the authenticated user and is safe for the client to treat as local success even when the request fails.

Authorization is membership-based. Any active member may read home/device data; only owners/admins can mutate homes, rooms, or devices. Only owners can delete homes. Device provisioning/deletion also requires owner/admin. Use the server's `403 {"error":"Forbidden"}` rather than trying to replicate role rules client-side.

## 4. HTTP Contract

All request bodies are JSON (`Content-Type: application/json`). Successful GETs/updates return JSON; deletes return `204` with no body. Most validation failures are `400`, authorization failures are `401`/`403`, duplicate/conflict/offline conditions may be `409`, quota/rate limits use `429`, and unavailable dependencies/capacity may use `503`. The stable error shape is `{ "error": "message" }`; client code must not depend on development-only diagnostic fields.

### Health and Auth

| Method/path | Auth | Request | Success response |
| --- | --- | --- | --- |
| `GET /health/live` | No | — | `200 {status:"ok", ts}` |
| `GET /health` or `/health/ready` | No | — | `200`/`503 {status, ts, checks}` for PostgreSQL, Redis, EMQX, MQTT, SSE. |
| `POST /auth/register` | No | `{email,password,full_name?}`; password 8–72 UTF-8 bytes | `201 {id,email,full_name,created_at}` |
| `POST /auth/login` | No | `{email,password}` | `{accessToken,refreshToken,user:{id,email,full_name}}` |
| `POST /auth/refresh` | No | `{refreshToken}` for mobile | `{accessToken,refreshToken}` |
| `POST /auth/logout` | Yes | — | `{success:true}` |

Authentication routes are limited to 10 requests/minute. Login deliberately returns the same invalid-credentials response for missing/inactive users and bad passwords.

### Homes and Rooms

| Method/path | Role | Body / response contract |
| --- | --- | --- |
| `GET /homes` | member | Array of homes, ordered by creation: `{id,owner_id,name,address,timezone,created_at}`. |
| `POST /homes` | authenticated | `{name,address?,timezone?}` → `201` home. Defaults timezone to `Asia/Ho_Chi_Minh`; maximum 10 owner homes. |
| `PUT /homes/:id` | owner/admin | Partial `{name?,address?,timezone?}` → updated home. `:id` must be UUID. |
| `DELETE /homes/:id` | owner | `204`; cascades data and schedules external device-credential cleanup. |
| `POST /homes/:id/invite` | owner/admin | `{email,role?}` where role is `admin` or `member` → `{success:true}`. It does not reveal whether the email is registered. |
| `GET /homes/:homeId/rooms` | member | Array `{id,home_id,name,icon}`, sorted by name. |
| `POST /homes/:homeId/rooms` | owner/admin | `{name,icon?}` → `201` room; max 30 rooms/home. |
| `PUT /rooms/:id` | owner/admin | Partial `{name?,icon?}` → room. |
| `DELETE /rooms/:id` | owner/admin | `204`. |

### Devices, Shadow, Commands, OTA, and Telemetry

Device IDs are colon-separated MAC addresses and are normalized to lower case. Device mutation endpoints rate-limit at 20/minute; command endpoints at 30/minute.

| Method/path | Contract |
| --- | --- |
| `POST /devices` | Owner/admin provisioning only. `{device_id,name,home_id,room_id?}` → `201` device plus one-time `secret_key`. Store/use this only in the provisioning flow; do not log or persist it in mobile storage. Device cap: 50/home. |
| `GET /devices?limit=&offset=` | Accessible devices, default limit 100, max 500. Returns device fields plus reported `mode`, `relay_1`, `relay_2`, `relay_3`. |
| `GET /devices/announce/:mac` | Provisioning poll → `{announced:boolean}`; Redis record lasts five minutes after an online status. |
| `PUT /devices/:id` | Partial `{name?,room_id?: UUID|null}` → updated device. The selected room must belong to the device home. |
| `DELETE /devices/:id` | Owner/admin only → `204`, then cleans EMQX credentials. |
| `GET /devices/:id/shadow` | `{reported:{},desired:{},updatedAt}`; cache may serve the response but DB is authoritative. |
| `PUT /devices/:id/shadow/desired` | Body may contain only `mode: "on"|"off"` and/or boolean `relay_1..relay_3`; 4 KiB max. A relay cannot be desired on while effective desired mode is off. Returns `{success:true}`. Use declarative desired state, not dashboard live toggles. |
| `POST /devices/:id/command` | `{payload}` with one strict command: `relay_set` (`relay` 1–3, boolean `state`), `device_mode` (`on|off`), `calibrate_co`, `calibrate_no2`, or `set_time` (Unix seconds). → `201 {command_id}`. |
| `POST /devices/:id/relay/:channel` | `{state:boolean}` → `201 {command_id}`; creates typed `relay_set`. |
| `POST /devices/:id/mode` | `{mode:"on"|"off"}` → `201 {command_id}`; creates typed `device_mode`. |
| `GET /devices/:id/commands?limit=&offset=` | Array of `{id,payload,status,created_at,executed_at}`; defaults 50, max 200. |
| `GET /devices/:id/ota/versions` | `{device_id,current_version,device_online,versions:[{version,filename,url}]}`. |
| `POST /devices/:id/ota` | `{version}` → `202 {device_id,version,filename,status:"accepted"}`; `409` if offline, `404` if artifact absent. |
| `GET /devices/:id/telemetry?from=&to=&agg=&limit=` | Array of timestamped measurements. ISO timestamps; default 24h; range max 90 days; max 5,000 rows; aggregation is one of `1m,5m,15m,30m,1h,6h,1d`. Raw rows include `ts,temperature,humidity,co_ppm,no2_ppm,mode`; aggregated rows omit mode. |

### Notifications and Realtime

| Method/path | Contract |
| --- | --- |
| `GET /notifications?limit=&before_id=` | Paginated descending notification events, default 50/max 100. Each has `{id,type,device_id,device_name,title,body,severity,occurred_at,payload}`; `before_id` is a numeric event ID. |
| `GET /realtime` | Authenticated Server-Sent Events. Send optional numeric `Last-Event-ID` header (or `lastEventId` query) to replay; no JSON response body. |

## 5. Commands, Device Messaging, and Realtime

The API persists a command before publishing it. Commands emit `command.updated` events for `pending`, `sent`, and terminal `done`, `error`, or `timeout`. If the device is offline, a pending command stays in the DB queue and flushes when MQTT reports the device online. Mobile UI must therefore keep command state pending and reconcile it from REST/SSE; it must not assume a `201` means the device has acted.

The Fastify MQTT bridge, not mobile clients, subscribes to status, telemetry, command response, shadow report/get, and OTA progress topics. It validates inbound payloads, updates database/cache state, and emits durable events. Telemetry validates timestamps and sensors, deduplicates QoS1 messages, and clamps unsafe past/future timestamps. Shadow reports merge reported fields and discard stale timestamps.

SSE event wire format is:

```text
id: 42
event: telemetry.point
data: {"id":"42","type":"telemetry.point","device_id":"aa:bb:cc:dd:ee:ff","occurred_at":"...","payload":{...}}

```

Event types currently produced are `device.status`, `telemetry.point`, `shadow.reported`, `command.updated`, `ota.progress`, and `replay.reset`. Events are written to `realtime_events`, authorized per recipient at replay and broadcast, retained for 24 hours by default, and replayed in ascending ID order (up to 1,000). The server sends heartbeat comments every 25 seconds. A missing/unauthorized replay cursor produces `replay.reset`; the client must reload REST snapshots. Stream capacity defaults to 1,000 globally and 10 per IP.

`notification_events` projects device status, terminal command status, and terminal OTA progress into the REST notification feed. The mobile app can use REST for the initial list and SSE to prepend real-time equivalents, deduplicated by event ID.

## 6. Mobile Integration Requirements

1. Configure the base URL outside source control; the current Flutter default is `https://minhnhat05.xyz/api`. Never hardcode secrets or tokens.
2. Send JSON and attach only the short-lived access token as a Bearer header. Store the refresh token in Keychain/Keystore; keep access token in memory.
3. Implement one shared/single-flight refresh request. On a protected 401, refresh once with `{refreshToken}`, replace both tokens when returned, retry once, then clear the session and navigate to login if refresh fails. Concurrent refresh calls must not race, because reuse can invalidate sessions.
4. Preserve snake_case request and response fields. Normalize device IDs to lower-case MAC format before device calls.
5. Use REST for initial snapshots/history and SSE for incremental state. Reconnect SSE with `Last-Event-ID`; on `replay.reset`, refetch devices, shadow, commands, telemetry, and notifications as applicable.
6. Use typed relay/mode endpoints for interactive controls. Wait for command status and matching shadow report before treating the UI change as confirmed.
7. Provision in the Flutter order: create device and receive transient secret → write it to the device's local provisioning API → poll announce → finalize naming/room. Do not expose the device secret in diagnostics.
8. Surface server error messages from `{error}` for expected 4xx flows, but treat 5xx/503/network errors as retryable/degraded states. Respect 429 rather than automatic rapid retry.

## 7. Risks and Non-Contracts

- There are no public APIs for user-profile editing, password reset, automations, FCM token registration, or generic device configuration; the Flutter UI marks some of these as coming soon.
- MQTT WebSocket is exposed for firmware/broker use, but app behavior and documented client services use REST/SSE. React Native must not connect to it directly.
- `secret_key` appears only once in a successful device-provisioning response; it is stored hashed server-side.
- The global Fastify error handler may sanitize messages to generic 4xx/5xx strings, so client code must branch by status/contract rather than exact unrecognized error text.
- Existing Flutter behavior is the migration reference. Compare React Native request body names, token refresh behavior, command status reconciliation, and SSE replay handling to `app/lib/core` and `app/lib/services` before implementation.
