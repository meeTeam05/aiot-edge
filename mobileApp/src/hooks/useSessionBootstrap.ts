import { useEffect } from 'react';

import { useSessionStore } from '../state/sessionStore';

/** Restores the persisted Flutter-equivalent session once at application bootstrap. */
export function useSessionBootstrap(): void {
  const bootstrap = useSessionStore(state => state.bootstrap);
  useEffect(() => {
    bootstrap().catch(() => undefined);
  }, [bootstrap]);
}
