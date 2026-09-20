import { PermissionsAndroid } from 'react-native';

import { normalizeBleError } from '../src/services/ble/bleErrors';
import { JsonNotificationBuffer } from '../src/services/ble/bleTypes';
import { evaluateAndroidPermissionResults, getBlePermissionPlan } from '../src/services/ble/permissions';
import { matchesSmartAirProvisioningName, smartAirGatt } from '../src/services/ble/smartAirGatt';

describe('BLE foundation', () => {
  it('maps the firmware GATT contract exactly', () => {
    expect(smartAirGatt.provisioningServiceUuid).toBe('0000fffe-0000-1000-8000-00805f9b34fb');
    expect(smartAirGatt.provisioningSsidCharacteristicUuid).toBe('0000ff01-0000-1000-8000-00805f9b34fb');
    expect(smartAirGatt.provisioningPasswordCharacteristicUuid).toBe('0000ff02-0000-1000-8000-00805f9b34fb');
    expect(smartAirGatt.provisioningNotifyCharacteristicUuid).toBe('0000ff03-0000-1000-8000-00805f9b34fb');
    expect(matchesSmartAirProvisioningName('SMART_AIR_13ED8C')).toBe(true);
    expect(matchesSmartAirProvisioningName('SmartAir-legacy')).toBe(true);
    expect(matchesSmartAirProvisioningName('Other device')).toBe(false);
  });

  it('uses Android 12+ scan/connect permissions and legacy location permission', () => {
    expect(getBlePermissionPlan('android', 31).runtimePermissions).toEqual([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ]);
    expect(getBlePermissionPlan('android', 30).runtimePermissions).toEqual(['android.permission.ACCESS_FINE_LOCATION']);
    expect(getBlePermissionPlan('ios')).toEqual({ manifestPermissions: [], runtimePermissions: [] });
  });

  it('distinguishes denied and permanently blocked Android permissions', () => {
    const required = ['android.permission.BLUETOOTH_SCAN'];
    expect(evaluateAndroidPermissionResults({ [required[0]!]: PermissionsAndroid.RESULTS.GRANTED }, required)).toBe('granted');
    expect(evaluateAndroidPermissionResults({ [required[0]!]: PermissionsAndroid.RESULTS.DENIED }, required)).toBe('denied');
    expect(evaluateAndroidPermissionResults({ [required[0]!]: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN }, required)).toBe('blocked');
  });

  it('frames fragmented, consecutive, and malformed JSON notifications', () => {
    const buffer = new JsonNotificationBuffer();
    expect(buffer.push('{"status":"')).toEqual([]);
    expect(buffer.push('ok","ip":"192.168.1.2"}')).toEqual([
      { type: 'message', raw: '{"status":"ok","ip":"192.168.1.2"}', value: { status: 'ok', ip: '192.168.1.2' } },
    ]);
    expect(buffer.push('{"status":"fail"}{bad}')).toEqual([
      { type: 'message', raw: '{"status":"fail"}', value: { status: 'fail' } },
      expect.objectContaining({ type: 'invalid', raw: '{bad}' }),
    ]);
    buffer.push('{"pending"');
    buffer.reset();
    expect(buffer.push('}')).toEqual([]);
  });

  it('normalizes native BLE failures into stable errors', () => {
    expect(normalizeBleError({ errorCode: 'BluetoothPoweredOff', message: 'off' }).code).toBe('bluetoothOff');
    expect(normalizeBleError({ errorCode: 'BluetoothUnauthorized', message: 'denied' }).code).toBe('permissionDenied');
    expect(normalizeBleError({ errorCode: 'DeviceDisconnected', message: 'gone' }).code).toBe('disconnected');
  });
});
