import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '../../../state/sessionStore';
import type { CreateHomeRequest, Home, UpdateHomeRequest } from '../models/homeModels';
import { homeDataService } from '../services/homeDataService';
import { homeQueryKeys } from './useHomeQueries';

export function addHomeToCache(queryClient: ReturnType<typeof useQueryClient>, home: Home): void {
  queryClient.setQueryData<Home[]>(homeQueryKeys.homes(), current => {
    const homes = current ?? [];
    return homes.some(item => item.id === home.id) ? homes.map(item => item.id === home.id ? home : item) : [...homes, home];
  });
}

export function updateHomeInCache(queryClient: ReturnType<typeof useQueryClient>, home: Home): void {
  queryClient.setQueryData<Home[]>(homeQueryKeys.homes(), current => current?.map(item => item.id === home.id ? home : item));
}

export function removeHomeFromCache(queryClient: ReturnType<typeof useQueryClient>, homeId: string): Home[] {
  const remaining = (queryClient.getQueryData<Home[]>(homeQueryKeys.homes()) ?? []).filter(home => home.id !== homeId);
  queryClient.setQueryData<Home[]>(homeQueryKeys.homes(), remaining);
  return remaining;
}

/** Keeps server mutations in TanStack Query and active-home choice in session UI state. */
export function useHomeMutations() {
  const queryClient = useQueryClient();
  const activeHomeId = useSessionStore(state => state.activeHomeId);
  const setActiveHomeId = useSessionStore(state => state.setActiveHomeId);
  const createMutation = useMutation({
    mutationFn: (request: CreateHomeRequest) => homeDataService.createHome(request),
    onSuccess: home => {
      addHomeToCache(queryClient, home);
      setActiveHomeId(home.id);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.homes() }).catch(() => undefined);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ homeId, request }: { homeId: string; request: UpdateHomeRequest }) => homeDataService.updateHome(homeId, request),
    onSuccess: home => {
      updateHomeInCache(queryClient, home);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.homes() }).catch(() => undefined);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (homeId: string) => homeDataService.deleteHome(homeId),
    onSuccess: (_unused, homeId) => {
      const remaining = removeHomeFromCache(queryClient, homeId);
      queryClient.removeQueries({ queryKey: homeQueryKeys.rooms(homeId) });
      if (activeHomeId === homeId) setActiveHomeId(remaining[0]?.id ?? null);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.homes() }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
    },
  });

  return {
    createHome: (request: CreateHomeRequest) => createMutation.mutateAsync(request),
    createError: createMutation.error,
    deleteError: deleteMutation.error,
    deleteHome: (homeId: string) => deleteMutation.mutateAsync(homeId),
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    updateHome: (homeId: string, request: UpdateHomeRequest) => updateMutation.mutateAsync({ homeId, request }),
  };
}
