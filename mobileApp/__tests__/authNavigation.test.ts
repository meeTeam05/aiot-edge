jest.mock('../src/api/authApi', () => ({
  authApi: {
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
    register: jest.fn(),
  },
}));

import { authApi } from '../src/api/authApi';
import { validateLogin, validateRegister } from '../src/features/auth/authValidation';
import { getRootNavigatorBranch } from '../src/navigation/rootBranch';
import type { User } from '../src/models/user';
import { secureStorage } from '../src/services/secureStorage';
import { useSessionStore } from '../src/state/sessionStore';

const user: User = {
  id: 'e71c0b85-0756-47ce-8a9b-ae03a2ef5eab',
  email: 'owner@example.com',
  fullName: 'Smart Air Owner',
};

const mockAuthApi = authApi as jest.Mocked<typeof authApi>;

function resetStore() {
  useSessionStore.setState({
    status: 'bootstrapping',
    user: null,
    accessToken: null,
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('root navigation', () => {
  it('selects loading, auth, or app from the session state', () => {
    expect(getRootNavigatorBranch('bootstrapping')).toBe('loading');
    expect(getRootNavigatorBranch('unauthenticated')).toBe('auth');
    expect(getRootNavigatorBranch('authenticating')).toBe('auth');
    expect(getRootNavigatorBranch('authenticated')).toBe('app');
  });
});

describe('session bootstrap', () => {
  it('restores a persisted user without persisting an access token', async () => {
    jest.spyOn(secureStorage, 'getSession').mockResolvedValue({ refreshToken: 'stored-refresh-token', user });

    await useSessionStore.getState().bootstrap();

    expect(useSessionStore.getState()).toMatchObject({
      status: 'authenticated',
      user,
      accessToken: null,
    });
  });
});

describe('authentication form flows', () => {
  it('validates the Flutter login and registration form rules before submission', () => {
    expect(validateLogin('invalid-email', '123')).toEqual({
      email: 'Enter a valid email',
      password: 'Min 6 characters',
    });
    expect(validateRegister('', 'invalid-email', '123')).toEqual({
      fullName: 'Name required',
      email: 'Valid email required',
      password: 'Min 6 characters',
    });
  });

  it('completes login and stores the resulting authenticated session', async () => {
    const saveSession = jest.spyOn(secureStorage, 'saveSession').mockResolvedValue();
    mockAuthApi.login.mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token', user });

    await useSessionStore.getState().login({ email: user.email, password: 'password-value' });

    expect(mockAuthApi.login).toHaveBeenCalledWith({ email: user.email, password: 'password-value' });
    expect(saveSession).toHaveBeenCalledWith({ refreshToken: 'refresh-token', user });
    expect(useSessionStore.getState()).toMatchObject({ status: 'authenticated', user, accessToken: 'access-token' });
  });

  it('retains the API failure for the login screen and returns to unauthenticated state', async () => {
    const failure = new Error('Invalid credentials');
    mockAuthApi.login.mockRejectedValue(failure);

    await expect(useSessionStore.getState().login({ email: user.email, password: 'wrong-password' })).rejects.toThrow('Invalid credentials');

    expect(useSessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      error: failure,
    });
  });

  it('registers with full_name then automatically logs in like Flutter', async () => {
    mockAuthApi.register.mockResolvedValue(user);
    mockAuthApi.login.mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token', user });
    jest.spyOn(secureStorage, 'saveSession').mockResolvedValue();

    await useSessionStore.getState().register({
      full_name: user.fullName ?? '',
      email: user.email,
      password: 'password-value',
    });

    expect(mockAuthApi.register).toHaveBeenCalledWith({
      full_name: user.fullName,
      email: user.email,
      password: 'password-value',
    });
    expect(mockAuthApi.login).toHaveBeenCalledWith({ email: user.email, password: 'password-value' });
    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it('attempts server logout and clears the session before the root gate returns to auth', async () => {
    useSessionStore.setState({ status: 'authenticated', user, accessToken: 'access-token', error: null });
    const clear = jest.spyOn(secureStorage, 'clear').mockResolvedValue();
    mockAuthApi.logout.mockRejectedValue(new Error('Network unavailable'));

    await useSessionStore.getState().logout();

    expect(mockAuthApi.logout).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(getRootNavigatorBranch(useSessionStore.getState().status)).toBe('auth');
  });
});
