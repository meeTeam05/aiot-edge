import { create } from 'zustand';

import { authApi } from '../api/authApi';
import { configureHttpClientAuth, AuthenticationError } from '../api/httpClient';
import type { LoginRequestDto, RegisterRequestDto, User } from '../models/user';
import { secureStorage } from '../services/secureStorage';

export type AuthenticationStatus = 'bootstrapping' | 'unauthenticated' | 'authenticating' | 'authenticated';

interface SessionState {
  status: AuthenticationStatus;
  user: User | null;
  /** Memory-only. Never persist this token. */
  accessToken: string | null;
  error: Error | null;
  /** Session-only UI selection; server home data remains in TanStack Query. */
  activeHomeId: string | null;
  bootstrap: () => Promise<void>;
  login: (request: LoginRequestDto) => Promise<void>;
  register: (request: RegisterRequestDto) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: () => Promise<void>;
  setActiveHomeId: (homeId: string | null) => void;
}

const unauthenticatedState = {
  status: 'unauthenticated' as const,
  user: null,
  accessToken: null,
  error: null,
  activeHomeId: null,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  error: null,
  activeHomeId: null,

  async bootstrap() {
    try {
      const session = await secureStorage.getSession();
      // Flutter restores the user and waits for a protected 401 before refreshing.
      set(session
        ? { status: 'authenticated', user: session.user, accessToken: null, error: null }
        : unauthenticatedState);
    } catch (error) {
      await secureStorage.clear();
      set({ ...unauthenticatedState, error: error instanceof Error ? error : new Error('Session restore failed') });
    }
  },

  async login(request) {
    set({ status: 'authenticating', error: null });
    try {
      const session = await authApi.login(request);
      await secureStorage.saveSession({ refreshToken: session.refreshToken, user: session.user });
      set({ status: 'authenticated', user: session.user, accessToken: session.accessToken, error: null });
    } catch (error) {
      set({ ...unauthenticatedState, error: error instanceof Error ? error : new Error('Login failed') });
      throw error;
    }
  },

  async register(request) {
    set({ status: 'authenticating', error: null });
    try {
      await authApi.register(request);
      await get().login({ email: request.email, password: request.password });
    } catch (error) {
      set({ ...unauthenticatedState, error: error instanceof Error ? error : new Error('Registration failed') });
      throw error;
    }
  },

  async logout() {
    try {
      await authApi.logout();
    } catch {
      // Match Flutter: server logout failure does not retain a local session.
    }
    await get().forceLogout();
  },

  async forceLogout() {
    await secureStorage.clear();
    set(unauthenticatedState);
  },

  setActiveHomeId(homeId) {
    const normalized = homeId?.trim() ?? null;
    set({ activeHomeId: normalized && normalized.length > 0 ? normalized : null });
  },
}));

configureHttpClientAuth({
  getAccessToken: () => useSessionStore.getState().accessToken,
  async refreshAccessToken() {
    const persisted = await secureStorage.getSession();
    if (!persisted) throw new AuthenticationError();

    const refreshed = await authApi.refresh({ refreshToken: persisted.refreshToken });
    const refreshToken = refreshed.refreshToken ?? persisted.refreshToken;
    await secureStorage.saveSession({ refreshToken, user: persisted.user });
    useSessionStore.setState({ accessToken: refreshed.accessToken });
    return refreshed.accessToken;
  },
  async onRefreshFailure() {
    await useSessionStore.getState().forceLogout();
  },
});
