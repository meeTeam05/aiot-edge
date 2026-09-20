# Phase 2 Dependency Proposal

## Decision Summary

This proposal prepares the authentication foundation only. It preserves the Flutter implementation as the behavioral source of truth and reuses the existing `/api/auth/*` backend contract without server changes. **No packages are installed by this document.**

Recommended Phase 2 additions are React Navigation (core/native stack), Axios, TanStack Query, Zustand, React Native Keychain, and a build-time environment loader. `@react-navigation/bottom-tabs` is deliberately deferred to Phase 3, when the Flutter tab shell is migrated. `react-native-safe-area-context` is already installed.

### Phase 3.1 dependency update

`@react-navigation/bottom-tabs ^7.19.2` is now installed for the approved Flutter-equivalent persistent Home/Notifications/Profile shell. It was deferred until this phase because Phase 2 required only the authentication stack; no additional icon library was added.

## Existing Authentication Contract

### Flutter reference

`authProvider` is a Riverpod `AsyncNotifier<User?>`. At launch it restores `refresh_token` and `user_json` from `flutter_secure_storage` and considers the session available without a network call. The first protected request refreshes the access token only if it receives `401`.

`AuthService` uses Dio with JSON and 10-second connect/send/receive timeouts. It calls `POST /auth/login` with `{email,password}`, `POST /auth/register` with `{email,password,full_name}`, and `POST /auth/logout`. Login stores the access token in memory, and securely stores only the refresh token plus serialized user. Logout clears local state even if the server request fails.

The Dio interceptor adds a Bearer token to non-auth requests. A non-auth `401` starts one shared refresh promise, calls `/auth/refresh` with `{refreshToken}`, replaces tokens, and retries the original request once. Auth-route `401`s and retried requests are not refreshed. A failed refresh clears secure storage, clears memory, and forces the app back to unauthenticated state.

### Backend contract

All paths below are relative to the configured `/api` base URL.

| Endpoint | Request | Success response | Client behavior |
| --- | --- | --- | --- |
| `POST /auth/login` | `{email,password}` | `{accessToken,refreshToken,user}` | Keep access token in memory; store refresh token and user securely. |
| `POST /auth/register` | `{email,password,full_name}` | `201` user | Match Flutter: immediately log in with the same credentials. |
| `POST /auth/refresh` | `{refreshToken}` | `{accessToken,refreshToken}` | Replace both values atomically before retrying one failed request. |
| `POST /auth/logout` | Bearer access token | `{success:true}` | Attempt server revocation, then always clear the local session. |

JWTs contain `sub` and `email` and expire after 15 minutes by default. Refresh tokens last 30 days by default, are stored hashed on the server, and rotate on every refresh. The server accepts a mobile refresh token in the request body. Token reuse revokes active refresh sessions; its five-second concurrent-race grace path still rejects the duplicate request. Therefore, the client must share exactly one in-flight refresh operation and must never independently refresh per failed request. Authentication routes are rate-limited to ten requests per minute. Expected errors use `{error: string}`.

## Proposed Dependencies

