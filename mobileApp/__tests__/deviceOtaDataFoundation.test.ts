import { QueryClient } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { httpClient } from '../src/api/httpClient';
import { deviceOtaApi } from '../src/features/device/ota/api/deviceOtaApi';
import {
  deviceOtaQueryKeys,
  deviceOtaQueryOptions,
  otaRequestMutationOptions,
} from '../src/features/device/ota/hooks/useDeviceOta';

const originalAdapter = httpClient.defaults.adapter;
let requestBodies: unknown[];

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

beforeEach(() => {
  requestBodies = [];
  httpClient.defaults.adapter = async config => {
    if (config.method === 'get' && config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/ota/versions') {
      return response(config, {
        device_id: 'AA:BB:CC:DD:EE:FF',
        current_version: '1.0.0',
        device_online: true,
        versions: [{ version: '1.1.0', filename: 'smart-air-1.1.0.bin', url: 'https://example.test/ota/smart-air-1.1.0.bin' }],
      });
    }
    if (config.method === 'post' && config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/ota') {
      requestBodies.push(typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
      return response(config, {
        device_id: 'AA:BB:CC:DD:EE:FF',
        version: '1.1.0',
        filename: 'smart-air-1.1.0.bin',
        status: 'accepted',
      }, 202);
    }
    throw new Error(`Unexpected request: ${config.method} ${config.url}`);
  };
});

afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe('Device OTA data foundation', () => {
  it('maps the Flutter-equivalent catalog response and permits an empty catalog', async () => {
    await expect(deviceOtaApi.getCatalog('AA:BB:CC:DD:EE:FF')).resolves.toEqual({
      deviceId: 'AA:BB:CC:DD:EE:FF',
      currentVersion: '1.0.0',
      deviceOnline: true,
      versions: [{ version: '1.1.0', filename: 'smart-air-1.1.0.bin', url: 'https://example.test/ota/smart-air-1.1.0.bin' }],
    });

    httpClient.defaults.adapter = async config => response(config, {
      device_id: 'AA:BB:CC:DD:EE:FF', current_version: null, device_online: false, versions: [],
    });
    await expect(deviceOtaApi.getCatalog('AA:BB:CC:DD:EE:FF')).resolves.toMatchObject({
      currentVersion: null, deviceOnline: false, versions: [],
    });
  });

  it('uses a device-ID cache key, queries the catalog, and invalidates after a request', async () => {
    const queryClient = new QueryClient();
    expect(deviceOtaQueryOptions(' AA:BB:CC:DD:EE:FF ').queryKey).toEqual(deviceOtaQueryKeys.catalog('aa:bb:cc:dd:ee:ff'));
    await expect(queryClient.fetchQuery(deviceOtaQueryOptions('AA:BB:CC:DD:EE:FF'))).resolves.toMatchObject({
      deviceId: 'AA:BB:CC:DD:EE:FF', versions: [expect.objectContaining({ version: '1.1.0' })],
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const options = otaRequestMutationOptions(queryClient, 'AA:BB:CC:DD:EE:FF');
    await options.onMutate('1.1.0');
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress('AA:BB:CC:DD:EE:FF'))).toEqual(expect.objectContaining({ state: 'requesting', requestedVersion: '1.1.0' }));
    await options.onSuccess({ deviceId: 'AA:BB:CC:DD:EE:FF', filename: 'smart-air-1.1.0.bin', status: 'accepted', version: '1.1.0' });
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress('AA:BB:CC:DD:EE:FF'))).toEqual(expect.objectContaining({ state: 'accepted', requestedVersion: '1.1.0' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deviceOtaQueryKeys.catalog('AA:BB:CC:DD:EE:FF') });
    queryClient.clear();
  });

  it('records a retryable request failure only in the device OTA progress cache', () => {
    const queryClient = new QueryClient();
    const options = otaRequestMutationOptions(queryClient, 'AA:BB:CC:DD:EE:FF');
    options.onError(new Error('device offline'), '1.1.0');
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress('AA:BB:CC:DD:EE:FF'))).toEqual(expect.objectContaining({ state: 'failed', errorMessage: 'device offline', requestedVersion: '1.1.0' }));
    expect(queryClient.getQueryData(['notifications'])).toBeUndefined();
    queryClient.clear();
  });

  it('sends only the existing OTA request payload and maps its accepted acknowledgement', async () => {
    await expect(deviceOtaApi.requestOta('AA:BB:CC:DD:EE:FF', '1.1.0')).resolves.toEqual({
      deviceId: 'AA:BB:CC:DD:EE:FF', version: '1.1.0', filename: 'smart-air-1.1.0.bin', status: 'accepted',
    });
    expect(requestBodies).toEqual([{ version: '1.1.0' }]);
  });

  it('normalizes an offline-device error through the shared HTTP client', async () => {
    httpClient.defaults.adapter = async config => Promise.reject(new AxiosError(
      'Conflict', undefined, config, undefined, response(config, { error: 'device offline' }, 409),
    ));
    await expect(deviceOtaApi.requestOta('AA:BB:CC:DD:EE:FF', '1.1.0')).rejects.toMatchObject({
      name: 'ApiError', message: 'device offline', statusCode: 409,
    });
  });

  it('rejects malformed catalog responses at the OTA boundary', async () => {
    httpClient.defaults.adapter = async config => response(config, { device_id: 'AA:BB:CC:DD:EE:FF', versions: [] });
    await expect(deviceOtaApi.getCatalog('AA:BB:CC:DD:EE:FF')).rejects.toMatchObject({
      name: 'ApiError', message: 'Unexpected server response', statusCode: 0,
    });
  });
});
