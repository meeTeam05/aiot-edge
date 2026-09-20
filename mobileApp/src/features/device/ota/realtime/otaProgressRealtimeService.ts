import type { QueryClient } from '@tanstack/react-query';

import { deviceDashboardQueryKeys } from '../../hooks/useDeviceDashboardQueries';
import { homeQueryKeys } from '../../../home/hooks/useHomeQueries';
import { deviceOtaQueryKeys } from '../hooks/useDeviceOta';
import type { OtaRealtimeProgress } from '../models/otaProgressModels';
import { isTerminalOtaProgress, otaProgressFromEvent } from './otaProgressMapper';
import type { OtaProgressEvent } from '../../../../services/realtime/realtimeEvents';

/**
 * Stores the latest OTA frame per device. SSE event IDs make replayed frames
 * idempotent, so a duplicate never updates cache or triggers another refresh.
 */
export function applyOtaProgressEvent(queryClient: QueryClient, event: OtaProgressEvent): boolean {
  const progress = otaProgressFromEvent(event);
  if (progress === null) return false;

  const key = deviceOtaQueryKeys.progress(event.deviceId);
  const current = queryClient.getQueryData<OtaRealtimeProgress | null>(key);
  if (current?.eventId === progress.eventId || (current !== null && current !== undefined && event.occurredAt < current.occurredAt)) return false;

  queryClient.setQueryData<OtaRealtimeProgress>(key, { ...progress, requestedVersion: current?.requestedVersion ?? null });
  if (isTerminalOtaProgress(progress)) refreshTerminalOtaCaches(queryClient, event.deviceId);
  return true;
}

function refreshTerminalOtaCaches(queryClient: QueryClient, deviceId: string): void {
  queryClient.invalidateQueries({ queryKey: deviceOtaQueryKeys.catalog(deviceId) }).catch(() => undefined);
  queryClient.invalidateQueries({ queryKey: deviceDashboardQueryKeys.device(deviceId) }).catch(() => undefined);
  queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
}
