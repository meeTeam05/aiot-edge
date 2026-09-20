# BLE Provisioning Analysis

## Scope and Source of Truth

This is a read-only analysis of Flutter (`app/`), firmware, and the existing API for Phase 6.1. Flutter remains the mobile behavior source of truth; the server and firmware contracts below must be reused unchanged. The reachable flow is `/provision` → `/provision/scan` → `/provision/wifi` → `/provision/announce` → `/provision/name`, outside the persistent tab shell and protected by the authenticated router. Older provisioning/scan screens exist but are not router imports and must not drive the migration.

## Flutter BLE Flow

`BleService` is a singleton wrapper around `flutter_blue_plus`, with `permission_handler` and an Android `MethodChannel` (`mt_home/settings`) for SDK detection and Bluetooth/location settings. `Step2BleScanScreen` owns its scan subscription, 15-second UI timer, discovered-device list, and connection state; `Step3WifiScreen` owns Wi-Fi form state and keeps the BLE connection alive until provisioning has been configured.

Preflight rejects unsupported hardware, denied/permanently-denied permission, Bluetooth off, and (Android below API 31) location services off. It offers Bluetooth settings, app settings, or location settings only for the corresponding recoverable blocker. A scan runs for 12 seconds; the UI independently stops showing a scanner after 15 seconds. Results are filtered by advertised name `SMART_AIR_` or legacy `SmartAir-`, de-duplicated by remote ID, then sorted strongest RSSI first. The remote ID is a MAC on Android and a platform UUID on iOS; it is passed as route state, while the firmware-provided MAC becomes the canonical device ID.

