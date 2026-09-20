import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { ApiError, httpClient } from '../src/api/httpClient';
import {
  announceApi,
  AnnouncePollingError,
  CloudAnnounceService,
  type AnnounceApi,
} from '../src/features/provisioning/announce';
import { useProvisioningSessionStore } from '../src/features/provisioning/session';

const originalAdapter = httpClient.defaults.adapter;

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function configuredSession(): void {
  const store = useProvisioningSessionStore.getState();
  store.clear();
  store.setConnected({ bleDeviceId: 'ble-device-1', homeId: 'home-1' });
  store.setWifiResult({ deviceId: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.22' });
  store.setLocalConfigurationResult({ deviceId: 'aa:bb:cc:dd:ee:ff', firmware: '1.0.0', ipAddress: '192.168.1.22', configured: false });
  store.setRegistrationResult({ registeredDeviceId: 'aa:bb:cc:dd:ee:ff', registrationSecret: 'one-time-secret' });
  store.setDeviceConfigured({ deviceId: 'aa:bb:cc:dd:ee:ff', firmware: '1.0.0', ipAddress: '192.168.1.22', configured: true });
}

describe('cloud announce polling', () => {
  beforeEach(() => useProvisioningSessionStore.getState().clear());
  afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

  it('uses the authenticated announce endpoint and maps its response', async () => {
    let requestedUrl = '';
    httpClient.defaults.adapter = async config => {
      requestedUrl = config.url ?? '';
      return response(config, { announced: true });
    };
    await expect(announceApi.check('AA:BB:CC:DD:EE:FF')).resolves.toBe(true);
    expect(requestedUrl).toBe('/devices/announce/aa%3Abb%3Acc%3Add%3Aee%3Aff');
  });

  it('completes and clears the provisioning session on immediate announcement', async () => {
    configuredSession();
    const api: AnnounceApi = { check: jest.fn(async () => true) };
    const complete = jest.fn(async () => useProvisioningSessionStore.getState().clear());
    await expect(new CloudAnnounceService({ api, complete }).start()).resolves.toBeUndefined();
    expect(api.check).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session).toBeNull();
  });

  it('keeps the session until the final user-acknowledged provisioning handoff', async () => {
    configuredSession();
    await new CloudAnnounceService({ api: { check: jest.fn(async () => true) } }).start();
    expect(useProvisioningSessionStore.getState().session).toMatchObject({ registeredDeviceId: 'aa:bb:cc:dd:ee:ff', status: 'completed' });
  });

  it('polls immediately and then at two-second intervals until delayed success', async () => {
    configuredSession();
    const api: AnnounceApi = { check: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true) };
    const delays: number[] = [];
    const complete = jest.fn(async () => useProvisioningSessionStore.getState().clear());
    await new CloudAnnounceService({ api, delay: async milliseconds => { delays.push(milliseconds); }, complete }).start();
    expect(api.check).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([2_000, 2_000]);
  });

  it('marks the session failed after the Flutter-equivalent 60-second timeout', async () => {
    configuredSession();
    let time = 0;
    const api: AnnounceApi = { check: jest.fn(async () => false) };
    const service = new CloudAnnounceService({
      api,
      now: () => time,
      delay: async milliseconds => { time += milliseconds; },
      complete: async () => undefined,
    });
    await expect(service.start()).rejects.toMatchObject({ code: 'timeout' });
    expect(time).toBe(60_000);
    expect(useProvisioningSessionStore.getState().session?.status).toBe('failed');
  });

  it('cancels without completing or making another poll request', async () => {
    configuredSession();
    let releaseDelay!: () => void;
    const api: AnnounceApi = { check: jest.fn(async () => false) };
    const service = new CloudAnnounceService({
      api,
      delay: () => new Promise<void>(resolve => { releaseDelay = resolve; }),
      complete: async () => undefined,
    });
    const request = service.start();
    await Promise.resolve();
    service.cancel();
    releaseDelay();
    await expect(request).rejects.toMatchObject({ code: 'cancelled' });
    expect(api.check).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session?.status).toBe('waiting_cloud_announce');
  });

  it('retries a timed-out cloud check using the retained provisioning session', async () => {
    configuredSession();
    let time = 0;
    let announced = false;
    const api: AnnounceApi = { check: jest.fn(async () => announced) };
    const complete = jest.fn(async () => useProvisioningSessionStore.getState().clear());
    const service = new CloudAnnounceService({
      api,
      now: () => time,
      delay: async milliseconds => { time += milliseconds; },
      complete,
    });
    await expect(service.start()).rejects.toMatchObject({ code: 'timeout' });
    announced = true;
    await expect(service.retry()).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session).toBeNull();
  });

  it('preserves backend error context until timeout and rejects malformed backend responses', async () => {
    configuredSession();
    let time = 0;
    const api: AnnounceApi = { check: jest.fn(async () => { throw new ApiError('Service unavailable', 503); }) };
    const service = new CloudAnnounceService({ api, now: () => time, delay: async milliseconds => { time += milliseconds; }, complete: async () => undefined });
    await expect(service.start()).rejects.toMatchObject({ code: 'timeout', message: expect.stringContaining('Service unavailable') });

    httpClient.defaults.adapter = async config => response(config, { announced: 'yes' });
    await expect(announceApi.check('aa:bb')).rejects.toMatchObject({ name: 'ApiError', statusCode: 0 });
    httpClient.defaults.adapter = async config => Promise.reject(new AxiosError('Unavailable', undefined, config, undefined, response(config, { error: 'Service unavailable' }, 503)));
    await expect(announceApi.check('aa:bb')).rejects.toMatchObject({ name: 'ApiError', statusCode: 503, message: 'Service unavailable' });
    expect(AnnouncePollingError).toBeDefined();
  });
});
