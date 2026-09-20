import {
  LocalDeviceConfigService,
  LocalDeviceError,
  localConfigurationAcknowledged,
  type ConfigApi,
} from '../src/features/provisioning/localDevice';
import { useProvisioningSessionStore } from '../src/features/provisioning/session';

function registeredSession(): void {
  const store = useProvisioningSessionStore.getState();
  store.clear();
  store.setConnected({ bleDeviceId: 'ble-device-1', homeId: 'home-1' });
  store.setWifiResult({ deviceId: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.22' });
  store.setLocalConfigurationResult({
    deviceId: 'aa:bb:cc:dd:ee:ff', firmware: '1.0.0', ipAddress: '192.168.1.22', configured: false,
  });
  store.setRegistrationResult({ registeredDeviceId: 'aa:bb:cc:dd:ee:ff', registrationSecret: 'one-time-secret' });
}

describe('local device configuration handoff', () => {
  beforeEach(() => useProvisioningSessionStore.getState().clear());

  it('sends the exact local payload, waits for acknowledgement, then disconnects BLE and clears the secret', async () => {
    registeredSession();
    const calls: string[] = [];
    const api: ConfigApi = {
      configure: jest.fn(async (host, request) => {
        calls.push('configure');
        expect(host).toBe('192.168.1.22');
        expect(request).toEqual({ deviceId: 'aa:bb:cc:dd:ee:ff', secretKey: 'one-time-secret' });
      }),
    };
    const disconnectBle = jest.fn(async () => { calls.push('disconnect'); });

    await expect(new LocalDeviceConfigService({ api, disconnectBle }).configureActiveSessionDevice()).resolves.toMatchObject({ configured: true });
    expect(calls).toEqual(['configure', 'disconnect']);
    expect(useProvisioningSessionStore.getState().session).toMatchObject({
      status: 'device_configured', localConfigurationResult: { configured: true },
    });
    expect(useProvisioningSessionStore.getState().session).not.toHaveProperty('registrationSecret');
  });

  it('keeps registration state for retry after a local timeout and disconnects only after retry succeeds', async () => {
    registeredSession();
    const configure = jest.fn()
      .mockRejectedValueOnce(new LocalDeviceError('timeout', 'Timed out connecting to the device'))
      .mockResolvedValueOnce(undefined);
    const api: ConfigApi = { configure };
    const disconnectBle = jest.fn(async () => undefined);
    const service = new LocalDeviceConfigService({ api, disconnectBle });

    await expect(service.configureActiveSessionDevice()).rejects.toMatchObject({ code: 'timeout' });
    expect(disconnectBle).not.toHaveBeenCalled();
    expect(useProvisioningSessionStore.getState().session).toMatchObject({ status: 'failed', registrationSecret: 'one-time-secret' });

    await expect(service.configureActiveSessionDevice()).resolves.toMatchObject({ configured: true });
    expect(configure).toHaveBeenCalledTimes(2);
    expect(disconnectBle).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session).not.toHaveProperty('registrationSecret');
  });

  it('rejects an invalid or missing firmware acknowledgement without clearing the secret', async () => {
    registeredSession();
    expect(() => localConfigurationAcknowledged({ ok: true })).toThrow(LocalDeviceError);
    const api: ConfigApi = { configure: jest.fn(async () => { throw new LocalDeviceError('malformedResponse', 'Device did not acknowledge configuration'); }) };
    const disconnectBle = jest.fn(async () => undefined);

    await expect(new LocalDeviceConfigService({ api, disconnectBle }).configureActiveSessionDevice()).rejects.toMatchObject({ code: 'malformedResponse' });
    expect(disconnectBle).not.toHaveBeenCalled();
    expect(useProvisioningSessionStore.getState().session).toMatchObject({ status: 'failed', registrationSecret: 'one-time-secret' });
  });
});
