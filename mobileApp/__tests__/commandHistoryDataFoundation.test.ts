import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { httpClient } from '../src/api/httpClient';
import { commandHistoryFirstPageQueryOptions } from '../src/features/device/commands/hooks/useCommandHistory';
import {
  commandStatusPresentation,
  filterCommandHistory,
  newestFirst,
} from '../src/features/device/commands/models/commandHistoryModels';
import { formatCommandPayload, formatCommandTimestamp } from '../src/features/device/commands/presentation/commandHistoryPresentation';

const originalAdapter = httpClient.defaults.adapter;

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

beforeEach(() => {
  httpClient.defaults.adapter = async config => {
    if (config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/commands') {
      return response(config, [{
        id: 'command-1', payload: { type: 'relay_set', relay: 1, state: true }, status: 'done',
        created_at: '2026-09-19T02:00:00.000Z', executed_at: null,
      }]);
    }
    throw new AxiosError('Unexpected request', undefined, config);
  };
});

afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

const commands = [
  { id: 'pending', payload: {}, status: 'pending' as const, createdAt: new Date('2026-09-19T02:00:00.000Z'), executedAt: null, errorMessage: null },
  { id: 'done', payload: {}, status: 'done' as const, createdAt: new Date('2026-09-19T03:00:00.000Z'), executedAt: null, errorMessage: null },
  { id: 'timeout', payload: {}, status: 'timeout' as const, createdAt: new Date('2026-09-19T01:00:00.000Z'), executedAt: null, errorMessage: null },
  { id: 'sent', payload: {}, status: 'sent' as const, createdAt: new Date('2026-09-19T04:00:00.000Z'), executedAt: null, errorMessage: null },
  { id: 'error', payload: {}, status: 'error' as const, createdAt: new Date('2026-09-19T00:00:00.000Z'), executedAt: null, errorMessage: null },
];

describe('Command History data foundation', () => {
  it('reuses the authenticated first-page command response and dashboard/SSE cache key', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(queryClient, commandHistoryFirstPageQueryOptions('AA:BB:CC:DD:EE:FF'));
    const unsubscribe = observer.subscribe(() => undefined);
    const result = await observer.refetch();

    expect(result.data).toEqual([expect.objectContaining({
      id: 'command-1', createdAt: new Date('2026-09-19T02:00:00.000Z'), errorMessage: null, status: 'done',
    })]);
    expect(queryClient.getQueryData(['device', 'aa:bb:cc:dd:ee:ff', 'commands', { limit: 50, offset: 0 }])).toEqual(result.data);
    unsubscribe();
    queryClient.clear();
  });

  it('preserves Flutter filters, labels, and newest-first ordering', () => {
    expect(filterCommandHistory(commands, 'all').map(command => command.id)).toEqual(['pending', 'done', 'timeout', 'sent', 'error']);
    expect(filterCommandHistory(commands, 'done').map(command => command.id)).toEqual(['done']);
    expect(filterCommandHistory(commands, 'failed').map(command => command.id)).toEqual(['timeout', 'error']);
    expect(filterCommandHistory(commands, 'pending').map(command => command.id)).toEqual(['pending', 'sent']);
    expect(newestFirst(commands).map(command => command.id)).toEqual(['sent', 'done', 'pending', 'timeout', 'error']);
    expect(commandStatusPresentation('done')).toEqual({ label: 'Done', tone: 'online' });
    expect(commandStatusPresentation('timeout')).toEqual({ label: 'Timeout', tone: 'warn' });
  });

  it('formats Flutter-equivalent relative timestamps and future payload-sheet lines', () => {
    const now = new Date(2026, 8, 19, 15, 5, 0);
    expect(formatCommandTimestamp(new Date(2026, 8, 19, 15, 4, 32), now)).toBe('28s ago');
    expect(formatCommandTimestamp(new Date(2026, 8, 19, 14, 58, 0), now)).toBe('7m ago');
    expect(formatCommandTimestamp(new Date(2026, 8, 19, 12, 5, 0), now)).toBe('3h ago');
    expect(formatCommandTimestamp(new Date(2026, 8, 18, 9, 4, 0), now)).toBe('18/9 9:04');
    expect(formatCommandPayload({ type: 'relay_set', relay: 1, state: true })).toBe('type: relay_set\nrelay: 1\nstate: true');
  });
});
