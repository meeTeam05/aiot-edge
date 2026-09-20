import {
  deviceFromDto,
  type Device,
  type DeviceDto,
  HomeDataMappingError,
} from '../../home/models/homeModels';

/** Shared with Home because both features consume the same GET /devices contract. */
export { deviceFromDto };
export type { Device, DeviceDto };

export interface DeviceShadow {
  reported: Record<string, unknown>;
  desired: Record<string, unknown>;
  updatedAt: Date | null;
}

export interface Command {
  id: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  createdAt: Date;
  executedAt: Date | null;
  errorMessage: string | null;
}

export type CommandStatus = 'pending' | 'sent' | 'done' | 'error' | 'timeout';
export type CommandPayload = Record<string, unknown>;
export interface CommandSubmission { commandId: string; status: 'pending'; submittedAt: Date; }

export interface TelemetryPoint {
  ts: Date;
  temperature: number | null;
  humidity: number | null;
  coPpm: number | null;
  no2Ppm: number | null;
  mode: string | null;
}

export interface DeviceShadowDto {
  reported?: Record<string, unknown>;
  desired?: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface CommandDto {
  id: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  executed_at?: string | null;
  error_message?: string | null;
}

export interface TelemetryPointDto {
  ts: string;
  temperature?: number | null;
  humidity?: number | null;
  co_ppm?: number | null;
  no2_ppm?: number | null;
  mode?: string | null;
}

export class DeviceDataMappingError extends Error {
  constructor() {
    super('Unexpected server response');
    this.name = 'DeviceDataMappingError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new DeviceDataMappingError();
  return value;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) throw new DeviceDataMappingError();
  return field;
}

function nullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === undefined || field === null) return null;
  if (typeof field !== 'string') throw new DeviceDataMappingError();
  return field;
}

function nullableFiniteNumber(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  if (field === undefined || field === null) return null;
  if (typeof field !== 'number' || !Number.isFinite(field)) throw new DeviceDataMappingError();
  return field;
}

function dateFromString(raw: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new DeviceDataMappingError();
  return date;
}

function nullableDate(value: Record<string, unknown>, key: string): Date | null {
  const raw = nullableString(value, key);
  return raw === null ? null : dateFromString(raw);
}

function requiredDate(value: Record<string, unknown>, key: string): Date {
  return dateFromString(requiredString(value, key));
}

function nullableObject(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  if (field === undefined || field === null) return {};
  return record(field);
}

function commandStatus(value: Record<string, unknown>): CommandStatus {
  const status = requiredString(value, 'status');
  if (status === 'pending' || status === 'sent' || status === 'done' || status === 'error' || status === 'timeout') return status;
  throw new DeviceDataMappingError();
}

export function deviceShadowFromDto(value: unknown): DeviceShadow {
  const dto = record(value);
  return {
    reported: nullableObject(dto, 'reported'),
    desired: nullableObject(dto, 'desired'),
    updatedAt: nullableDate(dto, 'updatedAt'),
  };
}

export function commandFromDto(value: unknown): Command {
  const dto = record(value);
  return {
    id: requiredString(dto, 'id'),
    payload: record(dto.payload),
    status: commandStatus(dto),
    createdAt: requiredDate(dto, 'created_at'),
    executedAt: nullableDate(dto, 'executed_at'),
    errorMessage: nullableString(dto, 'error_message'),
  };
}

/** Mirrors Flutter's `TelemetryPoint.tryFromJson`: an invalid timestamp drops the point. */
export function telemetryPointTryFromDto(value: unknown): TelemetryPoint | null {
  try {
    const dto = record(value);
    return {
      ts: requiredDate(dto, 'ts'),
      temperature: nullableFiniteNumber(dto, 'temperature'),
      humidity: nullableFiniteNumber(dto, 'humidity'),
      coPpm: nullableFiniteNumber(dto, 'co_ppm'),
      no2Ppm: nullableFiniteNumber(dto, 'no2_ppm'),
      mode: nullableString(dto, 'mode'),
    };
  } catch (error) {
    if (error instanceof DeviceDataMappingError) return null;
    throw error;
  }
}

export function commandsFromDto(value: unknown): Command[] {
  if (!Array.isArray(value)) throw new DeviceDataMappingError();
  return value.map(commandFromDto);
}

export function telemetryPointsFromDto(value: unknown): TelemetryPoint[] {
  if (!Array.isArray(value)) throw new DeviceDataMappingError();
  return value.map(telemetryPointTryFromDto).filter((point): point is TelemetryPoint => point !== null);
}

/** Converts the shared Home mapper's response error to this feature's boundary error. */
export function dashboardDeviceFromDto(value: unknown): Device {
  try {
    return deviceFromDto(value);
  } catch (error) {
    if (error instanceof HomeDataMappingError) throw new DeviceDataMappingError();
    throw error;
  }
}
