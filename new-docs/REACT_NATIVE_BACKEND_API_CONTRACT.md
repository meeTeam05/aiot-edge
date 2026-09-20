# Smart-Air Backend API Contract for React Native

This document is a source-of-truth summary of the current Smart-Air backend and integration model as implemented in the repository. It is written for future React Native mobile application work and intentionally avoids inventing endpoints, payloads, or behaviors that are not present in the codebase.

## 1. Scope and source of truth

The contract below was derived from the following repository artifacts:

- `README.md`
- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE_SERVER.md`
- `docs/ARCHITECTURE_APP.md`
- `docs/MQTT_PROTOCOL.md`
- `server/db/migrations/001_initial_schema.sql`
- `server/api/src/routes/*.js`
- `server/api/src/constants.js`

Important notes:

- The production app contract is currently REST + SSE, not direct MQTT access from the mobile app.
- The server is implemented with Fastify and runs behind Nginx and Cloudflare Tunnel.
- MQTT is device-to-broker communication for firmware; the app consumes the result via HTTP REST and SSE.
- When information could not be verified in repository code or docs, it is explicitly marked as “Not found in repository”.

## 2. System overview

Smart-Air is an air-quality IoT platform composed of:

- ESP32-S3 firmware
- EMQX MQTT broker
- Fastify API server with PostgreSQL/TimescaleDB and Redis
- Flutter mobile application
- OTA and device provisioning flow

Current mobile stack pattern:

- Use `POST /api/auth/*` for authentication.
- Use `GET /api/...` and `POST /api/...` for snapshots and mutations.
- Use `GET /api/realtime` for stream updates.
- Use device MQTT topics only for firmware/device-side communication; not for direct app communication.

## 3. Runtime topology

```text
Internet
  -> Cloudflare Tunnel
  -> Nginx
      -> /api/*        -> Fastify API
      -> /api/realtime -> SSE stream
      -> /mqtt         -> EMQX WebSocket
      -> /ota/         -> OTA files

Fastify API
  -> PostgreSQL / TimescaleDB
  -> Redis
  -> EMQX Admin API / MQTT bridge
  -> SSE stream to app

Firmware devices
  -> MQTT topics over WSS / mqtt path
```

## 4. Backend protocol summary

### 4.1 Base URL

Repository docs specify:

- Public base URL: `https://minhnhat05.xyz`
- Internal Fastify service: `http://api:3000` within Docker network
- Nginx is the external ingress

### 4.2 Content type

- All JSON request bodies: `application/json`

### 4.3 Auth style

- Access token: JWT Bearer token
- Header: `Authorization: Bearer <accessToken>`
- Refresh token: UUID v4 stored in body and also set as HttpOnly cookie for browser flows
- Access token expiry: 15 minutes (`JWT_EXPIRES_IN`)
- Refresh expiry: 30 days (`REFRESH_TOKEN_EXPIRES_DAYS`)

### 4.4 Error format

Repository documents the standard shape:

```json
{ "error": "description" }
```

Common status codes:

- 400: invalid request or validation error
- 401: unauthenticated or invalid token
- 403: forbidden / insufficient permission
- 404: resource not found
- 409: conflict
- 429: rate limit
- 503: dependency degraded

## 5. Authentication and session model

### 5.1 Registration

Endpoint:

- `POST /api/auth/register`

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "Minh Nhat"
}
```

Validation:

- `email` must be valid email
- `password` must be 8-72 UTF-8 bytes
- `full_name` is optional and trimmed; max 255 characters
- email is lowercased before persistence
- password is hashed with bcrypt using 12 rounds

Response, 201 Created:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "Minh Nhat",
  "created_at": "2026-05-01T10:00:00.000Z"
}
```

Conflict:

- `409`: `Email already registered`

### 5.2 Login

Endpoint:

- `POST /api/auth/login`

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Successful response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "uuid-v4",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Minh Nhat"
  }
}
```

Behavior:

- Access token is JWT signed with user id and email
- Refresh token is UUID v4, stored as SHA-256 hash in `refresh_tokens`
- Cookie `refreshToken` is also set for browser-based clients
- A mobile client should persist both tokens securely

### 5.3 Refresh

Endpoint:

- `POST /api/auth/refresh`

Accepted input:

- `request.body.refreshToken` if present
- otherwise `cookie.refreshToken`

Success response:

```json
{
  "accessToken": "new-jwt",
  "refreshToken": "new-uuid-v4"
}
```

Security behavior:

- Refresh token rotation is enforced
- The server tracks consumed refresh tokens and detects replay attempts
- Replay or concurrent refresh race attempts can revoke active sessions for the user

### 5.4 Logout

Endpoint:

- `POST /api/auth/logout`

Authentication required: yes

Response:

```json
{ "success": true }
```

Behavior:

- Deletes all refresh tokens for the authenticated user
- Clears the refresh cookie

### 5.5 Current identity model

The repository confirms the following user fields:

- `id` (UUID)
- `email` (unique)
- `password_hash`
- `full_name`
- `avatar_url`
- `phone`
- `is_verified`
- `is_active`
- `created_at`
- `updated_at`

Not found in repository:

- explicit user profile update endpoint
- password reset endpoint
- email verification endpoint
- social login endpoints

## 6. Role and authorization model

The repository defines the home membership roles:

- `owner`
- `admin`
- `member`

Permission model is enforced by the backend with home membership checks and device access helpers.

### Role capabilities

| Role | Typical authority |
| --- | --- |
| `owner` | full ownership of home, invite members, delete home, delete device |
| `admin` | create/update/delete rooms, invite members, manage home/device access |
| `member` | read access, send commands, view telemetry, rename device, move device room |

### Device access

The backend checks whether a user belongs to the home that owns the device. Device access is required for:

- `GET /api/devices/:id/shadow`
- `PUT /api/devices/:id/shadow/desired`
- `POST /api/devices/:id/command`
- `POST /api/devices/:id/relay/:channel`
- `POST /api/devices/:id/mode`
- `GET /api/devices/:id/commands`
- `GET /api/devices/:id/telemetry`

## 7. Home and room endpoints

### 7.1 `GET /api/homes`

Authentication required.

Returns all homes for the current user.

### 7.2 `POST /api/homes`

Authentication required.

Request example:

```json
{
  "name": "My Home",
  "address": "123 Example Street",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

Constraints:

- name required
- home ownership cap: `MAX_HOMES_PER_USER = 10`
- timezone defaults to `Asia/Ho_Chi_Minh`

### 7.3 `PUT /api/homes/:id`

Authentication required.

Allowed roles: `owner`, `admin`

### 7.4 `DELETE /api/homes/:id`

Authentication required.

Allowed role: `owner`

### 7.5 `POST /api/homes/:id/invite`

Authentication required.

Allowed roles: `owner`, `admin`

Request example:

```json
{
  "email": "friend@example.com",
  "role": "member"
}
```

Valid invite roles:

- `admin`
- `member`

Repository intentionally implements a non-revealing behavior when the email is unknown.

### 7.6 Room endpoints

- `GET /api/homes/:homeId/rooms`
- `POST /api/homes/:homeId/rooms`
- `PUT /api/rooms/:id`
- `DELETE /api/rooms/:id`

Room constraints:

- max rooms per home: 30
- room name required
- optional `icon`

## 8. Device lifecycle and registration

### 8.1 Device identity

The code enforces device IDs as lowercase MAC addresses:

- format: `aa:bb:cc:dd:ee:ff`
- normalized via `normalizeDeviceId()`
- validation regex: `/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/`

### 8.2 Device creation

Endpoint:

- `POST /api/devices`

Authentication required.

Request body:

```json
{
  "device_id": "aa:bb:cc:dd:ee:ff",
  "name": "Living Room Sensor",
  "home_id": "uuid",
  "room_id": "uuid"
}
```

Behavior:

- Validates device ID, name, and home ID
- Generates a `secret_key` (UUID v4) once for the device
- Hashes the secret before storing it in the database
- Creates EMQX broker user for the device
- Inserts the device row with ownership and home membership
- Returns the created device plus the plain secret key once

Response example:

```json
{
  "id": "aa:bb:cc:dd:ee:ff",
  "home_id": "uuid",
  "room_id": "uuid",
  "type_id": "uuid",
  "owner_id": "uuid",
  "name": "Living Room Sensor",
  "firmware_ver": null,
  "online": false,
  "last_seen": null,
  "created_at": "...",
  "secret_key": "uuid-generated-secret"
}
```

Important limitation:

- The produced `secret_key` is returned only at creation time. The repository does not document a later API to rotate or recover it.

### 8.3 Device announcement check

Endpoint:

- `GET /api/devices/announce/:mac`

Authentication required.

Behavior:

- Checks whether the device has announced itself online
- Uses Redis cache key `announce:{deviceId}`
- Returns:

```json
{ "announced": true }
```

### 8.4 List devices

Endpoint:

- `GET /api/devices`

Query parameters:

- `limit` (default 100, max 500)
- `offset` (default 0)

Response rows contain:

- `id`
- `name`
- `home_id`
- `room_id`
- `online`
- `last_seen`
- `firmware_ver`
- `created_at`
- `mode`
- `relay_1`
- `relay_2`
- `relay_3`

### 8.5 Update device

Endpoint:

- `PUT /api/devices/:id`

Fields accepted:

- `name`
- `room_id`

### 8.6 Delete device

Endpoint:

- `DELETE /api/devices/:id`

Allowed roles: `owner`, `admin`

### 8.7 OTA endpoints

The repository contains these device OTA routes:

- `GET /api/devices/:id/ota/versions`
- `POST /api/devices/:id/ota`

This endpoint checks available OTA artifacts and publishes an OTA update command to the device.

## 9. Device shadow contract

### Endpoint

- `GET /api/devices/:id/shadow`
- `PUT /api/devices/:id/shadow/desired`

The backend maintains a device shadow with:

- `reported`: actual device state from firmware
- `desired`: target state requested by app

Supported desired keys:

- `mode`
- `relay_1`
- `relay_2`
- `relay_3`

Validation rules:

- `mode` must be `on` or `off`
- each relay must be boolean
- unsupported keys are rejected
- desired payload must be under 4096 bytes

Example desired payload:

```json
{
  "mode": "on",
  "relay_1": true,
  "relay_2": false,
  "relay_3": false
}
```

Invariant:

- A relay cannot be `true` when the effective desired mode is `off`.

When a device is online, the server may immediately publish the desired change over MQTT to the device.

## 10. Command contract

Endpoint:

- `POST /api/devices/:id/command`
- `POST /api/devices/:id/relay/:channel`
- `POST /api/devices/:id/mode`
- `GET /api/devices/:id/commands`

### 10.1 Generic command payload

Accepted command `payload.type` values:

- `relay_set`
- `device_mode`
- `calibrate_co`
- `calibrate_no2`
- `set_time`

The backend rejects generic `set_config` and `ota_update` on this endpoint.

### 10.2 Relay command

Endpoint:

- `POST /api/devices/:id/relay/:channel`

Body:

```json
{ "state": true }
```

Channel constraint:

- integer from 1 to 3

### 10.3 Device mode command

Endpoint:

- `POST /api/devices/:id/mode`

Body:

```json
{ "mode": "on" }
```

Allowed values:

- `on`
- `off`

### 10.4 Command history

Endpoint:

- `GET /api/devices/:id/commands`

Returns command rows with:

- `id`
- `payload`
- `status`
- `created_at`
- `executed_at`

## 11. Telemetry contract

Endpoint:

- `GET /api/devices/:id/telemetry`

Query parameters:

- `from` (ISO 8601 date)
- `to` (ISO 8601 date)
- `limit` (default 1000, max 5000)
- `agg` (optional: `1m`, `5m`, `15m`, `30m`, `1h`, `6h`, `1d`)

Telemetry range constraint:

- maximum range is 90 days

Typical payload row:

```json
{
  "ts": "2026-09-18T12:00:00.000Z",
  "temperature": 28.5,
  "humidity": 65.2,
  "co_ppm": 3.1,
  "no2_ppm": 0.04,
  "mode": "on"
}
```

The telemetry table stores per-device sensor data as a time-series table partitioned by `ts` using TimescaleDB.

## 12. Realtime and notifications

### 12.1 SSE stream

Endpoint:

- `GET /api/realtime`

This is the app-facing live update stream. The backend uses an authenticated SSE implementation and pushes events produced from durable event logging.

### 12.2 Notifications feed

Endpoint:

- `GET /api/notifications`

Query parameters:

- `limit` (default 50, max 100)
- `before_id` (numeric event id)

This is a notification event feed for the authenticated user.

## 13. MQTT device communication contract

Important: the app does not connect directly to MQTT in the current architecture. MQTT is used between firmware and the broker, while the mobile app receives information via REST and SSE.

### 13.1 Broker and device auth

Repository-documented device runtime defaults:

- broker URI: `wss://minhnhat05.xyz/mqtt`
- device username: `device_id`
- device password: generated `secret_key`
- QoS: 1
- keep-alive: 60s

### 13.2 Device topics

The repository defines the following topics.

| Topic | Direction | Purpose |
| --- | --- | --- |
| `device/{deviceId}/status` | device -> broker | online/offline state |
| `device/{deviceId}/telemetry` | device -> broker | sensor sample |
| `device/{deviceId}/response` | device -> broker | command response ack |
| `device/{deviceId}/shadow/report` | device -> broker | reported state patch |
| `device/{deviceId}/shadow/get` | device -> broker | request current shadow |
| `device/{deviceId}/ota/progress` | device -> broker | OTA progress |
| `device/{deviceId}/command` | broker -> device | command delivery |
| `device/{deviceId}/shadow/get_response` | broker -> device | desired state + delta |
| `device/{deviceId}/ota/update` | broker -> device | OTA trigger |

### 13.3 Status payload

Example:

```json
{
  "online": true,
  "firmware": "1.2.3"
}
```

Offline LWT example:

```json
{ "online": false }
```

### 13.4 Telemetry payload

```json
{
  "device_id": "aa:bb:cc:dd:ee:ff",
  "mode": "on",
  "ts": 1712345678,
  "temperature": 28.5,
  "humidity": 65.2,
  "co_ppm": 3.1,
  "no2_ppm": 0.04
}
```

Validated in repository docs:

- `mode` is `on` or `off`
- `ts` is Unix timestamp in seconds
- temperature, humidity, `co_ppm`, `no2_ppm` may be number or null
- payload size capped at 4096 bytes

### 13.5 Response payload

```json
{
  "command_id": "uuid",
  "status": "done"
}
```

Or error form:

```json
{
  "command_id": "uuid",
  "status": "error",
  "reason": "reason text"
}
```

### 13.6 Shadow report payload

```json
{
  "mode": "on",
  "temperature": 28.5,
  "humidity": 65.2,
  "co_ppm": 3.1,
  "no2_ppm": 0.04,
  "ts": 1712345678
}
```

The backend merges patch-level state into `device_shadows.reported`.

## 14. Database model summary

The canonical database schema is defined in `server/db/migrations/001_initial_schema.sql`, with later migrations adding replay protection and realtime event tables.

### Core tables

| Table | Purpose |
| --- | --- |
| `users` | app users |
| `refresh_tokens` | refresh token persistence |
| `homes` | home records |
| `home_members` | membership and roles |
| `rooms` | room assignments |
| `device_types` | device type metadata |
| `devices` | device registry |
| `device_shadows` | reported and desired state |
| `commands` | command history |
| `telemetry` | time-series sensor readings |
| `automations` | optional trigger/action automation |
| `notifications` | user notifications |
| `fcm_tokens` | push token storage |
| `realtime_events` | realtime event log |
| `refresh_token_reuse_markers` | refresh replay detection |
| `external_cleanup_jobs` | external cleanup coordination |

### Key database fields

#### `devices`

- `id` — text primary key, device MAC lowercase
- `home_id`
- `room_id`
- `type_id`
- `owner_id`
- `name`
- `secret_key` or `secret_key_hash` depending on runtime version
- `firmware_ver`
- `online`
- `last_seen`
- `created_at`

#### `device_shadows`

- `device_id`
- `reported` JSONB
- `desired` JSONB
- `updated_at`

#### `telemetry`

- `device_id`
- `ts`
- `payload` JSONB

A TimescaleDB hypertable is created on `telemetry(ts)` with one-year retention.

## 15. App-facing mobile requirements inferred from repository

The repository contains a Flutter app with requirements that are relevant to future React Native work.

### 15.1 Auth persistence pattern

The existing Flutter app stores:

- `refreshToken` in secure storage
- user JSON in secure storage
- access token in memory during active session

This is a current contract expectation for a future React Native app, even though the exact code for the React Native application is not present in this repository.

### 15.2 Provisioning flow

The existing app supports a BLE + local HTTP + cloud provisioning flow:

1. device is powered on
2. device starts local HTTP endpoint for provisioning
3. app connects to device over BLE
4. app provisions Wi-Fi and device credentials
5. app registers device via cloud API
6. device connects to MQTT and begins reporting telemetry

This is a real workflow in the current codebase and should be treated as the official device onboarding model.

### 15.3 App runtime pattern

From the Flutter implementation and route definitions:

- app authenticates before accessing protected routes
- app reads home, room, device, telemetry, shadow, and command history through secure REST calls
- app listens for SSE updates using `GET /api/realtime`
- app patches in-memory state after live updates instead of using MQTT directly

### 15.4 Push and notification model

The backend stores notification events and FCM tokens, which indicates a push notification integration path exists but its mobile API contract is only partially visible in the repo.

This is not a complete deliverable API in the repository, so for React Native contract design we should treat it as:

- `GET /api/notifications` is currently confirmed
- `FCM token registration` endpoint is not found in repository
- `push send` contract is not found in repository

## 16. Known API gaps and “Not found in repository” items

These items were not found in the repository and should be treated as unknown unless a future server implementation adds them:

- user profile update endpoint
- avatar upload endpoint
- password reset flow
- email verification flow
- user deletion endpoint
- explicit home member list endpoint beyond the join-through-home logic
- direct mobile MQTT API contract
- push notification registration endpoint
- device firmware binary upload endpoint for the app
- explicit app config endpoint beyond local device provisioning
- device pairing revocation endpoint
- “forgot password” or “change email” endpoint

## 17. React Native integration guidance

For a React Native app that matches the current repository architecture:

- Use JWT access and refresh tokens with secure storage
- Use `GET /api/realtime` for live device updates
- Use REST calls for snapshot data, history, and command dispatch
- Treat MQTT as device-only and server-owned infrastructure
- Maintain device state via `shadow` and telemetry endpoints rather than raw MQTT
- Continue using home membership and role-scoped access checks at the API layer

## 18. Contract summary

Current confirmed mobile-facing backend contract includes:

- Authentication: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`
- Homes: `/api/homes`, `/api/homes/:id`, `/api/homes/:id/invite`, `/api/homes/:homeId/rooms`
- Devices: `/api/devices`, `/api/devices/:id`, `/api/devices/:id/ota/versions`, `/api/devices/:id/ota`
- Shadow: `/api/devices/:id/shadow`, `/api/devices/:id/shadow/desired`
- Commands: `/api/devices/:id/command`, `/api/devices/:id/relay/:channel`, `/api/devices/:id/mode`, `/api/devices/:id/commands`
- Telemetry: `/api/devices/:id/telemetry`
- Notifications: `/api/notifications`
- Realtime: `/api/realtime`
- Health: `/api/health/live`, `/api/health/ready`, `/api/health`

Everything else not directly present in this repository should be treated as “Not found in repository” and not assumed.

## 19. Final assessment

The backend is already a real IoT control-plane system with clear domain boundaries, secure session management, role-based authorization, device registry, telemetry storage, and SSE-driven live events. The main architecture decision for future React Native development is clear:

- use REST for app-data access
- use SSE for live updates
- do not directly talk to MQTT from the app
- treat the firmware/device communications layer as server-managed infrastructure

This contract reflects the repository as it exists today and is intended to guide future React Native implementation without inventing unsupported endpoints.
