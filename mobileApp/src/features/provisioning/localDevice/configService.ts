import { provisioningBleRegistry, useProvisioningSessionStore } from '../session';

import { configApi, type ConfigApi } from './configApi';
import { LocalDeviceError, type LocalDeviceConfigurationResult } from './models/localDeviceModels';

interface ConfigServiceDependencies {
  api?: ConfigApi;
  disconnectBle?: () => Promise<void>;
}

/** Configures the firmware only after backend registration and tears down BLE after its acknowledgement. */
export class LocalDeviceConfigService {
  private readonly api: ConfigApi;
  private readonly disconnectBle: () => Promise<void>;

  constructor({ api = configApi, disconnectBle = () => provisioningBleRegistry.clear() }: ConfigServiceDependencies = {}) {
    this.api = api;
    this.disconnectBle = disconnectBle;
  }

  async configureActiveSessionDevice(): Promise<LocalDeviceConfigurationResult> {
    const store = useProvisioningSessionStore.getState();
    const session = store.session;
    if (session?.ipAddress === undefined || session.registeredDeviceId === undefined || session.registrationSecret === undefined || session.localConfigurationResult === undefined) {
      store.setFailed();
      throw new LocalDeviceError('sessionMissing', 'Device registration and local readiness are required before configuration');
    }

    store.setStatus('configuring_device');
    try {
      await this.api.configure(session.ipAddress, {
        deviceId: session.registeredDeviceId,
        secretKey: session.registrationSecret,
      });

      // Firmware has acknowledged persistence and scheduled its reboot. Do not
      // disconnect before this point; disconnect errors are handled by the BLE service.
      await this.disconnectBle();

      const result: LocalDeviceConfigurationResult = {
        ...session.localConfigurationResult,
        configured: true,
      };
      useProvisioningSessionStore.getState().setDeviceConfigured(result);
      return result;
    } catch (error) {
      // Retain registrationSecret and device metadata for an explicit retry.
      useProvisioningSessionStore.getState().setFailed();
      throw error;
    }
  }
}
