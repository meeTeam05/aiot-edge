import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import renderer, { act } from 'react-test-renderer';

jest.mock('../src/features/home/hooks/useHomeQueries', () => {
  const actual = jest.requireActual('../src/features/home/hooks/useHomeQueries');
  return { ...actual, useRoomsQuery: jest.fn() };
});

import { httpClient } from '../src/api/httpClient';
import { deviceDashboardQueryKeys } from '../src/features/device/hooks/useDeviceDashboardQueries';
import { RoomAssignmentScreen } from '../src/features/devices/room/RoomAssignmentScreen';
import { roomApi } from '../src/features/devices/room/roomApi';
import { assignDeviceRoom } from '../src/features/devices/room/roomService';
import { homeQueryKeys, useRoomsQuery } from '../src/features/home/hooks/useHomeQueries';
import type { Device, Room } from '../src/features/home/models/homeModels';

const mockRoomsQuery = useRoomsQuery as jest.MockedFunction<typeof useRoomsQuery>;
const originalAdapter = httpClient.defaults.adapter;
const rooms: Room[] = [{ id: 'room-1', homeId: 'home-1', name: 'Living Room', icon: null }, { id: 'room-2', homeId: 'home-1', name: 'Kitchen', icon: null }];
const device: Device = { id: 'aa:bb:cc:dd:ee:ff', name: 'Kitchen Air', homeId: 'home-1', roomId: 'room-2', online: true, lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null };

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function queryResult(overrides: Record<string, unknown> = {}) {
  return { data: rooms, error: null, isLoading: false, refetch: jest.fn().mockResolvedValue(undefined), ...overrides } as never;
}

function render(saveRoom: (deviceId: string, roomId: string | null) => Promise<Device> = async () => device) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(homeQueryKeys.devices(), [{ ...device, roomId: null }]);
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<QueryClientProvider client={queryClient}><RoomAssignmentScreen navigation={navigation as never} route={{ params: { deviceId: device.id, homeId: device.homeId } } as never} saveRoom={saveRoom} /></QueryClientProvider>); });
  return { navigation, queryClient, tree };
}

beforeEach(() => { mockRoomsQuery.mockReturnValue(queryResult()); });
afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe('room assignment', () => {
  it('renders a room-loading state', () => {
    mockRoomsQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));
    expect(render().tree.root.findByProps({ testID: 'room-assignment-loading' })).toBeTruthy();
  });

  it('renders the empty-room state and reload action', () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    const result = queryResult({ data: [], refetch });
    mockRoomsQuery.mockReturnValue(result);
    const { tree } = render();
    expect(tree.root.findByProps({ testID: 'room-assignment-empty' })).toBeTruthy();
    act(() => { tree.root.findByProps({ testID: 'room-empty-retry' }).props.onPress(); });
    expect(refetch).toHaveBeenCalled();
  });

  it('requires a selected room before saving', async () => {
    const save = jest.fn(async () => device);
    const { tree } = render(save);
    await act(async () => { tree.root.findByProps({ testID: 'room-assignment-save' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'room-assignment-save-error' })).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('selects a room, updates caches, and opens provisioning completion after success', async () => {
    const save = jest.fn(async () => device);
    const { navigation, queryClient, tree } = render(save);
    act(() => { tree.root.findByProps({ testID: 'room-option-room-2' }).props.onPress(); });
    await act(async () => { tree.root.findByProps({ testID: 'room-assignment-save' }).props.onPress(); });
    expect(save).toHaveBeenCalledWith(device.id, 'room-2');
    expect(queryClient.getQueryData<Device[]>(homeQueryKeys.devices())).toEqual([device]);
    expect(queryClient.getQueryData<Device>(deviceDashboardQueryKeys.device(device.id))).toEqual(device);
    expect(navigation.replace).toHaveBeenCalledWith('ProvisionComplete', { deviceId: device.id, deviceName: device.name, homeId: device.homeId, roomName: 'Kitchen' });
  });

  it('sends the exact approved PUT payload and maps a successful response', async () => {
    let url = '';
    let body: unknown;
    httpClient.defaults.adapter = async config => {
      url = config.url ?? '';
      body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      return response(config, { id: device.id, name: device.name, home_id: 'home-1', room_id: 'room-2', online: true });
    };
    await expect(assignDeviceRoom(' AA:BB:CC:DD:EE:FF ', ' room-2 ')).resolves.toMatchObject({ roomId: 'room-2' });
    expect(url).toBe('/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff');
    expect(body).toEqual({ room_id: 'room-2' });
  });

  it('surfaces API failures and retries the selected assignment', async () => {
    const save = jest.fn().mockRejectedValueOnce(new Error('Room does not belong to device home')).mockResolvedValueOnce(device);
    const { navigation, tree } = render(save);
    act(() => { tree.root.findByProps({ testID: 'room-option-room-2' }).props.onPress(); });
    await act(async () => { tree.root.findByProps({ testID: 'room-assignment-save' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'room-assignment-save-error' })).toBeTruthy();
    await act(async () => { tree.root.findByProps({ testID: 'room-assignment-save' }).props.onPress(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('ProvisionComplete', { deviceId: device.id, deviceName: device.name, homeId: device.homeId, roomName: 'Kitchen' });
  });

  it('maps backend API failures through the shared client', async () => {
    httpClient.defaults.adapter = async config => Promise.reject(new AxiosError('Forbidden', undefined, config, undefined, response(config, { error: 'Forbidden' }, 403)));
    await expect(roomApi.assign(device.id, 'room-2')).rejects.toMatchObject({ name: 'ApiError', statusCode: 403, message: 'Forbidden' });
  });
});