Selecting a device disconnects any prior session, connects with a 10-second timeout, and requests MTU 256 (the connection call deliberately disables the library's automatic MTU request). Service discovery occurs when credentials are sent. Disconnect cancels notification listening and ignores an already-disconnected-device error. On failed connection, scan error, or provisioning error, Flutter remains/reverts to the relevant step and exposes the error through a snackbar or retry CTA; it does not silently advance.

## Native Permissions

| Platform | Current Flutter behavior | React Native parity requirement |
| --- | --- | --- |
| Android API 31+ | Manifest declares `BLUETOOTH_SCAN` (`neverForLocation`) and `BLUETOOTH_CONNECT`; runtime preflight requests both. | Request scan/connect at runtime before scanning or connecting; distinguish denial from permanent denial. |
| Android API 30 and below | Legacy `BLUETOOTH`/`BLUETOOTH_ADMIN` apply through API 30. Runtime preflight requests `ACCESS_FINE_LOCATION` and requires location services enabled. | Preserve the location permission and enabled-service blocker for these OS versions. |
| iOS | CoreBluetooth availability is queried through `flutter_blue_plus`; no location permission path exists. `Info.plist` declares `NSBluetoothAlwaysUsageDescription` and `NSBluetoothPeripheralUsageDescription`. | Declare the equivalent Bluetooth usage descriptions and surface unavailable/powered-off states from CoreBluetooth. |

The Android native channel opens `ACTION_BLUETOOTH_SETTINGS` and `ACTION_LOCATION_SOURCE_SETTINGS`. `ACCESS_COARSE_LOCATION`, Wi-Fi-state, and Wi-Fi-change permissions are also present in Flutter's manifest, but the routed BLE flow itself only requests the permissions above.

## GATT Contract

The firmware's NimBLE provisioning service is primary service `0000fffe-0000-1000-8000-00805f9b34fb`:

| Characteristic | UUID | Operation and payload |
| --- | --- | --- |
| Wi-Fi SSID | `0000ff01-0000-1000-8000-00805f9b34fb` | UTF-8 write with response. Firmware accepts 1–63 bytes. |
| Wi-Fi password | `0000ff02-0000-1000-8000-00805f9b34fb` | UTF-8 write with response. Firmware accepts 0–63 bytes. |
| Provisioning status | `0000ff03-0000-1000-8000-00805f9b34fb` | Enable notifications before writes; UTF-8 JSON response. |

Flutter requests MTU 256 but does not chunk outgoing values. It buffers notification fragments until its buffer contains both `{` and `}`, then decodes JSON; a React Native implementation should preserve compatibility while using a robust complete-JSON framing buffer. Firmware emits `{"status":"ok","device_id":"aa:bb:cc:dd:ee:ff","ip":"192.168.x.x"}` after Wi-Fi succeeds and credentials are saved, or `{"status":"fail"}` on failure. Flutter waits 30 seconds for this notification, rejects a non-`ok` status as a password/Wi-Fi failure, and requires nonempty `device_id` and `ip`. Firmware allows 30–600 seconds for the app to provide both writes (default 300 seconds), waits up to 30 seconds for Wi-Fi, and leaves a 500 ms notification grace period before BLE stops.

`FFE1`/`FFE2` are retained test-mode temperature/humidity read constants and are not used by the provisioning route.

## Wi-Fi, Local Device, and Cloud Handoff

```text
BLE SSID/password writes
  → FF03 {status, device_id, ip}
  → authenticated POST /api/devices
  → local HTTP GET http://<ip>/api/info
  → local HTTP POST http://<ip>/api/config
  → device reboot, MQTT online status
  → authenticated GET /api/devices/announce/:deviceId polling
  → name/room assignment
```

After the BLE success response, Flutter calls `POST /devices` with `{device_id: lowercased ID, name: "Smart Air <last six hex>", home_id}` and receives `201` with the device plus one-time `secret_key`. A 409 `Device already registered` is recoverable only when this in-memory attempt still has its secret, or when the device has already announced; otherwise Flutter tells the user to delete/factory-reset because credentials cannot be recovered.

The app then probes `GET http://<ip>/api/info` every 250 ms for up to 10 seconds, requiring a matching lowercased `device_id`. Local timeouts are connect 2 seconds, send 10 seconds, receive 2 seconds. It posts `{device_id, secret_key}` to `/api/config` (an optional `broker_uri` is supported by the service but omitted by the reachable screen). The device accepts a maximum 512-byte JSON body, validates that the ID matches its MAC, persists the MQTT configuration once, returns `{"ok":true,"rebooting":true}`, then reboots after 750 ms. A second configuration returns 409.

`Step4CloudScreen` immediately polls `GET /devices/announce/:deviceId`, first immediately and then every 2 seconds, with one request in flight and a 60-second deadline. `{announced:true}` advances automatically to naming. A false result or request failures until deadline show a retry CTA; the final message includes the last request error when available. The backend sets the announce flag only after an MQTT online status and retains it in Redis for five minutes.

## Failure and Retry Behavior

| Condition | Observed Flutter behavior |
| --- | --- |
| Permission denied / permanent denial | Show a specific blocker; permanent denial can open app settings; re-run preflight with “Check again.” |
| Bluetooth or legacy location disabled | Show specific blocker and native settings action; do not scan. |
| Scan failure or no devices | Show scan error/retry or “Ready to scan”; scan is not auto-retried. |
| Connect/GATT/notification failure | Preserve the error, stop the active action, and allow a retry/back path; a missing service or characteristic is explicit. |
| Wi-Fi failure or no FF03 reply | Fail credential send (30-second client wait); device reports generic Wi-Fi/password failure when it can notify. |
| Registration/local HTTP failure | Stay on Wi-Fi step with an error snackbar; local ID mismatch is a hard safety error. |
| Cloud announce timeout | After 60 seconds, remain on cloud confirmation with Retry or Cancel to Home. |

## React Native Migration Recommendation

Do not install a BLE package in this phase. Evaluate `react-native-ble-plx` as the leading bare-React-Native option because it covers adapter state, scan, connection, service discovery, MTU negotiation, characteristic writes, and notification monitoring. Confirm its Android/iOS permission and background behavior against the supported React Native versions before approval; an Expo-only abstraction is not an appropriate default for this native project.

Create a narrow `src/services/ble/` boundary: `permissions`, `adapter`, `smartAirGatt`, and `provisioningSession`. Keep local HTTP configuration in a separate provision service using the existing authenticated HTTP client only for cloud requests; never send the one-time secret to logs or persistent storage. A testable state machine should model `idle → preflight → scanning → connecting → connected → sendingCredentials → waitingForBleResult → registering → configuringLocal → waitingForAnnounce → naming → complete`, plus `blocked`, `failed`, and `cancelled`. Only an announced cloud state permits completion.

Unit-test permission decisions, name filtering/RSSI ordering, UUID and UTF-8 payload construction, fragmented notification decoding, all timeout paths, and ID normalization with a mocked adapter. Add contract tests for local HTTP and cloud registration/announce polling. Finally validate on physical Android API 30 and 31+ devices and iOS hardware, including Bluetooth/location changes, Wi-Fi failure, disconnect/reconnect, local-network reachability, and the complete device-to-cloud handoff; simulators cannot establish BLE parity.
