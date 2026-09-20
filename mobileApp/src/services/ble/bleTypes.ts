export type BluetoothState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'poweredOff'
  | 'poweredOn';

export type BlePermissionStatus = 'granted' | 'denied' | 'blocked' | 'unavailable';

export interface BlePermissionResult {
  status: BlePermissionStatus;
  requestedPermissions: readonly string[];
}

export interface BleScanDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export interface BleCharacteristicRef {
  serviceUuid: string;
  characteristicUuid: string;
}

export interface BleGattCharacteristic {
  uuid: string;
}

export interface BleGattService {
  uuid: string;
  characteristics: readonly BleGattCharacteristic[];
}

export interface BleSubscription {
  remove(): void;
}

export type BleNotificationListener = (error: Error | null, value: Uint8Array | null) => void;

/**
 * Library-neutral BLE boundary. Provisioning screens and workflow orchestration
 * are intentionally excluded from this Phase 6.2 foundation.
 */
export interface BleAdapter {
  getState(): Promise<BluetoothState>;
  requestPermissions(): Promise<BlePermissionResult>;
  startScan(onDevice: (device: BleScanDevice) => void, onError: (error: Error) => void): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string, timeoutMs?: number): Promise<BleScanDevice>;
  disconnect(deviceId: string): Promise<void>;
  discoverServices(deviceId: string): Promise<readonly BleGattService[]>;
  requestMtu(deviceId: string, mtu: number): Promise<void>;
  writeCharacteristic(deviceId: string, characteristic: BleCharacteristicRef, value: Uint8Array): Promise<void>;
  subscribeToCharacteristic(
    deviceId: string,
    characteristic: BleCharacteristicRef,
    listener: BleNotificationListener,
  ): BleSubscription;
  destroy(): void;
}

export type JsonNotificationFrame =
  | { type: 'message'; raw: string; value: Record<string, unknown> }
  | { type: 'invalid'; raw: string; error: string };

/** Buffers UTF-8 notification fragments and emits complete JSON object frames. */
export class JsonNotificationBuffer {
  private buffer = '';

  push(fragment: string): JsonNotificationFrame[] {
    this.buffer += fragment;
    const frames: JsonNotificationFrame[] = [];

    while (this.buffer.length > 0) {
      const start = this.buffer.indexOf('{');
      if (start < 0) {
        this.buffer = '';
        break;
      }
      if (start > 0) this.buffer = this.buffer.slice(start);

      const end = this.findObjectEnd(this.buffer);
      if (end === null) break;

      const raw = this.buffer.slice(0, end + 1);
      this.buffer = this.buffer.slice(end + 1);
      try {
        const value: unknown = JSON.parse(raw);
        if (value === null || Array.isArray(value) || typeof value !== 'object') {
          frames.push({ type: 'invalid', raw, error: 'BLE notification must be a JSON object' });
        } else {
          frames.push({ type: 'message', raw, value: value as Record<string, unknown> });
        }
      } catch (error) {
        frames.push({ type: 'invalid', raw, error: error instanceof Error ? error.message : 'Invalid JSON' });
      }
    }

    return frames;
  }

  reset(): void {
    this.buffer = '';
  }

  private findObjectEnd(value: string): number | null {
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (inString) {
        if (escaping) escaping = false;
        else if (character === '\\') escaping = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return null;
  }
}
