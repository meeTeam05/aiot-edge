import { useProvisioningSessionStore } from '../session';
import {
  LocalDeviceError,
  type LocalDeviceConfigurationResult,
  type LocalDeviceInfo,
} from './models/localDeviceModels';
import { localDeviceApi, type LocalDeviceApi } from './localDeviceApi';

export const LOCAL_READY_TIMEOUT_MS = 10_000;
export const LOCAL_READY_POLL_INTERVAL_MS = 250;

interface LocalDeviceServiceDependencies {
  api?: LocalDeviceApi;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function activeSession(): { deviceId: string; ipAddress: string } {
  const session = useProvisioningSessionStore.getState().session;
  if (session?.deviceMac === undefined || session.ipAddress === undefined) {
    throw new LocalDeviceError('sessionMissing', 'Wi-Fi provisioning must finish before local device configuration');
  }
  return { deviceId: session.deviceMac.trim().toLowerCase(), ipAddress: session.ipAddress };
}

/** Flutter-equivalent local reachability/payload boundary, deliberately independent of backend registration. */
export class LocalDeviceService {
  private readonly api: LocalDeviceApi;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor({ api = localDeviceApi, now = Date.now, delay: wait = delay }: LocalDeviceServiceDependencies = {}) {
    this.api = api;
    this.now = now;
    this.wait = wait;
  }

  async waitForActiveSessionDevice(): Promise<LocalDeviceConfigurationResult> {
    const { deviceId, ipAddress } = activeSession();
    useProvisioningSessionStore.getState().setStatus('device_online_check');
    const deadline = this.now() + LOCAL_READY_TIMEOUT_MS;
    let lastError: LocalDeviceError | null = null;

    while (this.now() < deadline) {
      try {
        const info = await this.api.getInfo(ipAddress);
        this.assertExpectedDevice(info, deviceId);
        const result: LocalDeviceConfigurationResult = { ...info, configured: false };
        useProvisioningSessionStore.getState().setLocalConfigurationResult(result);
        return result;
      } catch (error) {
        const normalised = error instanceof LocalDeviceError ? error : new LocalDeviceError('unreachable', 'Unable to reach the device on the local network');
        if (normalised.code === 'deviceMismatch' || normalised.code === 'malformedResponse') {
          useProvisioningSessionStore.getState().setFailed();
          throw normalised;
        }
        lastError = normalised;
        await this.wait(LOCAL_READY_POLL_INTERVAL_MS);
      }
    }

    const timeout = new LocalDeviceError('timeout', lastError?.message ?? 'Device provisioning API did not become ready in time');
    useProvisioningSessionStore.getState().setFailed();
    throw timeout;
  }

  /**
   * Used by Phase 6.5.3 after server registration yields its one-time secret.
   * The secret is supplied transiently and is never placed in session state.
   */
  async configureActiveSessionDevice(secretKey: string): Promise<LocalDeviceConfigurationResult> {
    const { deviceId, ipAddress } = activeSession();
    const ready = await this.waitForActiveSessionDevice();
    try {
      await this.api.configure(ipAddress, { deviceId, secretKey });
      const result = { ...ready, configured: true };
      useProvisioningSessionStore.getState().setLocalConfigurationResult(result);
      return result;
    } catch (error) {
      useProvisioningSessionStore.getState().setFailed();
      throw error;
    }
  }

  private assertExpectedDevice(info: LocalDeviceInfo, expectedDeviceId: string): void {
    if (info.deviceId !== expectedDeviceId) {
      throw new LocalDeviceError('deviceMismatch', 'Provisioning endpoint responded with a different device ID');
    }
  }
}
