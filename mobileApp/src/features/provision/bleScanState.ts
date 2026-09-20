import type { BleAdapter, BlePermissionResult, BluetoothState } from '../../services/ble/bleTypes';

export type BlePreflightStatus =
  | 'ready'
  | 'unsupported'
  | 'bluetoothOff'
  | 'permissionDenied'
  | 'permissionPermanentlyDenied'
  | 'locationOff';

export interface BlePreflightOptions {
  adapter: Pick<BleAdapter, 'getState' | 'requestPermissions'>;
  requiresLegacyLocationService?: boolean;
  isLegacyLocationServiceEnabled?: () => Promise<boolean>;
}

function statusFromBluetoothState(state: BluetoothState): BlePreflightStatus | null {
  if (state === 'unsupported') return 'unsupported';
  if (state === 'poweredOff') return 'bluetoothOff';
  if (state === 'unauthorized') return 'permissionDenied';
  return null;
}

function statusFromPermission(result: BlePermissionResult): BlePreflightStatus | null {
  if (result.status === 'blocked') return 'permissionPermanentlyDenied';
  if (result.status === 'denied' || result.status === 'unavailable') return 'permissionDenied';
  return null;
}

/** Mirrors Flutter's permission → adapter → legacy-location preflight order. */
export async function checkBlePreflight({
  adapter,
  requiresLegacyLocationService = false,
  isLegacyLocationServiceEnabled,
}: BlePreflightOptions): Promise<BlePreflightStatus> {
  const state = await adapter.getState();
  if (state === 'unsupported') return 'unsupported';

  const permissionStatus = statusFromPermission(await adapter.requestPermissions());
  if (permissionStatus !== null) return permissionStatus;

  const bluetoothStatus = statusFromBluetoothState(await adapter.getState());
  if (bluetoothStatus !== null) return bluetoothStatus;

  if (requiresLegacyLocationService && isLegacyLocationServiceEnabled !== undefined) {
    if (!(await isLegacyLocationServiceEnabled())) return 'locationOff';
  }
  return 'ready';
}

export function preflightCopy(status: BlePreflightStatus): { title: string; message: string } {
  switch (status) {
    case 'unsupported':
      return { title: 'Bluetooth unavailable', message: 'This phone does not support Bluetooth Low Energy scanning.' };
    case 'bluetoothOff':
      return { title: 'Bluetooth is off', message: 'Turn on Bluetooth, then check again.' };
    case 'permissionDenied':
      return { title: 'Bluetooth permission required', message: 'Allow Bluetooth access, then check again.' };
    case 'permissionPermanentlyDenied':
      return { title: 'Bluetooth permission blocked', message: 'Open app settings and allow Bluetooth access, then check again.' };
    case 'locationOff':
      return { title: 'Location is off', message: 'Turn on Location services, then check again.' };
    case 'ready':
      return { title: 'Ready to scan', message: 'Keep the device in pairing mode, then scan.' };
  }
}
