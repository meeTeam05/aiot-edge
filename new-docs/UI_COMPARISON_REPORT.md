# Shared UI and Visual Parity Audit

## Basis and scope

This Phase 5.2 audit compares the React Native foundation with Flutter's Atmosphere tokens, shared `AtmosphereAppBar`/`AtmosphereCard` atoms, and in-memory `AppState.themeMode`. It covers shared visual architecture and the Device Dashboard only; no API, state, command, or navigation contract changed.

## Findings before consolidation

| Area | Flutter reference | React Native gap found |
| --- | --- | --- |
| Theme | App-level Light/Dark/System `ValueNotifier` | Each screen independently read the system scheme; Profile's selector did not update the application shell. |
| Tokens | `design/tokens.dart` | Colors, typography, spacing, and radii were already aligned, but were consumed through repeated local styles. |
| Shared atoms | Atmosphere app bar, card, buttons, states, pills | App bars, bordered cards, buttons, and loading/empty/error presentations were duplicated by feature. |
| Icons | Flutter semantic Lucide names | Features used uncoordinated text glyphs. |
| Dashboard | Responsive card-grid layout | Sensor/relay/activity cards had duplicate surface treatment and lacked a single shared visual primitive. |

## Phase 5.2 result

`ThemeProvider` now sits beneath `RootApp` and observes the existing memory-only Profile preference store. All screen roots consume `useAppTheme`, so Light, Dark, and System resolve consistently without adding persistence. `src/components/ui/` now provides token-backed AppBar, Card, primary/secondary buttons, loading/empty/error states, confirmation dialog, status badge, and a semantic icon registry. Dashboard cards and the dashboard app bar/status pill use the shared primitives while preserving query, control, and realtime behavior. Its grid now mirrors Flutter's visible-width/text-scale rules: one sensor column below 360px available width or above 1.4x text scale, and one relay column above 1.7x text scale (otherwise two at 360px+).

## Phase 5.3 result

The text-symbol fallback is replaced by `lucide-react-native` over its native `react-native-svg` dependency. The existing `AppIcon` name-based API remains stable while its registry now resolves to the same semantic Lucide family used by Flutter. Jest is configured to load Lucide's CommonJS test entry point while production React Native resolves its native entry point.

The React Native asset linker registered Flutter's five checked-in font files: Plus Jakarta Sans Regular/Medium/SemiBold/Bold and JetBrains Mono Regular. Android packages the linked font assets; iOS has both `UIAppFonts` entries and Xcode resource references. Native font metadata confirms the iOS families are `Plus Jakarta Sans` and `JetBrains Mono`; React Native typography now selects those names on iOS and Android's linked-family names on Android. Flutter weights, sizes, tracking, and stable line-height metrics are expressed in the shared typography tokens.

Dashboard sensor cards now draw an SVG path from their existing latest 30 non-null telemetry values, matching Flutter's custom sparkline behavior and keeping mode-off cards visually empty. The existing query, shadow, command, and SSE paths are untouched. Android debug packaging completed with `react-native-svg` and the linked fonts present.

## Remaining visual verification

- Compare Flutter golden references with Android/iOS captures at narrow, standard, large-text, light, and dark configurations.
- Inspect Flutter and Android screenshots at narrow, standard, large-text, light, and dark configurations. Static source/build validation cannot prove pixel-level equality.
- Complete an iOS build and simulator/device rendering check on macOS; native font registration is structurally linked but not executed on this Linux host.
- Confirm dashboard grid breakpoints and sparkline paint geometry on devices with real telemetry; the source now follows Flutter's 360px/1.4x/1.7x layout rules and 30-point limit.
