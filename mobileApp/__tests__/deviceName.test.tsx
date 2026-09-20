import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import renderer, { act } from 'react-test-renderer';

import { ApiError, httpClient } from '../src/api/httpClient';
import { DeviceNameScreen } from '../src/features/devices/name/DeviceNameScreen';
import { deviceNameApi } from '../src/features/devices/name/deviceNameApi';
import { renameDevice } from '../src/features/devices/name/deviceNameService';
import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import { deviceDashboardQueryKeys } from '../src/features/device/hooks/useDeviceDashboardQueries';
import type { Device } from '../src/features/home/models/homeModels';

const originalAdapter = httpClient.defaults.adapter;
const device: Device = { id: 'aa:bb:cc:dd:ee:ff', name: 'Kitchen Air', homeId: 'home-1', roomId: null, online: true, lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null };

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function render(saveDeviceName: (deviceId: string, name: string) => Promise<Device>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(homeQueryKeys.devices(), [{ ...device, name: 'Smart Air DDEEFF' }]);
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<QueryClientProvider client={queryClient}><DeviceNameScreen navigation={navigation as never} route={{ params: { deviceId: device.id } } as never} saveDeviceName={saveDeviceName} /></QueryClientProvider>); });
  return { navigation, queryClient, tree };
}

afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe('device naming', () => {
  it('trims a valid name and uses Flutter’s existing PUT device contract', async () => {
    let url = '';
    let body: unknown;
    httpClient.defaults.adapter = async config => {
      url = config.url ?? '';
      body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      return response(config, { id: device.id, name: 'Kitchen Air', home_id: 'home-1', room_id: null, online: true });
    };
    await expect(renameDevice(' AA:BB:CC:DD:EE:FF ', '  Kitchen Air  ')).resolves.toMatchObject({ name: 'Kitchen Air' });
    expect(url).toBe('/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff');
    expect(body).toEqual({ name: 'Kitchen Air' });
  });

  it.each(['', '   ', '\n\t'])('rejects an empty or whitespace-only name before the API call: %j', async value => {
    const api = { update: jest.fn() };
    await expect(renameDevice(device.id, value, api)).rejects.toMatchObject({ name: 'DeviceNameValidationError', message: 'Enter a device name' });
    expect(api.update).not.toHaveBeenCalled();
  });

  it('maps API failure through the shared client', async () => {
    httpClient.defaults.adapter = async config => Promise.reject(new AxiosError('Unavailable', undefined, config, undefined, response(config, { error: 'Service unavailable' }, 503)));
    await expect(deviceNameApi.update(device.id, 'Kitchen Air')).rejects.toMatchObject({ name: 'ApiError', statusCode: 503, message: 'Service unavailable' } satisfies Partial<ApiError>);
  });

  it('updates device caches and continues to room assignment after a successful save', async () => {
    const save = jest.fn(async () => device);
    const { navigation, queryClient, tree } = render(save);
    act(() => { tree.root.findByProps({ testID: 'device-name-input' }).props.onChangeText('  Kitchen Air  '); });
    await act(async () => { tree.root.findByProps({ testID: 'device-name-save' }).props.onPress(); });
    expect(save).toHaveBeenCalledWith(device.id, '  Kitchen Air  ');
    expect(queryClient.getQueryData<Device[]>(homeQueryKeys.devices())).toEqual([device]);
    expect(queryClient.getQueryData<Device>(deviceDashboardQueryKeys.device(device.id))).toEqual(device);
    expect(navigation.replace).toHaveBeenCalledWith('RoomAssignment', { deviceId: device.id, homeId: device.homeId });
  });

  it('shows an API failure and retries the save', async () => {
    const save = jest.fn().mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce(device);
    const { navigation, tree } = render(save);
    await act(async () => { tree.root.findByProps({ testID: 'device-name-save' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'device-name-error' })).toBeTruthy();
    await act(async () => { tree.root.findByProps({ testID: 'device-name-save' }).props.onPress(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('RoomAssignment', { deviceId: device.id, homeId: device.homeId });
  });
});
