import type { OtaProgressEvent } from '../../../../services/realtime/realtimeEvents';
import type { OtaRealtimeProgress } from '../models/otaProgressModels';

function progressValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

/** Maps only the OTA states published by the existing firmware contract. */
export function otaProgressFromEvent(event: OtaProgressEvent): OtaRealtimeProgress | null {
  const status = event.payload.status;
  const progress = progressValue(event.payload.progress);

  if (status === 'rebooting') return { eventId: event.id, state: 'waiting_reboot', progress, occurredAt: event.occurredAt, errorMessage: null, requestedVersion: null };
  if (status === 'failed' || status === 'sha256_mismatch') return { eventId: event.id, state: 'failed', progress, occurredAt: event.occurredAt, errorMessage: null, requestedVersion: null };
  if (status === 'starting' || status === undefined || status === null) {
    return { eventId: event.id, state: 'downloading', progress, occurredAt: event.occurredAt, errorMessage: null, requestedVersion: null };
  }

  return null;
}

export function isTerminalOtaProgress(progress: OtaRealtimeProgress): boolean {
  return progress.state === 'waiting_reboot' || progress.state === 'failed';
}
