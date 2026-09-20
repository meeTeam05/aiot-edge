import { QueryClient } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { httpClient } from '../src/api/httpClient';
import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import type { Device } from '../src/features/home/models/homeModels';
import { deviceSettingsApi } from '../src/features/device/settings/api/deviceSettingsApi';
import { applyUpdatedDeviceToCaches, removeDeviceFromCaches } from '../src/features/device/settings/hooks/useDeviceSettings';

const originalAdapter = httpClient.defaults.adapter;
const existing: Device = { id: 'AA:BB:CC:DD:EE:FF', name: 'Living Room', homeId: 'home-1', roomId: 'room-1', online: true, lastSeen: null, firmwareVer: '1.2.3', mode: null, relay1: null, relay2: null, relay3: null, createdAt: null };
let updateBodies: unknown[];

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

beforeEach(() => {
  updateBodies = [];
  httpClient.defaults.adapter = async config => {
    if (config.method === 'put' && config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff') {
      updateBodies.push(typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
      return response(config, { id: existing.id, name: 'Kitchen', home_id: 'home-1', room_id: 'room-2', online: true, last_seen: null, firmware_ver: '1.2.3', created_at: null });
    }
    if (config.method === 'delete' && config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff') return response(config, undefined, 204);
    throw new Error(`Unexpected request: ${config.method} ${config.url}`);
  };
});
afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe('Device Settings API and cache integration', () => {
  it('maps the existing name/room update and delete contracts', async () => {
    const updated = await deviceSettingsApi.updateDevice('AA:BB:CC:DD:EE:FF', { name: 'Kitchen' });
    await deviceSettingsApi.updateDevice('AA:BB:CC:DD:EE:FF', { roomId: 'room-2' });
    expect(updated).toEqual(expect.objectContaining({ id: existing.id, name: 'Kitchen', roomId: 'room-2' }));
    expect(updateBodies).toEqual([{ name: 'Kitchen' }, { room_id: 'room-2' }]);
    await expect(deviceSettingsApi.deleteDevice('AA:BB:CC:DD:EE:FF')).resolves.toBeUndefined();
  });

  it('normalizes backend update errors through the shared HTTP client', async () => {
    httpClient.defaults.adapter = async config => Promise.reject(new AxiosError('Forbidden', undefined, config, undefined, response(config, { error: 'Forbidden' }, 403)));
    await expect(deviceSettingsApi.updateDevice(existing.id, { name: 'Kitchen' })).rejects.toMatchObject({ name: 'ApiError', message: 'Forbidden', statusCode: 403 });
  });

  it('patches and removes affected device caches after successful mutations', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(homeQueryKeys.devices(), [existing]);
    applyUpdatedDeviceToCaches(queryClient, { ...existing, name: 'Kitchen', roomId: 'room-2' });
    expect(queryClient.getQueryData<Device[]>(homeQueryKeys.devices())).toEqual([expect.objectContaining({ name: 'Kitchen', roomId: 'room-2' })]);
    removeDeviceFromCaches(queryClient, existing.id);
    expect(queryClient.getQueryData<Device[]>(homeQueryKeys.devices())).toEqual([]);
    queryClient.clear();
  });
});
