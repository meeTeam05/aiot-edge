export interface LocalDeviceInfo {
  deviceId: string;
  firmware: string;
  ipAddress: string;
}

export interface LocalDeviceConfigurationResult extends LocalDeviceInfo {
  /** False after reachability validation; true only after a future /api/config POST. */
  configured: boolean;
}

export interface LocalDeviceConfigurationRequest {
  deviceId: string;
  secretKey: string;
  brokerUri?: string;
}

export class LocalDeviceError extends Error {
  constructor(
    public readonly code: 'timeout' | 'unreachable' | 'malformedResponse' | 'deviceMismatch' | 'configurationFailed' | 'sessionMissing',
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'LocalDeviceError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LocalDeviceError('malformedResponse', 'Device returned an invalid provisioning response');
  }
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.trim().length === 0) {
    throw new LocalDeviceError('malformedResponse', 'Device returned an invalid provisioning response');
  }
  return field.trim();
}

/** Strictly maps firmware GET /api/info transport fields. */
export function localDeviceInfoFromDto(value: unknown): LocalDeviceInfo {
  const dto = record(value);
  return {
    deviceId: stringField(dto, 'device_id').toLowerCase(),
    firmware: stringField(dto, 'firmware'),
    ipAddress: stringField(dto, 'ip'),
  };
}

/** Firmware returns this exact acknowledgement after it persists configuration and schedules reboot. */
export function localConfigurationAcknowledged(value: unknown): boolean {
  const dto = record(value);
  if (dto.ok !== true || dto.rebooting !== true) {
    throw new LocalDeviceError('malformedResponse', 'Device did not acknowledge configuration');
  }
  return true;
}
