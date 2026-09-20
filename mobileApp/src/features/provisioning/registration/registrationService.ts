import { useProvisioningSessionStore } from '../session';

import { registrationApi, type RegistrationApi } from './registrationApi';
import type { DeviceRegistrationResult } from './models/registrationModels';

function defaultProvisioningName(deviceId: string): string {
  const hex = deviceId.replace(/[^a-f0-9]/gi, '').toUpperCase();
  const suffix = hex.length > 0 ? hex.slice(-6) : deviceId.slice(-6).toUpperCase();
  return `Smart Air ${suffix}`;
}

/** Uses the already-validated local session identity to obtain its one-time backend credential. */
export class ProvisioningRegistrationService {
  constructor(private readonly api: RegistrationApi = registrationApi) {}

  async registerActiveSessionDevice(): Promise<DeviceRegistrationResult> {
    const store = useProvisioningSessionStore.getState();
    const session = store.session;
    if (session?.deviceMac === undefined || session.homeId === undefined || session.localConfigurationResult === undefined) {
      store.setFailed();
      throw new Error('Local device readiness and a selected home are required before registration');
    }

    const deviceId = session.deviceMac.trim().toLowerCase();
    store.setStatus('registering');
    try {
      const result = await this.api.register({
        deviceId,
        name: defaultProvisioningName(deviceId),
        homeId: session.homeId,
      });
      useProvisioningSessionStore.getState().setRegistrationResult({
        registeredDeviceId: result.device.id,
        registrationSecret: result.secretKey,
      });
      return result;
    } catch (error) {
      useProvisioningSessionStore.getState().setFailed();
      throw error;
    }
  }
}

export { defaultProvisioningName };
