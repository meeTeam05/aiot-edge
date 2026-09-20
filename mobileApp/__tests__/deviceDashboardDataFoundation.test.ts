import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { ApiError, httpClient } from '../src/api/httpClient';
import { deviceDashboardApi } from '../src/features/device/api/deviceDashboardApi';
import {
  commandHistoryQueryOptions,
  deviceQueryOptions,
  deviceDashboardQueryKeys,
  shadowQueryOptions,
  telemetryQueryOptions,
} from '../src/features/device/hooks/useDeviceDashboardQueries';

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
  id: 'AA:BB:CC:DD:EE:FF',
  name: 'Living Room Purifier',
  home_id: 'home-1',
  room_id: null,
  online: true,
  last_seen: '2026-09-19T02:00:00.000Z',
  firmware_ver: null,
  mode: null,
  relay_1: null,
  relay_2: false,
  relay_3: true,
  created_at: '2026-09-18T02:00:00.000Z',
};

beforeEach(() => {
  httpClient.defaults.adapter = async config => {
    switch (config.url) {
      case '/devices':
        return success(config, [deviceResponse]);
      case '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/shadow':
        return success(config, {
          reported: { mode: 'on', relay_1: true, temperature: 23.5 },
          desired: { mode: 'on' },
          updatedAt: '2026-09-19T02:01:00.000Z',
        });
      case '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/telemetry':
        return success(config, [
          { ts: '2026-09-19T02:01:00.000Z', temperature: 24, humidity: 55.5, co_ppm: null, no2_ppm: 0.2, mode: 'on' },
          { ts: 'not-a-date', temperature: 99 },
        ]);
      case '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/commands':
        return success(config, [{
          id: 'command-1',
          payload: { type: 'relay_set', relay: 1, state: true },
          status: 'done',
          created_at: '2026-09-19T02:00:00.000Z',
          executed_at: null,
        }]);
      default:
        throw new Error(`Unexpected request: ${config.url}`);
    }
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

describe('Device Dashboard API mapping', () => {
  it('maps nullable device, shadow, command, and telemetry fields using Flutter-compatible timestamp handling', async () => {
    const deviceId = 'AA:BB:CC:DD:EE:FF';
    const [device, shadow, telemetry, commands] = await Promise.all([
      deviceDashboardApi.getDevice(deviceId),
      deviceDashboardApi.getShadow(deviceId),
      deviceDashboardApi.listTelemetry(deviceId),
      deviceDashboardApi.listCommands(deviceId),
    ]);

    expect(device).toEqual(expect.objectContaining({
      id: deviceResponse.id,
      roomId: null,
      firmwareVer: null,
      mode: null,
      relay1: null,
      relay2: false,
      relay3: true,
    }));
    expect(device?.lastSeen).toEqual(new Date('2026-09-19T02:00:00.000Z'));
    expect(shadow).toEqual(expect.objectContaining({
      reported: { mode: 'on', relay_1: true, temperature: 23.5 },
      desired: { mode: 'on' },
      updatedAt: new Date('2026-09-19T02:01:00.000Z'),
    }));
    expect(telemetry).toEqual([{ ts: new Date('2026-09-19T02:01:00.000Z'), temperature: 24, humidity: 55.5, coPpm: null, no2Ppm: 0.2, mode: 'on' }]);
    expect(commands).toEqual([{ id: 'command-1', payload: { type: 'relay_set', relay: 1, state: true }, status: 'done', createdAt: new Date('2026-09-19T02:00:00.000Z'), executedAt: null, errorMessage: null }]);
  });

  it('normalizes malformed required responses and backend errors for query consumers', async () => {
    httpClient.defaults.adapter = async config => success(config, { reported: [] });
    await expect(deviceDashboardApi.getShadow('device-1')).rejects.toMatchObject<ApiError>({
      name: 'ApiError', message: 'Unexpected server response', statusCode: 0,
    });

    httpClient.defaults.adapter = async config => failure(config, 503, { error: 'Telemetry unavailable' });
    await expect(deviceDashboardApi.listTelemetry('device-1')).rejects.toMatchObject<ApiError>({
      name: 'ApiError', message: 'Telemetry unavailable', statusCode: 503,
    });
  });
});

describe('Device Dashboard TanStack Query configuration', () => {
  it('caches each read boundary under an isolated, normalized device key', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const telemetryRequest = { limit: 720 };
    const observers = [
      new QueryObserver(queryClient, deviceQueryOptions('AA:BB:CC:DD:EE:FF')),
      new QueryObserver(queryClient, shadowQueryOptions('AA:BB:CC:DD:EE:FF')),
      new QueryObserver(queryClient, telemetryQueryOptions('AA:BB:CC:DD:EE:FF', telemetryRequest)),
      new QueryObserver(queryClient, commandHistoryQueryOptions('AA:BB:CC:DD:EE:FF')),
    ];
    const unsubscribers = observers.map(observer => observer.subscribe(() => undefined));

    await Promise.all(observers.map(observer => observer.refetch()));

    expect(queryClient.getQueryData(deviceDashboardQueryKeys.device('aa:bb:cc:dd:ee:ff'))).toEqual(expect.objectContaining({ id: deviceResponse.id }));
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.shadow('aa:bb:cc:dd:ee:ff'))).toEqual(expect.objectContaining({ reported: expect.any(Object) }));
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.telemetry('aa:bb:cc:dd:ee:ff', telemetryRequest))).toEqual([expect.objectContaining({ temperature: 24 })]);
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.commands('aa:bb:cc:dd:ee:ff'))).toEqual([expect.objectContaining({ id: 'command-1' })]);

    unsubscribers.forEach(unsubscribe => unsubscribe());
    queryClient.clear();
  });
});
