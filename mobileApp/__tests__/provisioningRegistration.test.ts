import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { ApiError, httpClient } from '../src/api/httpClient';
import {
  ProvisioningRegistrationService,
  registrationApi,
  type RegistrationApi,
} from '../src/features/provisioning/registration';
import { useProvisioningSessionStore } from '../src/features/provisioning/session';

const originalAdapter = httpClient.defaults.adapter;

function response(config: InternalAxiosRequestConfig, data: unknown, status = 201): AxiosResponse {
  return { config, data, status, statusText: 'Created', headers: {} };
}

function readySession(): void {
  const store = useProvisioningSessionStore.getState();
  store.clear();
  store.setConnected({ bleDeviceId: 'ble-device-1', homeId: 'home-1' });
  store.setWifiResult({ deviceId: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.22' });
  store.setLocalConfigurationResult({
    deviceId: 'aa:bb:cc:dd:ee:ff', firmware: '1.0.0', ipAddress: '192.168.1.22', configured: false,
  });
}

describe('provisioning backend registration', () => {
  afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

  it('sends the Flutter-equivalent registration payload and maps its one-time secret', async () => {
    let body: unknown;
    httpClient.defaults.adapter = async config => {
      body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      return response(config, { id: 'AA:BB:CC:DD:EE:FF', home_id: 'home-1', name: 'Smart Air DDEEFF', secret_key: 'one-time-secret' });
    };

    await expect(registrationApi.register({ deviceId: ' AA:BB:CC:DD:EE:FF ', name: 'Smart Air DDEEFF', homeId: 'home-1' })).resolves.toEqual({
      device: { id: 'aa:bb:cc:dd:ee:ff', homeId: 'home-1', name: 'Smart Air DDEEFF' }, secretKey: 'one-time-secret',
    });
    expect(body).toEqual({ device_id: 'aa:bb:cc:dd:ee:ff', name: 'Smart Air DDEEFF', home_id: 'home-1' });
  });

  it('marks the session completed_registration and retains the secret only in memory', async () => {
    readySession();
    const api: RegistrationApi = {
      register: jest.fn(async () => ({
        device: { id: 'aa:bb:cc:dd:ee:ff', homeId: 'home-1', name: 'Smart Air DDEEFF' }, secretKey: 'one-time-secret',
      })),
    };

    await expect(new ProvisioningRegistrationService(api).registerActiveSessionDevice()).resolves.toMatchObject({
      device: { id: 'aa:bb:cc:dd:ee:ff' },
    });
    expect(api.register).toHaveBeenCalledWith({ deviceId: 'aa:bb:cc:dd:ee:ff', name: 'Smart Air DDEEFF', homeId: 'home-1' });
    expect(useProvisioningSessionStore.getState().session).toMatchObject({
      registeredDeviceId: 'aa:bb:cc:dd:ee:ff', registrationSecret: 'one-time-secret', status: 'completed_registration',
    });
  });

  it('normalizes a backend error through the authenticated HTTP client and marks the session failed', async () => {
    readySession();
    const api: RegistrationApi = { register: jest.fn(async () => { throw new ApiError('Device already registered', 409); }) };
    await expect(new ProvisioningRegistrationService(api).registerActiveSessionDevice()).rejects.toMatchObject({ statusCode: 409, message: 'Device already registered' });
    expect(useProvisioningSessionStore.getState().session?.status).toBe('failed');
  });

  it('rejects a malformed response and a missing secret_key at the API boundary', async () => {
    httpClient.defaults.adapter = async config => response(config, { id: 'aa:bb', home_id: 'home-1', name: 'Smart Air AABB' });
    await expect(registrationApi.register({ deviceId: 'aa:bb', name: 'Smart Air AABB', homeId: 'home-1' })).rejects.toMatchObject({
      name: 'ApiError', statusCode: 0, message: 'Unexpected device registration response',
    });

    httpClient.defaults.adapter = async config => Promise.reject(new AxiosError(
      'Conflict', undefined, config, undefined, response(config, { error: 'Device already registered' }, 409),
    ));
    await expect(registrationApi.register({ deviceId: 'aa:bb', name: 'Smart Air AABB', homeId: 'home-1' })).rejects.toMatchObject({
      name: 'ApiError', statusCode: 409, message: 'Device already registered',
    });
  });
});
