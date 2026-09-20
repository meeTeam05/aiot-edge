import type { NotificationItem } from '../models/notificationModels';

/** Flutter prepends notification events, suppressing duplicate SSE event IDs. */
export function prependNotificationIfNew(current: NotificationItem[], item: NotificationItem): NotificationItem[] {
  return current.some(existing => existing.id === item.id) ? current : [item, ...current];
}
