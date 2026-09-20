import { useMutation, useQueryClient } from '@tanstack/react-query';

import { homeQueryKeys, useRoomsQuery } from '../../../home/hooks/useHomeQueries';
import type { Device } from '../../../home/models/homeModels';
import { deviceDashboardQueryKeys, useDeviceQuery } from '../../hooks/useDeviceDashboardQueries';
import { deviceSettingsApi } from '../api/deviceSettingsApi';

function normalizedDeviceId(deviceId: string): string { return deviceId.trim().toLowerCase(); }

export function applyUpdatedDeviceToCaches(queryClient: ReturnType<typeof useQueryClient>, device: Device): void {
  queryClient.setQueryData<Device[]>(homeQueryKeys.devices(), current => current?.map(item => item.id === device.id ? device : item));
  queryClient.setQueryData<Device | null>(deviceDashboardQueryKeys.device(device.id), current => current === null || current === undefined ? current : device);
}

export function removeDeviceFromCaches(queryClient: ReturnType<typeof useQueryClient>, deviceId: string): void {
  const normalizedId = normalizedDeviceId(deviceId);
  queryClient.setQueryData<Device[]>(homeQueryKeys.devices(), current => current?.filter(item => normalizedDeviceId(item.id) !== normalizedId));
  queryClient.removeQueries({ queryKey: ['device', normalizedId] });
}

export function useDeviceSettings(deviceId: string) {
  const queryClient = useQueryClient();
  const deviceQuery = useDeviceQuery(deviceId);
  const roomsQuery = useRoomsQuery(deviceQuery.data?.homeId ?? '');
  const updateMutation = useMutation({
    mutationFn: (request: Parameters<typeof deviceSettingsApi.updateDevice>[1]) => deviceSettingsApi.updateDevice(deviceId, request),
    onSuccess: updated => {
      applyUpdatedDeviceToCaches(queryClient, updated);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: deviceDashboardQueryKeys.device(updated.id) }).catch(() => undefined);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deviceSettingsApi.deleteDevice(deviceId),
    onSuccess: () => {
      removeDeviceFromCaches(queryClient, deviceId);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
    },
  });

  return {
    deleteDevice: () => deleteMutation.mutateAsync(),
    deleteError: deleteMutation.error,
    device: deviceQuery.data,
    deviceError: deviceQuery.error,
    isDeleting: deleteMutation.isPending,
    isLoading: deviceQuery.isLoading,
    isUpdating: updateMutation.isPending,
    rooms: roomsQuery.data ?? [],
    roomsError: roomsQuery.error,
    roomsLoading: roomsQuery.isLoading,
    updateDevice: updateMutation.mutateAsync,
  };
}
