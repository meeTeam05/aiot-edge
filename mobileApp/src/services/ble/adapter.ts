import { BleManager, State, type BleError, type Characteristic, type Device } from 'react-native-ble-plx';

import { normalizeBleError } from './bleErrors';
import { requestBlePermissions } from './permissions';
import type {
  BleAdapter,
  BleCharacteristicRef,
  BleGattService,
  BleNotificationListener,
  BleScanDevice,
  BleSubscription,
  BluetoothState,
} from './bleTypes';

function toBluetoothState(state: State): BluetoothState {
  switch (state) {
    case State.PoweredOn:
      return 'poweredOn';
    case State.PoweredOff:
      return 'poweredOff';
    case State.Unsupported:
      return 'unsupported';
    case State.Unauthorized:
      return 'unauthorized';
    case State.Resetting:
      return 'resetting';
    default:
      return 'unknown';
  }
}

function toScanDevice(device: Device): BleScanDevice {
  return { id: device.id, name: device.name ?? device.localName ?? 'Unknown device', rssi: device.rssi };
}

function encodeBase64(value: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index] ?? 0;
    const second = value[index + 1];
    const third = value[index + 2];
    const triplet = first * 65_536 + (second ?? 0) * 256 + (third ?? 0);
    encoded += alphabet[Math.floor(triplet / 262_144)]!;
    encoded += alphabet[Math.floor(triplet / 4_096) % 64]!;
    encoded += second === undefined ? '=' : alphabet[Math.floor(triplet / 64) % 64]!;
    encoded += third === undefined ? '=' : alphabet[triplet % 64]!;
  }
  return encoded;
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.split('=').join('');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('BLE characteristic contained invalid base64');
    buffer = buffer * 64 + index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push(Math.floor(buffer / 2 ** bits) % 256);
      buffer %= 2 ** bits;
    }
  }
  return Uint8Array.from(bytes);
}

/** `react-native-ble-plx` implementation behind the library-neutral BLE boundary. */
export class ReactNativeBleAdapter implements BleAdapter {
  private readonly manager: BleManager;

  constructor(manager = new BleManager()) {
    this.manager = manager;
  }

  async getState(): Promise<BluetoothState> {
    try {
      return toBluetoothState(await this.manager.state());
    } catch (error) {
      throw normalizeBleError(error);
    }
  }

  requestPermissions() {
    return requestBlePermissions();
  }

  async startScan(onDevice: (device: BleScanDevice) => void, onError: (error: Error) => void): Promise<void> {
    try {
      await this.manager.startDeviceScan(null, null, (error: BleError | null, device: Device | null) => {
        if (error) {
          onError(normalizeBleError(error, 'scanFailed'));
        } else if (device) {
          onDevice(toScanDevice(device));
        }
      });
    } catch (error) {
      throw normalizeBleError(error, 'scanFailed');
    }
  }

  async stopScan(): Promise<void> {
    try {
      await this.manager.stopDeviceScan();
    } catch (error) {
      throw normalizeBleError(error, 'scanFailed');
    }
  }

  async connect(deviceId: string, timeoutMs = 10_000): Promise<BleScanDevice> {
    try {
      return toScanDevice(await this.manager.connectToDevice(deviceId, { timeout: timeoutMs }));
    } catch (error) {
      throw normalizeBleError(error, 'connectionFailed');
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    try {
      await this.manager.cancelDeviceConnection(deviceId);
    } catch (error) {
      throw normalizeBleError(error, 'disconnected');
    }
  }

  async discoverServices(deviceId: string): Promise<readonly BleGattService[]> {
    try {
      await this.manager.discoverAllServicesAndCharacteristicsForDevice(deviceId);
      const services = await this.manager.servicesForDevice(deviceId);
      return Promise.all(services.map(async (service) => ({
        uuid: service.uuid,
        characteristics: (await this.manager.characteristicsForDevice(deviceId, service.uuid)).map((characteristic) => ({ uuid: characteristic.uuid })),
      })));
    } catch (error) {
      throw normalizeBleError(error, 'gattFailure');
    }
  }

  async requestMtu(deviceId: string, mtu: number): Promise<void> {
    try {
      await this.manager.requestMTUForDevice(deviceId, mtu);
    } catch (error) {
      throw normalizeBleError(error, 'gattFailure');
    }
  }

  async writeCharacteristic(deviceId: string, characteristic: BleCharacteristicRef, value: Uint8Array): Promise<void> {
    try {
      await this.manager.writeCharacteristicWithResponseForDevice(
        deviceId,
        characteristic.serviceUuid,
        characteristic.characteristicUuid,
        encodeBase64(value),
      );
    } catch (error) {
      throw normalizeBleError(error, 'gattFailure');
    }
  }

  subscribeToCharacteristic(
    deviceId: string,
    characteristic: BleCharacteristicRef,
    listener: BleNotificationListener,
  ): BleSubscription {
    return this.manager.monitorCharacteristicForDevice(
      deviceId,
      characteristic.serviceUuid,
      characteristic.characteristicUuid,
      (error: BleError | null, value: Characteristic | null) => {
        if (error) {
          listener(normalizeBleError(error, 'gattFailure'), null);
          return;
        }
        try {
          listener(null, value?.value == null ? null : decodeBase64(value.value));
        } catch (decodeError) {
          listener(normalizeBleError(decodeError, 'gattFailure'), null);
        }
      },
    );
  }

  destroy(): void {
    this.manager.destroy();
  }
}
