import { AxiosError } from 'axios';

import {
  LocalDeviceError,
  LocalDeviceService,
  localDeviceInfoFromDto,
  normaliseLocalDeviceError,
  type LocalDeviceApi,
} from '../src/features/provisioning/localDevice';
import { useProvisioningSessionStore } from '../src/features/provisioning/session';

function readySession(): void {
  const store = useProvisioningSessionStore.getState();
  store.setConnected({ bleDeviceId: 'ble-device-1', homeId: 'home-1' });
  store.setWifiResult({ deviceId: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.22' });
}

describe('local device configuration handoff', () => {
  beforeEach(() => useProvisioningSessionStore.getState().clear());

  it('validates local device reachability and retains its result in the provisioning session', async () => {
    readySession();
    const api: LocalDeviceApi = {
      getInfo: jest.fn(async host => ({ deviceId: 'aa:bb:cc:dd:ee:ff', firmware: '1.0.0', ipAddress: host })),
      configure: jest.fn(),
    };
    const service = new LocalDeviceService({ api });

    await expect(service.waitForActiveSessionDevice()).resolves.toEqual({
      deviceId: 'aa:bb:cc:dd:ee:ff', firmware: '1.0.0', ipAddress: '192.168.1.22', configured: false,
    });
    expect(api.getInfo).toHaveBeenCalledWith('192.168.1.22');
    expect(useProvisioningSessionStore.getState().session).toMatchObject({
      status: 'completed',
      localConfigurationResult: { configured: false, firmware: '1.0.0' },
    });
  });

  it('reports a timeout and marks the session failed when the device stays unreachable', async () => {
    readySession();
    let time = 0;
    const api: LocalDeviceApi = {
      getInfo: jest.fn(async () => { throw new LocalDeviceError('unreachable', 'Unable to reach device'); }),
      configure: jest.fn(),
    };
    const service = new LocalDeviceService({
      api,
      now: () => time,
      delay: async milliseconds => { time += milliseconds; },
    });

    await expect(service.waitForActiveSessionDevice()).rejects.toMatchObject({ code: 'timeout' });
    expect(useProvisioningSessionStore.getState().session?.status).toBe('failed');
  });

  it('normalizes an unreachable local-network request without using cloud authentication', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(normaliseLocalDeviceError(error)).toMatchObject({
      code: 'unreachable', message: 'Unable to reach the device on the local network',
    });
  });

  it('rejects malformed local info and marks the session failed', async () => {
    readySession();
    const api: LocalDeviceApi = {
      getInfo: jest.fn(async () => localDeviceInfoFromDto({ device_id: 'aa:bb:cc:dd:ee:ff' })),
      configure: jest.fn(),
    };
    await expect(new LocalDeviceService({ api }).waitForActiveSessionDevice()).rejects.toMatchObject({ code: 'malformedResponse' });
    expect(useProvisioningSessionStore.getState().session?.status).toBe('failed');
  });

  it('rejects a reachable but different device as a provisioning safety failure', async () => {
    readySession();
    const api: LocalDeviceApi = {
      getInfo: jest.fn(async () => ({ deviceId: '11:22:33:44:55:66', firmware: '1.0.0', ipAddress: '192.168.1.22' })),
      configure: jest.fn(),
    };
    await expect(new LocalDeviceService({ api }).waitForActiveSessionDevice()).rejects.toMatchObject({ code: 'deviceMismatch' });
    expect(useProvisioningSessionStore.getState().session?.status).toBe('failed');
  });
});
