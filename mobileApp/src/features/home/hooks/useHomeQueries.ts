import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { useSessionStore } from '../../../state/sessionStore';
import { homeDataService } from '../services/homeDataService';

export const homeQueryKeys = {
  devices: () => ['devices'] as const,
  homes: () => ['homes'] as const,
  rooms: (homeId: string) => ['rooms', homeId] as const,
};

export function devicesQueryOptions() {
  return queryOptions({
    queryKey: homeQueryKeys.devices(),
    queryFn: homeDataService.getDevices,
  });
}

export function homesQueryOptions() {
  return queryOptions({
    queryKey: homeQueryKeys.homes(),
    queryFn: homeDataService.getHomes,
  });
}

export function roomsQueryOptions(homeId: string) {
  return queryOptions({
    queryKey: homeQueryKeys.rooms(homeId),
    queryFn: () => homeDataService.getRooms(homeId),
    enabled: homeId.length > 0,
  });
}

export function useDevicesQuery() {
  return useQuery(devicesQueryOptions());
}

/** Filters the existing GET /devices cache; no home-scoped endpoint exists. */
export function useActiveHomeDevicesQuery() {
  const activeHomeId = useSessionStore(state => state.activeHomeId);
  const devicesQuery = useDevicesQuery();
  return {
    ...devicesQuery,
    data: activeHomeId === null ? devicesQuery.data : devicesQuery.data?.filter(device => device.homeId === activeHomeId),
  };
}

export function useHomesQuery() {
  return useQuery(homesQueryOptions());
}

export function useRoomsQuery(homeId: string) {
  return useQuery(roomsQueryOptions(homeId));
}

/** Invalidates only data whose presentation depends on the active-home choice. */
export function invalidateActiveHomeQueries(queryClient: ReturnType<typeof useQueryClient>, previousHomeId: string | null, nextHomeId: string | null): Promise<void> {
  const roomIds = [...new Set([previousHomeId, nextHomeId].filter((homeId): homeId is string => homeId !== null && homeId.length > 0))];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }),
    ...roomIds.map(homeId => queryClient.invalidateQueries({ queryKey: homeQueryKeys.rooms(homeId) })),
  ]).then(() => undefined);
}

/** Owns the session-only active-home selection and its narrowly-scoped cache refresh. */
export function useActiveHomeSelection(homes: { id: string }[] = []) {
  const queryClient = useQueryClient();
  const activeHomeId = useSessionStore(state => state.activeHomeId);
  const setActiveHomeId = useSessionStore(state => state.setActiveHomeId);

  useEffect(() => {
    if (homes.length === 0 || (activeHomeId !== null && homes.some(home => home.id === activeHomeId))) return;
    setActiveHomeId(homes[0]?.id ?? null);
  }, [activeHomeId, homes, setActiveHomeId]);

  const selectHome = useCallback((homeId: string) => {
    if (homeId === activeHomeId) return;
    const previousHomeId = activeHomeId;
    setActiveHomeId(homeId);
    invalidateActiveHomeQueries(queryClient, previousHomeId, homeId).catch(() => undefined);
  }, [activeHomeId, queryClient, setActiveHomeId]);

  return { activeHomeId, selectHome };
}
