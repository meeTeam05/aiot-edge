# Phase 7 Roadmap

## Goal

Complete and validate the non-provisioning Smart Air mobile experience in React Native while preserving Flutter behavior, server contracts, visual design, navigation, and realtime semantics. Phase 7 should close remaining monitoring, maintenance, notification, household-management, and quality-assurance gaps—not introduce replacement APIs or backend changes.

## Current Progress

Phase 7 is **partially implemented but not formally tracked** in `DEVELOPMENT_LOG.md`.

- Implemented foundations: TanStack Query, typed Axios boundaries, authenticated SSE client/router, dashboard telemetry/shadow/commands, controls, command history, OTA catalog/request, calibration polling, settings mutations, notifications REST list, and broad Jest coverage.
- Completed prerequisite: Phase 6.5/6.6 provisioning and post-provisioning lifecycle through final device-detail handoff.
- Remaining focus: realtime notification derivation, OTA progress visibility, household management, and end-to-end visual/device validation.

## Roadmap

| Phase | Scope | Flutter source-of-truth references | Deliverables | Completion evidence |
|---|---|---|---|---|
| 7.1 | Realtime notifications and OTA progress | `app/lib/providers/notifications_provider.dart`, `services/realtime_service.dart`, `screens/notifications_screen.dart`, `screens/devices/settings/ota_screen.dart` | Extend typed realtime routing for notification derivation/de-duplication and `ota.progress`; cache/UI lifecycle for OTA status; replay-reset reconciliation | Unit tests for mapping/dedup/replay, UI tests for live notification and OTA states, full suite passing |
| 7.2 | Home and household management parity | `screens/homes/homes_screen.dart`, `screens/profile/home_detail_screen.dart`, `providers/homes_provider.dart`, `services/home_service.dart` | Home list/detail, home edit/delete, room CRUD, membership invite/manage, typed navigation and cache mutation strategy | Contract tests, mutation/cache tests, navigation/UI tests, no backend changes |
| 7.3 | Dashboard/control parity and resilience | `screens/devices/device_dashboard_screen.dart`, `command_history_screen.dart`, settings screens, device providers/services | Compare every control/loading/error/queued state; fill approved dashboard/card gaps; validate cache/reconciliation under SSE disconnect/replay | Focused regression tests plus real device command/SSE validation |
| 7.4 | OTA/calibration completion and maintenance QA | Flutter OTA and calibration screens/providers | Verify terminal states, online gating, firmware-version refresh, cancellation/retry behavior, and device timing | Physical-device test matrix and automated state coverage |
| 7.5 | Visual, accessibility, and release-readiness validation | Flutter golden/widget tests and design system | Narrow-width/font-scale/dark-theme checks, screen-reader labels, navigation/back-stack checks, authenticated lifecycle checks | Captured parity evidence, accessibility checklist, green typecheck/lint/test suite |

## Work Sequencing

1. Start with 7.1 because the RN SSE parser/router, notification REST list, and OTA request UI already exist.
2. Implement 7.2 only after reviewing Flutter homes/rooms/member contracts in detail; do not infer permission rules or add endpoints.
3. Use 7.3 and 7.4 to close behavioral discrepancies discovered through real-device testing.
4. Treat 7.5 as a release gate, not optional polish.

## Architectural Guardrails

- Flutter remains the source of truth. Inspect its screen, provider, service, model, and test before each slice.
- Reuse the existing shared Axios client, authentication refresh behavior, server endpoints, and data shapes.
- Use TanStack Query for server state and the established realtime router for SSE-driven cache updates; keep Zustand limited to session/runtime workflow state.
- Do not add direct MQTT, duplicate APIs, schema changes, or persisted secrets.
- Invalidate only affected query keys and preserve command/shadow reconciliation semantics.
- Keep each phase independently testable and document the result in `docs/DEVELOPMENT_LOG.md`.

## Risks and Dependencies

| Risk / dependency | Impact | Mitigation |
|---|---|---|
| SSE replay, reconnect, and event ordering | Stale notifications, command status, or OTA UI | Preserve last-event replay behavior; test replay reset and deduplication; refresh authoritative snapshots when required |
| Device/offline command timing | Incorrect optimistic UI or misleading completion states | Continue to reconcile server command status with reported shadow; test physical devices |
| Home membership authorization | Unsafe or incompatible household-management behavior | Inspect Flutter/API contract before implementation; reuse server responses/errors exactly |
| OTA firmware/device timing | Progress and version can lag after accepted request | Treat `202` as accepted only; consume terminal progress/status and refresh device data |
| UI parity across devices | Layout/accessibility regressions | Test narrow widths, large font scale, dark/light themes, safe areas, and screen readers |

## Tracking Rules

- Add each approved Phase 7.x completion to `docs/DEVELOPMENT_LOG.md` with date, status, files, contract/UI behavior, tests, known issues, and next step.
- Update this roadmap when scope, ordering, or parity findings change.
- A phase is complete only after focused tests, `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand` pass, plus any required physical-device validation is recorded.
