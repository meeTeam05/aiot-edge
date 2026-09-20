import type { CommandPayload, CommandStatus, DeviceShadow, TelemetryPoint } from '../../features/device/models/deviceModels';

export type RealtimeEventType = 'device.status' | 'shadow.reported' | 'telemetry.point' | 'command.updated' | 'ota.progress' | 'replay.reset';

interface RealtimeEventBase<TType extends RealtimeEventType, TPayload> {
  id: string;
  type: TType;
  deviceId: string;
  occurredAt: Date;
  payload: TPayload;
}

export type DeviceStatusEvent = RealtimeEventBase<'device.status', { online: boolean; firmware: string | null }>;
export type ShadowReportedEvent = RealtimeEventBase<'shadow.reported', { reported: Record<string, unknown>; patch: Record<string, unknown> }>;
export type TelemetryPointEvent = RealtimeEventBase<'telemetry.point', { point: TelemetryPoint }>;
export type CommandUpdatedEvent = RealtimeEventBase<'command.updated', { commandId: string; status: CommandStatus; payload: CommandPayload; errorMessage: string | null }>;
export type OtaProgressEvent = RealtimeEventBase<'ota.progress', Record<string, unknown>>;
export type ReplayResetEvent = RealtimeEventBase<'replay.reset', { reason: string | null }>;
export type RealtimeEvent = DeviceStatusEvent | ShadowReportedEvent | TelemetryPointEvent | CommandUpdatedEvent | OtaProgressEvent | ReplayResetEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === 'string' && item.length > 0 ? item : null;
}

function dateFromDto(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function commandStatus(value: unknown): CommandStatus | null {
  return value === 'pending' || value === 'sent' || value === 'done' || value === 'error' || value === 'timeout' ? value : null;
}

/** Maps the backend SSE wire shape, retaining snake_case only at this boundary. */
export function realtimeEventFromDto(value: unknown): RealtimeEvent | null {
  if (!isRecord(value)) return null;
  const id = value.id === undefined || value.id === null ? null : String(value.id);
  const type = value.type;
  const deviceId = requiredString(value, 'device_id');
  const occurredAt = dateFromDto(value.occurred_at);
  const payload = isRecord(value.payload) ? value.payload : null;
  if (id === null || id.length === 0 || typeof type !== 'string' || occurredAt === null || payload === null) return null;
  if (deviceId === null && type !== 'replay.reset') return null;

  const normalizedDeviceId = deviceId?.trim().toLowerCase() ?? '';
  if (type === 'device.status') {
    if (typeof payload.online !== 'boolean') return null;
    return { id, type, deviceId: normalizedDeviceId, occurredAt, payload: { online: payload.online, firmware: nullableString(payload.firmware) } };
  }
  if (type === 'shadow.reported') {
    const reported = isRecord(payload.reported) ? payload.reported : {};
    const patch = isRecord(payload.patch) ? payload.patch : {};
    return { id, type, deviceId: normalizedDeviceId, occurredAt, payload: { reported, patch } };
  }
  if (type === 'telemetry.point') {
    const ts = dateFromDto(payload.ts);
    if (ts === null) return null;
    return {
      id, type, deviceId: normalizedDeviceId, occurredAt,
      payload: { point: { ts, temperature: nullableNumber(payload.temperature), humidity: nullableNumber(payload.humidity), coPpm: nullableNumber(payload.co_ppm), no2Ppm: nullableNumber(payload.no2_ppm), mode: nullableString(payload.mode) } },
    };
  }
  if (type === 'command.updated') {
    const commandId = requiredString(payload, 'command_id');
    const status = commandStatus(payload.status);
    if (commandId === null || status === null) return null;
    return { id, type, deviceId: normalizedDeviceId, occurredAt, payload: { commandId, status, payload: isRecord(payload.payload) ? payload.payload : {}, errorMessage: nullableString(payload.error_message) } };
  }
  if (type === 'ota.progress') return { id, type, deviceId: normalizedDeviceId, occurredAt, payload: { ...payload } };
  if (type === 'replay.reset') return { id, type, deviceId: normalizedDeviceId, occurredAt, payload: { reason: nullableString(payload.reason) } };
  return null;
}

export function reportedShadowFromEvent(event: ShadowReportedEvent, current: DeviceShadow | null): DeviceShadow {
  return {
    reported: { ...(current?.reported ?? {}), ...event.payload.patch, ...event.payload.reported },
    desired: current?.desired ?? {},
    updatedAt: event.occurredAt,
  };
}
