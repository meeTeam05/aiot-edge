export interface DeviceRegistrationRequest {
  deviceId: string;
  name: string;
  homeId: string;
}

export interface RegisteredProvisionedDevice {
  id: string;
  homeId: string;
  name: string;
}

/** One-time material. It is held only by the in-memory provisioning session. */
export interface DeviceRegistrationResult {
  device: RegisteredProvisionedDevice;
  secretKey: string;
}

export class RegistrationDataMappingError extends Error {
  constructor(message = 'Unexpected device registration response') {
    super(message);
    this.name = 'RegistrationDataMappingError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RegistrationDataMappingError();
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.trim().length === 0) throw new RegistrationDataMappingError();
  return field.trim();
}

/** Maps only fields consumed during provisioning; no secret is exposed to UI models. */
export function deviceRegistrationFromDto(value: unknown): DeviceRegistrationResult {
  const dto = record(value);
  return {
    device: {
      id: requiredString(dto, 'id').toLowerCase(),
      homeId: requiredString(dto, 'home_id'),
      name: requiredString(dto, 'name'),
    },
    secretKey: requiredString(dto, 'secret_key'),
  };
}