| Area | Proposed package(s) | Why / Flutter equivalent / purpose | Alternatives and decision |
| --- | --- | --- | --- |
| Navigation | `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens` | React Navigation is the approved plan and replaces Flutter `go_router`. A native stack supports the bootstrap, login, register, and protected-app boundary with typed routes and reset-on-logout behavior. `react-native-screens` supplies its native screen implementation. | A custom conditional root component could gate auth, but would not provide the planned typed stack or extensible detail navigation. Do not add a router library alongside React Navigation. Defer `@react-navigation/bottom-tabs` until Phase 3. |
| HTTP client | `axios` | Axios is the approved replacement for Flutter Dio. It provides a configured client, request Bearer header interceptor, response `401` interceptor, retry metadata, and centralized `{error}` normalization. | Native `fetch` can work but would require hand-built interceptor, timeout, retry, and error-normalization infrastructure. `ky` is another wrapper but adds no advantage over the approved Axios approach. |
| Server state | `@tanstack/react-query` | TanStack Query is the approved counterpart to Riverpod `AsyncNotifierProvider` for remote data. Phase 2 adds the provider boundary so logout can clear the query cache; later phases use it for homes, devices, telemetry, and SSE invalidation. | SWR provides caching but does not match the approved plan as closely. A Zustand-only approach would duplicate server data and complicate invalidation. |
| Client state | `zustand` | Zustand is the approved replacement for Flutter's `authProvider` session role and forced-logout signal. It holds bootstrapping state, in-memory access token, current user, and session actions—never device or telemetry collections. | React Context plus `useReducer` is viable for this small scope but is less consistent with the approved architecture and becomes cumbersome for non-component interceptor access. Redux Toolkit is unnecessary for this focused global state. |
| Secure storage | `react-native-keychain` | This gives the bare React Native app Keychain/Keystore-backed persistence, replacing `flutter_secure_storage`. It will store only the refresh token and serialized user; the access token stays in memory. | `expo-secure-store` is appropriate only after an explicit Expo move, which this generated React Native project has not made. `@react-native-async-storage/async-storage` must not be used for tokens because it is not secure storage. |
| Environment configuration | `react-native-config` | The app needs a non-secret build-time `API_BASE_URL` per `.env.development` and `.env.production`, rather than a hardcoded production URL. This replaces Flutter compile-time environment configuration and connects the Phase 1 environment boundary to native builds. | Native build settings plus a custom generated TypeScript module avoid a package but add platform-specific maintenance. Expo environment variables are out of scope for this bare React Native project. |

No additional test dependency is proposed: existing Jest can mock Axios and Keychain interfaces. No SSE or BLE package belongs in this phase. Direct MQTT remains prohibited.

## Installation Set and Impact

The approved runtime dependencies were installed against React Native `0.87.1` and React `19.2.3`:

```text
@react-navigation/native ^7.4.1
@react-navigation/native-stack ^7.19.2
react-native-screens ^4.28.0
axios ^1.20.0
@tanstack/react-query ^5.103.1
zustand ^5.0.15
react-native-keychain ^10.0.0
react-native-config ^1.7.2
```

This is intentionally a small set: each package covers an approved architecture boundary that the current foundation cannot implement. Navigation screens, Keychain/Keystore, and environment configuration include native integration, so implementation must still check Android/iOS setup. Axios, Query, and Zustand add JavaScript bundle code but avoid bespoke infrastructure that would be harder to test and maintain. The versions are locked in `mobileApp/package-lock.json`; do not upgrade them during Phase 2.

## Implementation Boundaries After Approval

Phase 2 should change only authentication-related files, anticipated under `mobileApp/src/`:

- `api/httpClient.ts`, `api/authApi.ts`, and typed API errors;
- `services/secureStorage.ts` and environment loading;
- `models/user.ts` and auth DTOs/normalizers;
- `state/sessionStore.ts` for bootstrap, login, registration, logout, and forced logout;
- `navigation/` root, auth stack, and protected-session gate;
- `features/auth/` screens and hooks, matching Flutter behavior; and
- focused Jest tests for storage handling, login mapping, one-flight refresh, retry-once, refresh failure, and local logout.

Before implementation, verify package compatibility with the generated native project, retain the existing API shapes and snake_case transport fields, and test against mocked responses. Run `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand` after the feature is implemented. Update `docs/DEVELOPMENT_LOG.md` when Phase 2 is complete.



## Dependency Version Policy

After installation:

- Commit package-lock.json.
- Do not upgrade dependencies during Phase 2.
- Record installed versions in this document.


## Authentication Test Cases

Must verify:

1. Fresh install:
- No token
- Redirect to login


2. Existing session:
- Restore refresh token
- Enter app


3. Access token expired:
- Receive 401
- Refresh once
- Retry request


4. Refresh failed:
- Clear session
- Return login


5. Logout:
- Server logout attempted
- Local storage cleared


Before implementation inspect:

Flutter:
- lib/providers/auth_provider.dart
- lib/services/auth_service.dart
- lib/core/router.dart

Backend:
- auth routes
- auth service
- token utilities
