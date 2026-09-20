import { create } from 'zustand';

export type RealtimeConnectionState = 'connected' | 'reconnecting' | 'disconnected' | 'error';

interface RealtimeConnectionStore {
  state: RealtimeConnectionState;
  error: Error | null;
  setConnection: (state: RealtimeConnectionState, error?: Error | null) => void;
}

export const useRealtimeConnectionStore = create<RealtimeConnectionStore>(set => ({
  state: 'disconnected',
  error: null,
  setConnection: (state, error = null) => set({ state, error }),
}));
