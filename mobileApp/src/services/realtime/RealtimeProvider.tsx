import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '../../state/sessionStore';
import { RealtimeClient } from './realtimeClient';
import { RealtimeEventRouter } from './realtimeEventRouter';
import { useRealtimeConnectionStore } from './realtimeConnectionStore';

/** Owns the single app-level SSE lifecycle; screens never open individual connections. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const status = useSessionStore(state => state.status);
  const accessToken = useSessionStore(state => state.accessToken);

  useEffect(() => {
    const router = new RealtimeEventRouter(queryClient);
    const client = new RealtimeClient({
      onConnectionState: (state, error) => useRealtimeConnectionStore.getState().setConnection(state, error ?? null),
      onEvent: event => router.dispatch(event),
      onUnauthorized: () => useSessionStore.getState().forceLogout(),
    });
    if (status === 'authenticated' && accessToken !== null) client.start(accessToken);
    return () => client.stop();
  }, [accessToken, queryClient, status]);

  return children;
}
