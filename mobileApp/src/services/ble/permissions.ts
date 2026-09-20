import { PermissionsAndroid, Platform } from 'react-native';

import type { BlePermissionResult, BlePermissionStatus } from './bleTypes';

export type BlePlatform = 'android' | 'ios';

export interface BlePermissionPlan {
  manifestPermissions: readonly string[];
  runtimePermissions: readonly string[];
}

export interface AndroidPermissionRequester {
  requestMultiple(permissions: readonly string[]): Promise<Record<string, string>>;
}

export function getBlePermissionPlan(platform: BlePlatform, androidApiLevel?: number): BlePermissionPlan {
  if (platform === 'ios') return { manifestPermissions: [], runtimePermissions: [] };

  if ((androidApiLevel ?? 31) >= 31) {
    return {
      manifestPermissions: ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'],
      runtimePermissions: ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'],
    };
  }

  return {
    manifestPermissions: [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    runtimePermissions: ['android.permission.ACCESS_FINE_LOCATION'],
  };
}

export function evaluateAndroidPermissionResults(
  results: Record<string, string>,
  requiredPermissions: readonly string[],
): BlePermissionStatus {
  const statuses = requiredPermissions.map((permission) => results[permission]);
  if (statuses.every((status) => status === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
  if (statuses.some((status) => status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
  return 'denied';
}

export async function requestBlePermissions(
  platform: BlePlatform = Platform.OS === 'android' ? 'android' : 'ios',
  androidApiLevel: number | undefined = typeof Platform.Version === 'number' ? Platform.Version : undefined,
  requester: AndroidPermissionRequester = PermissionsAndroid,
): Promise<BlePermissionResult> {
  const plan = getBlePermissionPlan(platform, androidApiLevel);
  if (platform === 'ios') {
    // iOS presents its CoreBluetooth authorization state through the BLE manager.
    return { status: 'granted', requestedPermissions: plan.runtimePermissions };
  }

  const results = await requester.requestMultiple(plan.runtimePermissions);
  return {
    status: evaluateAndroidPermissionResults(results, plan.runtimePermissions),
    requestedPermissions: plan.runtimePermissions,
  };
}
