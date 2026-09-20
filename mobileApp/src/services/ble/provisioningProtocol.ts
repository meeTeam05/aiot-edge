import { SmartAirBleError } from './bleErrors';
import { JsonNotificationBuffer, type BleAdapter } from './bleTypes';
import type { SmartAirGattConnection } from './smartAirGatt';

export type WifiProvisioningState =
  | 'idle'
  | 'connected'
  | 'sending_ssid'
  | 'sending_password'
  | 'waiting_result'
  | 'success'
  | 'failed';

export interface WifiProvisioningResult {
  deviceId: string;
  ip: string;
}

type StateListener = (state: WifiProvisioningState) => void;
const RESULT_TIMEOUT_MS = 30_000;

/** Small RN-runtime-safe UTF-8 codec; avoids a Node/TextEncoder polyfill dependency. */
export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.codePointAt(index)!;
    if (codePoint > 0xffff) index += 1;
    if (codePoint <= 0x7f) bytes.push(codePoint);
    else if (codePoint <= 0x7ff) bytes.push(192 + Math.floor(codePoint / 64), 128 + (codePoint % 64));
    else if (codePoint <= 0xffff) bytes.push(224 + Math.floor(codePoint / 4096), 128 + (Math.floor(codePoint / 64) % 64), 128 + (codePoint % 64));
    else bytes.push(240 + Math.floor(codePoint / 262144), 128 + (Math.floor(codePoint / 4096) % 64), 128 + (Math.floor(codePoint / 64) % 64), 128 + (codePoint % 64));
  }
  return Uint8Array.from(bytes);
}

function decodeUtf8(value: Uint8Array): string {
  let encoded = '';
  value.forEach((byte) => { encoded += `%${byte.toString(16).padStart(2, '0')}`; });
  return decodeURIComponent(encoded);
}

/** Implements only the Flutter BLE Wi-Fi credential exchange; no cloud/local-device handoff. */
export class WifiProvisioningProtocol {
  private listeners = new Set<StateListener>();
  private state: WifiProvisioningState = 'idle';

  constructor(private readonly adapter: BleAdapter) {}

  get currentState(): WifiProvisioningState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async provision(connection: SmartAirGattConnection, ssid: string, password: string): Promise<WifiProvisioningResult> {
    this.transition('connected');
    const frames = new JsonNotificationBuffer();

    return new Promise<WifiProvisioningResult>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let subscription: { remove(): void } | null = null;
      const finish = (error?: SmartAirBleError, result?: WifiProvisioningResult) => {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        subscription?.remove();
        if (error !== undefined) {
          this.transition('failed');
          reject(error);
        } else if (result !== undefined) {
          this.transition('success');
          resolve(result);
        }
      };

      try {
        subscription = this.adapter.subscribeToCharacteristic(connection.deviceId, connection.statusCharacteristic, (error, bytes) => {
          if (error !== null) {
            finish(new SmartAirBleError('provisioningFailed', error.message, error));
            return;
          }
          if (bytes === null) return;
          let decoded: string;
          try {
            decoded = decodeUtf8(bytes);
          } catch {
            finish(new SmartAirBleError('invalidProvisioningResponse', 'Invalid UTF-8 response from device'));
            return;
          }
          const notifications = frames.push(decoded);
          for (const notification of notifications) {
            if (notification.type === 'invalid') {
              finish(new SmartAirBleError('invalidProvisioningResponse', `Invalid response from device: ${notification.raw}`));
              return;
            }
            const status = notification.value.status;
            if (status !== 'ok') {
              finish(new SmartAirBleError('provisioningFailed', 'Device failed to connect to WiFi — check password'));
              return;
            }
            const deviceId = notification.value.device_id;
            const ip = notification.value.ip;
            if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
              finish(new SmartAirBleError('invalidProvisioningResponse', 'Device did not report its ID'));
              return;
            }
            if (typeof ip !== 'string' || ip.trim().length === 0) {
              finish(new SmartAirBleError('invalidProvisioningResponse', 'Device did not report its local IP'));
              return;
            }
            finish(undefined, { deviceId: deviceId.trim().toLowerCase(), ip: ip.trim() });
            return;
          }
        });
      } catch (error) {
        finish(new SmartAirBleError('provisioningFailed', error instanceof Error ? error.message : 'Failed to subscribe to device status', error));
        return;
      }

      const writeCredentials = async () => {
        try {
          this.transition('sending_ssid');
          await this.adapter.writeCharacteristic(connection.deviceId, connection.ssidCharacteristic, encodeUtf8(ssid));
          this.transition('sending_password');
          await this.adapter.writeCharacteristic(connection.deviceId, connection.passwordCharacteristic, encodeUtf8(password));
          this.transition('waiting_result');
          if (!settled) {
            timeout = setTimeout(() => finish(new SmartAirBleError('provisioningTimeout', `Timed out waiting for device response (${RESULT_TIMEOUT_MS / 1000}s)`)), RESULT_TIMEOUT_MS);
          }
        } catch (error) {
          finish(new SmartAirBleError('provisioningFailed', error instanceof Error ? error.message : 'Failed to send Wi-Fi credentials', error));
        }
      };
      writeCredentials().catch(() => undefined);
    });
  }

  private transition(state: WifiProvisioningState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

export { RESULT_TIMEOUT_MS };
