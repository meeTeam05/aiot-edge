import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/profile/hooks/useProfileState', () => ({
  useProfileLogout: jest.fn(),
  useProfileState: jest.fn(),
}));

import { ProfileScreen } from '../src/features/profile/ProfileScreen';
import { useProfileLogout, useProfileState } from '../src/features/profile/hooks/useProfileState';

const mockProfileState = useProfileState as jest.MockedFunction<typeof useProfileState>;
const mockProfileLogout = useProfileLogout as jest.MockedFunction<typeof useProfileLogout>;
const setThemePreference = jest.fn();
const logout = jest.fn(async () => undefined);
const defaultProfileState = {
  homesState: { kind: 'data' as const, homes: [{ id: 'home-1', name: 'Primary Home', address: null, ownerId: 'user-1', timezone: 'Asia/Ho_Chi_Minh' }] },
  setThemePreference,
  themePreference: 'light' as const,
  userDisplay: { email: 'owner@example.com', fullName: 'Smart Air Owner', initial: 'S' },
};

function renderProfile() {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<ProfileScreen />); });
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfileLogout.mockReturnValue(logout);
  mockProfileState.mockReturnValue(defaultProfileState as never);
});

describe('Flutter Profile UI', () => {
  it('renders the brand, account card, homes card, and app settings', () => {
    const tree = renderProfile();
    const text = tree.root.findAllByType(Text).map(node => node.props.children).join(' ');
    expect(text).toContain('Atmosphere');
    expect(text).toContain('Smart Air Owner');
    expect(text).toContain('owner@example.com');
    expect(text).toContain('Primary Home');
    expect(text).toContain('APP SETTINGS');
  });

  it.each([
    [{ kind: 'loading' }, 'profile-homes-loading'],
    [{ kind: 'error' }, 'profile-homes-error'],
    [{ kind: 'data', homes: [] }, 'profile-homes-empty'],
  ] as const)('renders Flutter homes state %o', (homesState, testID) => {
    mockProfileState.mockReturnValue({ ...defaultProfileState, homesState } as never);
    const tree = renderProfile();
    expect(tree.root.findByProps({ testID })).toBeTruthy();
  });

  it('opens the theme selector and delegates a selected preference to the Profile foundation', () => {
    const tree = renderProfile();
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Theme' }).props.onPress(); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Dark theme' }).props.onPress(); });
    expect(setThemePreference).toHaveBeenCalledWith('dark');
  });

  it('requires confirmation before reusing the established logout action', () => {
    const tree = renderProfile();
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Log out' }).props.onPress(); });
    expect(logout).not.toHaveBeenCalled();
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Confirm logout' }).props.onPress(); });
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
