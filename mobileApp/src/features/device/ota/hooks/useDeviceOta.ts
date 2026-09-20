import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deviceOtaApi } from '../api/deviceOtaApi';
import type { OtaRealtimeProgress } from '../models/otaProgressModels';

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

export const deviceOtaQueryKeys = {
  catalog: (deviceId: string) => ['device', normaliseDeviceId(deviceId), 'ota'] as const,
  progress: (deviceId: string) => ['device', normaliseDeviceId(deviceId), 'ota', 'progress'] as const,
};

export function deviceOtaQueryOptions(deviceId: string) {
  const normalizedId = normaliseDeviceId(deviceId);
  return queryOptions({
    queryKey: deviceOtaQueryKeys.catalog(normalizedId),
    queryFn: () => deviceOtaApi.getCatalog(normalizedId),
    enabled: normalizedId.length > 0,
  });
}

export function invalidateDeviceOtaCatalog(
  queryClient: ReturnType<typeof useQueryClient>,
  deviceId: string,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: deviceOtaQueryKeys.catalog(deviceId) });
}

export function otaRequestMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  deviceId: string,
) {
  return {
    mutationFn: (version: string) => deviceOtaApi.requestOta(deviceId, version),
    onMutate: (version: string) => {
      queryClient.setQueryData<OtaRealtimeProgress>(deviceOtaQueryKeys.progress(deviceId), {
        eventId: null,
        state: 'requesting',
        progress: null,
        occurredAt: new Date(),
        errorMessage: null,
        requestedVersion: version,
      });
    },
    onSuccess: (request?: Awaited<ReturnType<typeof deviceOtaApi.requestOta>>) => {
      if (request !== undefined) {
        queryClient.setQueryData<OtaRealtimeProgress>(deviceOtaQueryKeys.progress(deviceId), {
          eventId: null,
          state: 'accepted',
          progress: null,
          occurredAt: new Date(),
          errorMessage: null,
          requestedVersion: request.version,
        });
      }
      return invalidateDeviceOtaCatalog(queryClient, deviceId).catch(() => undefined);
    },
    onError: (error: unknown, version: string) => {
      queryClient.setQueryData<OtaRealtimeProgress>(deviceOtaQueryKeys.progress(deviceId), {
        eventId: null,
        state: 'failed',
        progress: null,
        occurredAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unable to request firmware update.',
        requestedVersion: version,
      });
    },
  };
}

export function useDeviceOtaQuery(deviceId: string) {
  return useQuery(deviceOtaQueryOptions(deviceId));
}

/** Subscribes to TanStack Query state populated by the realtime event router. */
export function useOtaRealtimeProgressQuery(deviceId: string) {
  return useQuery<OtaRealtimeProgress | null>({
    queryKey: deviceOtaQueryKeys.progress(deviceId),
    queryFn: async () => null,
    enabled: false,
    initialData: null,
  });
}

export function useOtaRequestMutation(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation(otaRequestMutationOptions(queryClient, deviceId));
}
