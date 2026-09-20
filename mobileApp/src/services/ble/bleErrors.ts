export type BleErrorCode =
  | 'unsupported'
  | 'bluetoothOff'
  | 'permissionDenied'
  | 'permissionPermanentlyDenied'
  | 'deviceUnavailable'
  | 'connectionTimeout'
  | 'scanFailed'
  | 'connectionFailed'
  | 'gattFailure'
  | 'provisioningFailed'
  | 'provisioningTimeout'
  | 'invalidProvisioningResponse'
  | 'disconnected'
  | 'unknown';

export class SmartAirBleError extends Error {
  constructor(
    public readonly code: BleErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SmartAirBleError';
  }
}

type NativeBleError = { errorCode?: string; message?: string };

export function normalizeBleError(error: unknown, fallback: BleErrorCode = 'unknown'): SmartAirBleError {
  if (error instanceof SmartAirBleError) return error;

  const nativeError = error as NativeBleError | null;
  const errorCode = nativeError?.errorCode?.toLowerCase() ?? '';
  const message = nativeError?.message ?? (error instanceof Error ? error.message : 'Bluetooth operation failed');

  if (errorCode.includes('unsupported')) return new SmartAirBleError('unsupported', message, error);
  if (errorCode.includes('poweredoff')) return new SmartAirBleError('bluetoothOff', message, error);
  if (errorCode.includes('unauthorized') || errorCode.includes('permission')) {
    return new SmartAirBleError('permissionDenied', message, error);
  }
  if (errorCode.includes('timeout') || errorCode.includes('timedout')) {
    return new SmartAirBleError('connectionTimeout', message, error);
  }
  if (errorCode.includes('notfound') || errorCode.includes('unavailable')) {
    return new SmartAirBleError('deviceUnavailable', message, error);
  }
  if (errorCode.includes('disconnected')) return new SmartAirBleError('disconnected', message, error);
  if (errorCode.includes('connection')) return new SmartAirBleError('connectionFailed', message, error);
  if (errorCode.includes('scan')) return new SmartAirBleError('scanFailed', message, error);
  if (errorCode.includes('characteristic') || errorCode.includes('service') || errorCode.includes('gatt')) {
    return new SmartAirBleError('gattFailure', message, error);
  }

  return new SmartAirBleError(fallback, message, error);
}
