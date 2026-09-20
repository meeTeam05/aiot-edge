import { SmartAirBleError } from './bleErrors';
import type { BleCharacteristicRef, BleGattService } from './bleTypes';

export const smartAirGatt = {
  provisioningServiceUuid: '0000fffe-0000-1000-8000-00805f9b34fb',
  provisioningSsidCharacteristicUuid: '0000ff01-0000-1000-8000-00805f9b34fb',
  provisioningPasswordCharacteristicUuid: '0000ff02-0000-1000-8000-00805f9b34fb',
  provisioningNotifyCharacteristicUuid: '0000ff03-0000-1000-8000-00805f9b34fb',
  // Firmware test-mode characteristics; not part of the provisioning workflow.
  temperatureCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  humidityCharacteristicUuid: '0000ffe2-0000-1000-8000-00805f9b34fb',
  provisioningNamePrefix: 'SMART_AIR_',
  legacyProvisioningNamePrefix: 'SmartAir-',
  requestedMtu: 256,
} as const;

export interface SmartAirGattConnection {
  deviceId: string;
  serviceUUID: string;
  ssidCharacteristic: BleCharacteristicRef;
  passwordCharacteristic: BleCharacteristicRef;
  statusCharacteristic: BleCharacteristicRef;
}

export function matchesSmartAirProvisioningName(name: string): boolean {
  const normalized = name.trim();
  return (
    normalized.startsWith(smartAirGatt.provisioningNamePrefix) ||
    normalized.startsWith(smartAirGatt.legacyProvisioningNamePrefix)
  );
}

/** Validates the exact provisioning GATT contract discovered from a connected device. */
export function discoverSmartAirService(deviceId: string, services: readonly BleGattService[]): SmartAirGattConnection {
  const service = services.find((candidate) => candidate.uuid.toLowerCase() === smartAirGatt.provisioningServiceUuid);
  if (service === undefined) {
    throw new SmartAirBleError('gattFailure', `Smart Air GATT service not found: ${smartAirGatt.provisioningServiceUuid}`);
  }

  const characteristicUuids = new Set(service.characteristics.map((characteristic) => characteristic.uuid.toLowerCase()));
  const required = [
    ['SSID', smartAirGatt.provisioningSsidCharacteristicUuid],
    ['password', smartAirGatt.provisioningPasswordCharacteristicUuid],
    ['status', smartAirGatt.provisioningNotifyCharacteristicUuid],
  ] as const;
  const missing = required.find(([, uuid]) => !characteristicUuids.has(uuid));
  if (missing !== undefined) {
    throw new SmartAirBleError('gattFailure', `Smart Air ${missing[0]} characteristic not found: ${missing[1]}`);
  }

  const serviceUUID = smartAirGatt.provisioningServiceUuid;
  return {
    deviceId,
    serviceUUID,
    ssidCharacteristic: { serviceUuid: serviceUUID, characteristicUuid: smartAirGatt.provisioningSsidCharacteristicUuid },
    passwordCharacteristic: { serviceUuid: serviceUUID, characteristicUuid: smartAirGatt.provisioningPasswordCharacteristicUuid },
    statusCharacteristic: { serviceUuid: serviceUUID, characteristicUuid: smartAirGatt.provisioningNotifyCharacteristicUuid },
  };
}
