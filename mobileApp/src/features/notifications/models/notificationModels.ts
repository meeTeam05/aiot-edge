export type NotificationSeverity = 'success' | 'warning' | 'danger' | 'info';
export type KnownNotificationType =
  | 'device.online'
  | 'device.offline'
  | 'command.done'
  | 'command.error'
  | 'command.timeout'
  | 'ota.rebooting'
  | 'ota.failed';
/** The backend may add event types; preserve the Flutter client's forward compatibility. */
export type NotificationType = KnownNotificationType | (string & {});

export interface NotificationItem {
  id: string;
  type: NotificationType;
  deviceId: string;
  deviceName: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface NotificationItemDto {
  id: string | number;
  type?: string;
  device_id?: string;
  device_name?: string;
  title?: string;
  body?: string;
  severity?: string;
  occurred_at?: string;
  payload?: Record<string, unknown>;
}

export interface ListNotificationsParams {
  limit?: number;
  beforeId?: string;
}

export class NotificationDataMappingError extends Error {
  constructor() {
    super('Unexpected server response');
    this.name = 'NotificationDataMappingError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function notificationSeverityFromDto(value: unknown): NotificationSeverity {
  return value === 'success' || value === 'warning' || value === 'danger' || value === 'info'
    ? value
    : 'info';
}

/** Mirrors Flutter's DateTime.tryParse(...).toLocal() fallback to local epoch. */
export function notificationTimestampFromDto(value: unknown): Date {
  if (typeof value !== 'string') return new Date(0);
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? new Date(0) : timestamp;
}

export function notificationItemFromDto(value: unknown): NotificationItem {
  if (!isRecord(value)) throw new NotificationDataMappingError();
  return {
    id: value.id === undefined || value.id === null ? '' : String(value.id),
    type: stringValue(value.type),
    deviceId: stringValue(value.device_id),
    deviceName: stringValue(value.device_name),
    title: stringValue(value.title),
    body: stringValue(value.body),
    severity: notificationSeverityFromDto(value.severity),
    occurredAt: notificationTimestampFromDto(value.occurred_at),
    payload: isRecord(value.payload) ? { ...value.payload } : {},
  };
}

export function notificationItemsFromDto(value: unknown): NotificationItem[] {
  if (!Array.isArray(value)) throw new NotificationDataMappingError();
  return value.map(notificationItemFromDto);
}
