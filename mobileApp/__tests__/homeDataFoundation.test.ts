import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { homeApi } from '../src/features/home/api/homeApi';
import { memberApi } from '../src/features/home/member/api/memberApi';
import { roomApi } from '../src/features/home/room/api/roomApi';
import {
  devicesQueryOptions,
  invalidateActiveHomeQueries,
  homeQueryKeys,
  roomsQueryOptions,
} from '../src/features/home/hooks/useHomeQueries';
import { ApiError, httpClient } from '../src/api/httpClient';

const originalAdapter = httpClient.defaults.adapter;

function success(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function failure(
  config: InternalAxiosRequestConfig,
  status: number,
  data = { error: 'Request failed' },
): Promise<never> {
  const response = success(config, data, status);
  return Promise.reject(new AxiosError('Request failed', undefined, config, undefined, response));
}

const deviceResponse = {
  id: 'device-1',
  name: 'Living Room Purifier',
  home_id: 'home-1',
  room_id: 'room-1',
  online: true,
  last_seen: '2026-09-19T02:00:00.000Z',
  firmware_ver: '1.2.3',
  created_at: '2026-09-18T02:00:00.000Z',
  mode: 'auto',
  relay_1: true,
  relay_2: false,
  relay_3: null,
};

beforeEach(() => {
  httpClient.defaults.adapter = async config => {
    switch (config.url) {
      case '/devices':
        return success(config, [deviceResponse]);
      case '/homes/home-1/rooms':
        if (config.method === 'post') return success(config, { id: 'room-2', home_id: 'home-1', name: 'Bedroom', icon: null }, 201);
        return success(config, [{ id: 'room-1', home_id: 'home-1', name: 'Living Room', icon: 'sofa' }]);
      case '/rooms/room-1':
        if (config.method === 'put') return success(config, { id: 'room-1', home_id: 'home-1', name: 'Renamed room', icon: 'sofa' });
        if (config.method === 'delete') return success(config, undefined, 204);
        throw new Error(`Unexpected request: ${config.url}`);
      case '/homes/home-1/invite':
        if (config.method === 'post') return success(config, { success: true });
        throw new Error(`Unexpected request: ${config.url}`);
      case '/homes':
        if (config.method === 'post') return success(config, { id: 'home-2', name: 'Studio', timezone: 'Asia/Ho_Chi_Minh' }, 201);
        return success(config, [{
          id: 'home-1',
          name: 'Primary Home',
          address: '1 Smart Air Way',
          owner_id: 'user-1',
          timezone: 'Asia/Ho_Chi_Minh',
        }]);
      case '/homes/home-1':
        if (config.method === 'put') return success(config, { id: 'home-1', name: 'Renamed Home', timezone: 'Asia/Ho_Chi_Minh' });
        if (config.method === 'delete') return success(config, undefined, 204);
        throw new Error(`Unexpected request: ${config.url}`);
      default:
        throw new Error(`Unexpected request: ${config.url}`);
    }
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

describe('Home API contract mapping', () => {
  it('maps the Flutter home, room, and device transport fields to typed client models', async () => {
    const [devices, homes, rooms] = await Promise.all([
      homeApi.listDevices(),
      homeApi.listHomes(),
      homeApi.listRooms('home-1'),
    ]);

    expect(devices).toEqual([expect.objectContaining({
      id: 'device-1',
      homeId: 'home-1',
      roomId: 'room-1',
      firmwareVer: '1.2.3',
      relay1: true,
      relay2: false,
      relay3: null,
    })]);
    expect(devices[0]?.lastSeen).toEqual(new Date('2026-09-19T02:00:00.000Z'));
    expect(homes).toEqual([{ id: 'home-1', name: 'Primary Home', address: '1 Smart Air Way', ownerId: 'user-1', timezone: 'Asia/Ho_Chi_Minh' }]);
    expect(rooms).toEqual([{ id: 'room-1', homeId: 'home-1', name: 'Living Room', icon: 'sofa' }]);
  });

  it('normalizes backend and malformed-response errors for query consumers', async () => {
    httpClient.defaults.adapter = async config => (
      config.url === '/devices'
        ? failure(config, 503, { error: 'Device service unavailable' })
        : success(config, {})
    );
    await expect(homeApi.listDevices()).rejects.toMatchObject<ApiError>({
      name: 'ApiError',
      message: 'Device service unavailable',
      statusCode: 503,
    });

    httpClient.defaults.adapter = async config => success(config, { devices: [] });
    await expect(homeApi.listDevices()).rejects.toMatchObject<ApiError>({
      name: 'ApiError',
      message: 'Unexpected server response',
      statusCode: 0,
    });
  });

  it('uses the existing create, update, and delete home contracts with typed responses', async () => {
    await expect(homeApi.createHome({ name: 'Studio' })).resolves.toEqual(expect.objectContaining({ id: 'home-2', name: 'Studio' }));
    await expect(homeApi.updateHome('home-1', { name: 'Renamed Home' })).resolves.toEqual(expect.objectContaining({ id: 'home-1', name: 'Renamed Home' }));
    await expect(homeApi.deleteHome('home-1')).resolves.toBeUndefined();
  });

  it('uses only the Flutter room and invite-member mutation contracts', async () => {
    await expect(roomApi.create('home-1', { name: 'Bedroom' })).resolves.toEqual(expect.objectContaining({ id: 'room-2', homeId: 'home-1', name: 'Bedroom' }));
    await expect(roomApi.update('room-1', { name: 'Renamed room' })).resolves.toEqual(expect.objectContaining({ id: 'room-1', name: 'Renamed room' }));
    await expect(roomApi.remove('room-1')).resolves.toBeUndefined();
    await expect(memberApi.invite('home-1', { email: 'person@example.com' })).resolves.toBeUndefined();
  });

  it('sends exact existing room and household request payloads', async () => {
    const post = jest.spyOn(httpClient, 'post');
    const put = jest.spyOn(httpClient, 'put');
    await roomApi.create('home-1', { name: 'Bedroom' });
    await roomApi.update('room-1', { name: 'Renamed room' });
    await memberApi.invite('home-1', { email: 'person@example.com' });
    expect(post).toHaveBeenCalledWith('/homes/home-1/rooms', { name: 'Bedroom' });
    expect(put).toHaveBeenCalledWith('/rooms/room-1', { name: 'Renamed room' });
    expect(post).toHaveBeenCalledWith('/homes/home-1/invite', { email: 'person@example.com', role: 'member' });
    post.mockRestore();
    put.mockRestore();
  });
});

describe('Home TanStack Query configuration', () => {
  it('loads and caches the device list through the query configuration used by the hook', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(queryClient, devicesQueryOptions());
    const unsubscribe = observer.subscribe(() => undefined);

    await observer.refetch();

    expect(queryClient.getQueryData(homeQueryKeys.devices())).toEqual([expect.objectContaining({ id: 'device-1' })]);
    unsubscribe();
    queryClient.clear();
  });

  it('uses isolated room keys and does not enable a room query until a home is selected', () => {
    expect(homeQueryKeys.rooms('home-1')).toEqual(['rooms', 'home-1']);
    expect(homeQueryKeys.rooms('home-2')).toEqual(['rooms', 'home-2']);
    expect(roomsQueryOptions('').enabled).toBe(false);
    expect(roomsQueryOptions('home-1').enabled).toBe(true);
  });

  it('invalidates only device and previous/current selected-home room caches on a home switch', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await invalidateActiveHomeQueries(queryClient, 'home-1', 'home-2');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeQueryKeys.devices() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeQueryKeys.rooms('home-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeQueryKeys.rooms('home-2') });
    expect(invalidate).toHaveBeenCalledTimes(3);
    queryClient.clear();
  });
});
