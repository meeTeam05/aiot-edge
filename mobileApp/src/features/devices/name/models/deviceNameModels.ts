/** The database uses an unbounded VARCHAR, so only the backend's required nonblank constraint applies. */
export class DeviceNameValidationError extends Error {
  constructor() {
    super('Enter a device name');
    this.name = 'DeviceNameValidationError';
  }
}

export function validatedDeviceName(value: string): string {
  const name = value.trim();
  if (name.length === 0) throw new DeviceNameValidationError();
  return name;
}
