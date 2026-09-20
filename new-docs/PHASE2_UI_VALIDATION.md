# Phase 2 UI Validation Checklist

## Purpose and Setup

Use this checklist on Android and iOS after configuring a non-secret `API_BASE_URL` and a test account. Flutter (`app/`) is the reference. Record platform, build, result, screenshots, and any mismatch for each item. Do not validate the Phase 3 Home, tabs, Profile, or Notifications here.

| Field | Record |
| --- | --- |
| Platform / device | |
| React Native build / commit | |
| API environment | |
| Tester / date | |

## 1. App Startup

- [ ] Launch from a terminated state. The app respects safe areas and uses the Atmosphere background, brand dot logo, `Smart Air`, and `Indoor Air Quality Monitor` copy.
- [ ] No API URL, refresh token, access token, or device secret is displayed or logged.
- [ ] Compare light and dark system appearance with Flutter’s palette, typography, spacing, and logo placement.

## 2. Splash and Session Restoration

- [ ] Fresh install/no secure session: show the splash gate while restoration runs, then Login. Flutter must not flash Login before restoration completes.
- [ ] Valid persisted refresh token and user: show splash, then enter the authenticated app stack without a login request. The access token remains memory-only.
- [ ] Corrupt/missing persisted user or refresh data: clear it and enter Login.
- [ ] Note: Flutter splash has no spinner; the React Native splash currently has one. Record this as a visual-parity decision if it is considered material.

## 3. Login Screen

- [ ] Confirm the Flutter copy and order: logo, `Welcome back`, `Sign in to continue`, Email, Password, Sign In, Forgot password, and Register link.
- [ ] Fields use email keyboard behavior, hidden password input, 56px-style rounded fields, and Atmosphere colors/spacings.
- [ ] Submit valid account credentials. Confirm `POST /auth/login` succeeds, secure session data is stored, and the app stack replaces auth.
- [ ] Tap `Forgot password?`; Flutter shows `Coming soon`. Confirm the React Native alert communicates the same result.
- [ ] Tap Register, then return with Sign In/back. Confirm no authenticated app screen remains reachable while unauthenticated.

## 4. Register Screen

- [ ] Confirm copy/order: logo, `Create Account`, the indoor-air-quality subtitle, Full Name, Email, Password, Create Account, and Sign In link.
- [ ] Submit a new valid account. Confirm `POST /auth/register` sends `{email,password,full_name}`, then the same credentials are automatically sent to `/auth/login`.
- [ ] Confirm successful registration enters the authenticated app stack and persists only refresh token plus user.
- [ ] Verify existing-email and backend validation failures keep the user on Register with entered fields intact.

## 5. Validation Messages

- [ ] Login invalid email: `Enter a valid email`.
- [ ] Login password under six characters: `Min 6 characters`.
- [ ] Register blank name: `Name required`.
- [ ] Register invalid email: `Valid email required`.
- [ ] Register password under six characters: `Min 6 characters`.
- [ ] Confirm invalid submits make no network request and error borders/messages are readable in both themes.

## 6. Loading States

- [ ] During login/register, the primary button is disabled and shows a spinner; duplicate submissions cannot occur.
- [ ] Fields and navigation remain stable while a request is pending.
- [ ] After success or failure, loading stops. Compare the timing and disabled button behavior with Flutter’s `PrimaryButton`.

## 7. Server Error Handling

- [ ] Invalid credentials (`401`) display the backend message, such as `Invalid credentials`.
- [ ] Registration conflict (`409`) displays the backend message, such as `Email already registered`.
- [ ] Network/timeout failure is understandable and allows another attempt; no token is logged.
- [ ] Flutter uses a transient `SnackBar` for form failures. React Native currently displays an inline accessible error. Record whether this presentation difference is accepted or requires parity work.

## 8. Logout Flow

- [ ] From the interim authenticated app screen, tap Log out.
- [ ] Confirm `POST /auth/logout` is attempted with the memory Bearer token when available.
- [ ] With a successful response and with simulated network failure, confirm refresh token/user storage and memory access token are cleared and Login returns.
- [ ] Relaunch after logout; confirm the session does not restore.

## 9. Navigation Transitions

- [ ] `bootstrapping` → splash only; `unauthenticated` → AuthNavigator; `authenticated` → AppNavigator.
- [ ] Authentication success leaves no Login/Register route visible or reachable by back navigation.
- [ ] Registration pushes Register from Login; Sign In/back returns to Login.
- [ ] Forced logout after an unrecoverable protected-request refresh returns to AuthNavigator.
- [ ] Confirm the authenticated destination has no bottom tab bar. Persistent Home/Notifications/Profile tabs are intentionally Phase 3 work.

## Result and Follow-up

Mark this run **Pass**, **Pass with accepted differences**, or **Fail**. Link screenshots/recordings and file each mismatch with Flutter route, React Native screen, platform, reproduction steps, and expected versus actual behavior. Re-run this checklist after any authentication UI, storage, interceptor, or navigation change.
