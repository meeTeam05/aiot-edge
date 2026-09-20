import type { Home } from '../src/features/home/models/homeModels';
import {
  profileHomesStateFromQuery,
  profileUserDisplayFromUser,
} from '../src/features/profile/models/profileModels';
import {
  resolveThemePreference,
  useThemePreferenceStore,
} from '../src/features/profile/services/themePreference';
import type { User } from '../src/models/user';

const home: Home = {
  id: 'home-1',
  name: 'Primary Home',
  address: null,
  ownerId: 'user-1',
  timezone: 'Asia/Ho_Chi_Minh',
};

describe('Profile data foundation', () => {
  afterEach(() => {
    useThemePreferenceStore.setState({ preference: 'light' });
  });

  it('maps the existing session user into Flutter Profile display data', () => {
    const user: User = { id: 'user-1', email: 'owner@example.com', fullName: 'Smart Air Owner' };
    expect(profileUserDisplayFromUser(user)).toEqual({
      email: 'owner@example.com',
      fullName: 'Smart Air Owner',
      initial: 'S',
    });
  });

  it('uses email then question-mark avatar fallbacks like Flutter', () => {
    expect(profileUserDisplayFromUser({ id: 'user-1', email: 'owner@example.com', fullName: null })).toMatchObject({ fullName: null, initial: 'O' });
    expect(profileUserDisplayFromUser({ id: 'user-1', email: '', fullName: '' })).toMatchObject({ fullName: null, initial: '?' });
    expect(profileUserDisplayFromUser(null)).toBeNull();
  });

  it('maps existing homes query loading, error, and data states without a profile API', () => {
    expect(profileHomesStateFromQuery({ data: undefined, isLoading: true, isError: false })).toEqual({ kind: 'loading' });
    expect(profileHomesStateFromQuery({ data: undefined, isLoading: false, isError: true })).toEqual({ kind: 'error' });
    expect(profileHomesStateFromQuery({ data: [home], isLoading: false, isError: false })).toEqual({ kind: 'data', homes: [home] });
  });

  it('keeps Light, Dark, and System theme preference local and resolves System from the device', () => {
    useThemePreferenceStore.getState().setPreference('dark');
    expect(useThemePreferenceStore.getState().preference).toBe('dark');
    useThemePreferenceStore.getState().setPreference('system');
    expect(resolveThemePreference(useThemePreferenceStore.getState().preference, 'dark')).toBe('dark');
    expect(resolveThemePreference('light', 'dark')).toBe('light');
  });
});
