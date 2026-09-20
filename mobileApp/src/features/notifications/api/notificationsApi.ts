import { ApiError, httpClient } from '../../../api/httpClient';
import {
  NotificationDataMappingError,
  notificationItemsFromDto,
  type ListNotificationsParams,
  type NotificationItem,
} from '../models/notificationModels';

/** Read-only REST boundary for Flutter's NotificationService.listNotifications. */
export const notificationsApi = {
  async list(params: ListNotificationsParams = {}): Promise<NotificationItem[]> {
    const response = await httpClient.get<unknown>('/notifications', {
      params: {
        limit: params.limit ?? 50,
        ...(params.beforeId ? { before_id: params.beforeId } : {}),
      },
    });
    try {
      return notificationItemsFromDto(response.data);
    } catch (error) {
      if (error instanceof NotificationDataMappingError) throw new ApiError(error.message, 0);
      throw error;
    }
  },
};
