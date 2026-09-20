import { useQuery } from '@tanstack/react-query';

import { commandHistoryQueryOptions } from '../../hooks/useDeviceDashboardQueries';
import { newestFirst } from '../models/commandHistoryModels';

/**
 * Deliberately reuses the dashboard's default (limit 50, offset 0) cache key.
 * The application-level SSE router therefore updates this query in place.
 */
export function commandHistoryFirstPageQueryOptions(deviceId: string) {
  return commandHistoryQueryOptions(deviceId, { limit: 50, offset: 0 });
}

export function useCommandHistoryQuery(deviceId: string) {
  const query = useQuery(commandHistoryFirstPageQueryOptions(deviceId));
  return {
    ...query,
    commands: newestFirst(query.data ?? []),
    refresh: query.refetch,
  };
}
