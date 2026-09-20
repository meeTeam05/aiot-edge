import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { ApiError, httpClient } from '../src/api/httpClient';
import { notificationsApi } from '../src/features/notifications/api/notificationsApi';
import { notificationQueryKeys, notificationsQueryOptions } from '../src/features/notifications/hooks/useNotificationsQuery';
import {
  notificationItemFromDto,
  notificationSeverityFromDto,
  notificationTimestampFromDto,
} from '../src/features/notifications/models/notificationModels';

const originalAdapter = httpClient.defaults.adapter;

function success(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function failure(config: InternalAxiosRequestConfig, status: number, data = { error: 'Request failed' }): Promise<never> {
  const response = success(config, data, status);
  return Promise.reject(new AxiosError('Request failed', undefined, config, undefined, response));
}

const itemDto = {
  id: '42',
  type: 'command.done',
  device_id: 'device-1',
  device_name: 'Living Room Air',
  title: 'Relay 1 turned on',
  body: 'Command completed successfully.',
  severity: 'success',
  occurred_at: '2026-05-24T13:55:00.000Z',
  payload: { command_id: 'cmd-1' },
};

beforeEach(() => {
  httpClient.defaults.adapter = async config => {
    if (config.url === '/notifications') return success(config, [itemDto]);
    throw new Error(`Unexpected request: ${config.url}`);
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

describe('Notification transport mapping', () => {
  it('maps the backend and Flutter notification fields into the typed domain model', async () => {
    await expect(notificationsApi.list({ limit: 20, beforeId: '41' })).resolves.toEqual([expect.objectContaining({
      id: '42', type: 'command.done', deviceId: 'device-1', deviceName: 'Living Room Air', title: 'Relay 1 turned on', severity: 'success', payload: { command_id: 'cmd-1' },
    })]);

    const item = notificationItemFromDto(itemDto);
    expect(item.occurredAt).toEqual(new Date('2026-05-24T13:55:00.000Z'));
  });

  it('normalizes known severities and invalid/missing timestamps like Flutter', () => {
    expect(notificationSeverityFromDto('warning')).toBe('warning');
    expect(notificationSeverityFromDto('unexpected')).toBe('info');
    expect(notificationTimestampFromDto('not-a-date')).toEqual(new Date(0));
    expect(notificationTimestampFromDto(undefined)).toEqual(new Date(0));
  });

  it('normalizes malformed top-level responses and backend errors for query consumers', async () => {
    httpClient.defaults.adapter = async config => success(config, { notifications: [] });
    await expect(notificationsApi.list()).rejects.toMatchObject<ApiError>({ name: 'ApiError', message: 'Unexpected server response', statusCode: 0 });

    httpClient.defaults.adapter = async config => failure(config, 503, { error: 'Notification service unavailable' });
    await expect(notificationsApi.list()).rejects.toMatchObject<ApiError>({ name: 'ApiError', message: 'Notification service unavailable', statusCode: 503 });
  });
});

describe('Notifications TanStack Query configuration', () => {
  it('uses an isolated cursor-aware key and caches the query result', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = notificationsQueryOptions({ limit: 20, beforeId: '41' });
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => undefined);

    await observer.refetch();

    expect(notificationQueryKeys.list({ limit: 20, beforeId: '41' })).toEqual(['notifications', { beforeId: '41', limit: 20 }]);
    expect(queryClient.getQueryData(notificationQueryKeys.list({ limit: 20, beforeId: '41' }))).toEqual([expect.objectContaining({ id: '42' })]);
    unsubscribe();
    queryClient.clear();
  });
});
