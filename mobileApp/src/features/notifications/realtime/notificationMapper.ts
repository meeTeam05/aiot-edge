import type { Device } from '../../home/models/homeModels';
import type { NotificationItem, NotificationSeverity, NotificationType } from '../models/notificationModels';
import type { RealtimeEvent } from '../../../services/realtime/realtimeEvents';

interface NotificationCopy {
  body: string;
  severity: NotificationSeverity;
  title: string;
  type: NotificationType;
}

/** Pure Flutter NotificationsNotifier parity for supported SSE event types. */
export function notificationFromRealtimeEvent(event: RealtimeEvent, devices: Device[]): NotificationItem | null {
  const copy = notificationCopyFor(event);
  if (copy === null) return null;
  return {
    id: event.id,
    type: copy.type,
    deviceId: event.deviceId,
    deviceName: devices.find(device => normaliseDeviceId(device.id) === event.deviceId)?.name ?? event.deviceId,
    title: copy.title,
    body: copy.body,
    severity: copy.severity,
    occurredAt: event.occurredAt,
    payload: { ...event.payload },
  };
}

function notificationCopyFor(event: RealtimeEvent): NotificationCopy | null {
  if (event.type === 'device.status') {
    return event.payload.online
      ? { type: 'device.online', title: 'Device came online', body: 'Device is connected and reporting.', severity: 'success' }
      : { type: 'device.offline', title: 'Device went offline', body: 'Device is no longer reporting.', severity: 'warning' };
  }

  if (event.type === 'ota.progress') {
    if (event.payload.status === 'rebooting') return { type: 'ota.rebooting', title: 'OTA update applied', body: 'Device is rebooting to finish the update.', severity: 'success' };
    if (event.payload.status === 'failed') {
      const reason = typeof event.payload.reason === 'string' ? event.payload.reason.trim() : '';
      return { type: 'ota.failed', title: 'OTA update failed', body: reason || 'Device reported an OTA failure.', severity: 'danger' };
    }
    return null;
  }

  if (event.type !== 'command.updated' || !isTerminalCommandStatus(event.payload.status)) return null;
  const payload = event.payload.payload;
  if (event.payload.status === 'done') return { type: 'command.done', title: commandSuccessTitle(payload), body: 'Command completed successfully.', severity: 'success' };
  const suffix = event.payload.status === 'timeout' ? 'timed out' : 'failed';
  return {
    type: `command.${event.payload.status}`,
    title: commandFailureTitle(payload, suffix),
    body: event.payload.status === 'error' && event.payload.errorMessage?.trim()
      ? event.payload.errorMessage.trim()
      : event.payload.status === 'timeout'
        ? 'The device did not acknowledge the command in time.'
        : 'Device reported a command error.',
    severity: event.payload.status === 'timeout' ? 'warning' : 'danger',
  };
}

function isTerminalCommandStatus(status: string): status is 'done' | 'error' | 'timeout' {
  return status === 'done' || status === 'error' || status === 'timeout';
}

function commandSuccessTitle(payload: Record<string, unknown>): string {
  if (payload.type === 'relay_set') return `Relay ${String(payload.relay ?? '?')} turned ${payload.state === true ? 'on' : 'off'}`;
  if (payload.type === 'device_mode') return `Mode changed to ${String(payload.mode ?? '?').toUpperCase()}`;
  if (payload.type === 'calibrate_co') return 'CO calibration completed';
  if (payload.type === 'calibrate_no2') return 'NO2 calibration completed';
  if (payload.type === 'set_time') return 'Device time synchronized';
  return 'Command completed';
}

function commandFailureTitle(payload: Record<string, unknown>, suffix: string): string {
  if (payload.type === 'relay_set') return `Relay ${String(payload.relay ?? '?')} command ${suffix}`;
  if (payload.type === 'device_mode') return `Mode change ${suffix}`;
  if (payload.type === 'calibrate_co') return `CO calibration ${suffix}`;
  if (payload.type === 'calibrate_no2') return `NO2 calibration ${suffix}`;
  if (payload.type === 'set_time') return `Time sync ${suffix}`;
  return `Command ${suffix}`;
}

function normaliseDeviceId(value: string): string {
  return value.trim().toLowerCase();
}
