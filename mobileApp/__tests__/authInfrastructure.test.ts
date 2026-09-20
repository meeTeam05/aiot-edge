import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: { API_BASE_URL: 'https://smart-air.test/api' },
}));

jest.mock('react-native-keychain', () => {
  const keychain = {
    getGenericPassword: jest.fn(),
    resetGenericPassword: jest.fn(),
    setGenericPassword: jest.fn(),
  };
  return { __esModule: true, default: keychain, ...keychain };
});

import { authApi } from '../src/api/authApi';
import { AuthenticationError, httpClient } from '../src/api/httpClient';
import type { User } from '../src/models/user';
import { secureStorage } from '../src/services/secureStorage';
import { useSessionStore } from '../src/state/sessionStore';
import Keychain from 'react-native-keychain';

const mockKeychain = Keychain as unknown as {
  getGenericPassword: jest.Mock;
  resetGenericPassword: jest.Mock;
  setGenericPassword: jest.Mock;
};

const user: User = {
  id: '8af1b6c7-9e26-4f6d-a8d2-882f5c1cb074',
  email: 'owner@example.com',
  fullName: 'Smart Air Owner',
};

let storedPassword: string | null = null;
const originalAdapter = httpClient.defaults.adapter;

function success(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function failure(config: InternalAxiosRequestConfig, status: number, data = { error: 'Unauthorized' }): Promise<never> {
  const response = success(config, data, status);
  return Promise.reject(new AxiosError('Request failed', undefined, config, undefined, response));
}

function authenticatedState(accessToken = 'expired-access-token') {
  return { status: 'authenticated' as const, user, accessToken, error: null };
}

beforeEach(() => {
  storedPassword = null;
  mockKeychain.getGenericPassword.mockImplementation(async () => (
    storedPassword === null
      ? false
      : { username: 'smart-air-session', password: storedPassword, service: 'com.smartair.mobile.session', storage: 'Keystore' }
  ));
  mockKeychain.setGenericPassword.mockImplementation(async (_username, password) => {
    storedPassword = password;
    return { service: 'com.smartair.mobile.session', storage: 'Keystore' };
  });
  mockKeychain.resetGenericPassword.mockImplementation(async () => {
    storedPassword = null;
    return true;
  });
  useSessionStore.setState(authenticatedState());
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  jest.clearAllMocks();
});

describe('secure storage', () => {
  it('persists only the refresh token and serialized user and clears corrupt data', async () => {
    await secureStorage.saveSession({ refreshToken: 'refresh-token', user });

    await expect(secureStorage.getSession()).resolves.toEqual({ refreshToken: 'refresh-token', user });
    expect(mockKeychain.setGenericPassword).toHaveBeenCalledTimes(1);
    expect(storedPassword).not.toContain('access');

    storedPassword = '{not json';
    await expect(secureStorage.getSession()).resolves.toBeNull();
    expect(mockKeychain.resetGenericPassword).toHaveBeenCalledTimes(1);
  });
});

describe('authentication API and interceptor', () => {
  it('maps the login response user from snake_case transport fields', async () => {
    httpClient.defaults.adapter = async config => success(config, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: user.id, email: user.email, full_name: user.fullName },
    });

    await expect(authApi.login({ email: user.email, password: 'password-value' })).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
  });

  it('uses one refresh request for concurrent protected 401 responses and retries each request once', async () => {
    await secureStorage.saveSession({ refreshToken: 'old-refresh-token', user });
    let refreshCalls = 0;
    let protectedCalls = 0;
    const adapter: AxiosAdapter = async config => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        await Promise.resolve();
        return success(config, { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
      }
      if (config.url === '/protected') {
        protectedCalls += 1;
        if (config.headers.Authorization === 'Bearer new-access-token') {
          return success(config, { ok: true });
        }
        return failure(config, 401);
      }
      throw new Error(`Unexpected request: ${config.url}`);
    };
    httpClient.defaults.adapter = adapter;

    await expect(Promise.all([httpClient.get('/protected'), httpClient.get('/protected')])).resolves.toEqual([
      expect.objectContaining({ data: { ok: true } }),
      expect.objectContaining({ data: { ok: true } }),
    ]);

    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(4);
    expect(useSessionStore.getState().accessToken).toBe('new-access-token');
    await expect(secureStorage.getSession()).resolves.toEqual({ refreshToken: 'new-refresh-token', user });
  });

  it('clears the local session when refresh fails', async () => {
    await secureStorage.saveSession({ refreshToken: 'expired-refresh-token', user });
    const adapter: AxiosAdapter = async config => (
      config.url === '/auth/refresh' ? failure(config, 401) : failure(config, 401)
    );
    httpClient.defaults.adapter = adapter;

    await expect(httpClient.get('/protected')).rejects.toBeInstanceOf(AuthenticationError);
    expect(useSessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
    });
    await expect(secureStorage.getSession()).resolves.toBeNull();
  });
});

describe('session store', () => {
  it('attempts server logout and always clears local state', async () => {
    await secureStorage.saveSession({ refreshToken: 'refresh-token', user });
    httpClient.defaults.adapter = async config => failure(config, 503, { error: 'Service unavailable' });

    await useSessionStore.getState().logout();

    expect(useSessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
    });
    await expect(secureStorage.getSession()).resolves.toBeNull();
  });
});
