/**
 * Normalized firmware OTA progress. The firmware publishes `starting`, numeric
 * progress frames (with no status), `rebooting`, `failed`, and
 * `sha256_mismatch`; the latter two are represented as a single failure UI
 * state. Completion is inferred only by reconciliation against the existing
 * device data source; no `ota.completed` wire event is modeled.
 */
export type OtaProgressState =
  | 'idle'
  | 'requesting'
  | 'accepted'
  | 'downloading'
  | 'waiting_reboot'
  | 'checking_device'
  | 'completed'
  | 'failed'
  | 'timeout';

export interface OtaRealtimeProgress {
  eventId: string | null;
  state: OtaProgressState;
  progress: number | null;
  occurredAt: Date;
  /** Request or firmware failure detail; never sourced from an invented event. */
  errorMessage: string | null;
  /** Version accepted by the existing OTA request endpoint for this lifecycle. */
  requestedVersion: string | null;
}
