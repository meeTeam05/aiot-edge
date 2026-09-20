import type { QueryClient } from '@tanstack/react-query';

import { homeQueryKeys } from '../../home/hooks/useHomeQueries';
import type { Device } from '../../home/models/homeModels';
import { notificationQueryKeys } from '../hooks/useNotificationsQuery';
import type { NotificationItem } from '../models/notificationModels';
import type { RealtimeEvent } from '../../../services/realtime/realtimeEvents';
import { prependNotificationIfNew } from './notificationDedup';
import { notificationFromRealtimeEvent } from './notificationMapper';

/** Updates only the loaded first-page notification cache, mirroring Flutter's loaded provider state. */
export function applyRealtimeNotification(queryClient: QueryClient, event: RealtimeEvent): boolean {
  const key = notificationQueryKeys.list();
  const current = queryClient.getQueryData<NotificationItem[]>(key);
  if (current === undefined) return false;
  const devices = queryClient.getQueryData<Device[]>(homeQueryKeys.devices()) ?? [];
  const item = notificationFromRealtimeEvent(event, devices);
  if (item === null) return false;
  const next = prependNotificationIfNew(current, item);
  if (next === current) return false;
  queryClient.setQueryData<NotificationItem[]>(key, next);
  return true;
}
