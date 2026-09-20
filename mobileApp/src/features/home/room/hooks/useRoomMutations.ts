import { useMutation, useQueryClient } from '@tanstack/react-query';

import { homeQueryKeys } from '../../hooks/useHomeQueries';
import type { Room } from '../../models/homeModels';
import { roomService } from '../services/roomService';
import type { CreateRoomRequest, UpdateRoomRequest } from '../models/roomModels';

export function addRoomToCache(queryClient: ReturnType<typeof useQueryClient>, homeId: string, room: Room) {
  queryClient.setQueryData<Room[]>(homeQueryKeys.rooms(homeId), current => [...(current ?? []), room]);
}

export function updateRoomInCache(queryClient: ReturnType<typeof useQueryClient>, homeId: string, room: Room) {
  queryClient.setQueryData<Room[]>(homeQueryKeys.rooms(homeId), current => current?.map(item => item.id === room.id ? room : item));
}

export function removeRoomFromCache(queryClient: ReturnType<typeof useQueryClient>, homeId: string, roomId: string) {
  queryClient.setQueryData<Room[]>(homeQueryKeys.rooms(homeId), current => current?.filter(item => item.id !== roomId));
}

export function useRoomMutations(homeId: string) {
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (request: CreateRoomRequest) => roomService.create(homeId, request),
    onSuccess: room => {
      addRoomToCache(queryClient, homeId, room);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.homes() }).catch(() => undefined);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ roomId, request }: { roomId: string; request: UpdateRoomRequest }) => roomService.update(roomId, request),
    onSuccess: room => {
      updateRoomInCache(queryClient, homeId, room);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (roomId: string) => roomService.remove(roomId),
    onSuccess: (_unused, roomId) => {
      removeRoomFromCache(queryClient, homeId, roomId);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
    },
  });
  return {
    createRoom: (request: CreateRoomRequest) => createMutation.mutateAsync(request),
    deleteRoom: (roomId: string) => deleteMutation.mutateAsync(roomId),
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdating: updateMutation.isPending,
    updateRoom: (roomId: string, request: UpdateRoomRequest) => updateMutation.mutateAsync({ roomId, request }),
  };
}
