import { queryOptions, useQuery } from '@tanstack/react-query';

import { notificationsApi } from '../api/notificationsApi';
import type { ListNotificationsParams } from '../models/notificationModels';

const defaultLimit = 50;

export const notificationQueryKeys = {
  list: (params: ListNotificationsParams = {}) => [
    'notifications',
    { beforeId: params.beforeId ?? null, limit: params.limit ?? defaultLimit },
  ] as const,
};

export function notificationsQueryOptions(params: ListNotificationsParams = {}) {
  return queryOptions({
    queryKey: notificationQueryKeys.list(params),
    queryFn: () => notificationsApi.list(params),
  });
}

/** First-page query only; Flutter currently exposes no pagination UI. */
export function useNotificationsQuery(params: ListNotificationsParams = {}) {
  return useQuery(notificationsQueryOptions(params));
}
