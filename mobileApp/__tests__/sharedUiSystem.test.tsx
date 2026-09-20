import { act } from 'react-test-renderer';
import renderer from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

import { AppBar, AppIcon, Card, EmptyState, ErrorState, LoadingState, PrimaryButton, SecondaryButton, StatusBadge } from '../src/components/ui';
import { ThemeProvider, useAppTheme } from '../src/design/ThemeProvider';
import { useThemePreferenceStore } from '../src/features/profile/services/themePreference';

function ThemeProbe() {
  const { preference, setPreference, theme } = useAppTheme();
  return <><Text testID="theme-mode">{`${preference}:${theme.mode}`}</Text><Pressable onPress={() => setPreference('dark')} testID="set-dark"><Text>Dark</Text></Pressable></>;
}

function renderUi(children: React.ReactNode) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<ThemeProvider>{children}</ThemeProvider>); });
  return tree!;
}

beforeEach(() => { act(() => { useThemePreferenceStore.setState({ preference: 'light' }); }); });
afterEach(() => { act(() => { useThemePreferenceStore.setState({ preference: 'light' }); }); });

describe('shared Flutter-equivalent UI foundation', () => {
  it('switches the RootApp theme from the in-memory Light/Dark/System preference', () => {
    const tree = renderUi(<ThemeProbe />);
    expect(tree.root.findByProps({ testID: 'theme-mode' }).props.children).toBe('light:light');
    act(() => { tree.root.findByProps({ testID: 'set-dark' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'theme-mode' }).props.children).toBe('dark:dark');
  });

  it('renders token-backed app chrome, cards, buttons, badges, and semantic icon labels', () => {
    const tree = renderUi(<><AppBar onBack={jest.fn()} title="Device" /><Card testID="shared-card"><Text>Card content</Text></Card><PrimaryButton label="Continue" onPress={jest.fn()} /><SecondaryButton label="Cancel" onPress={jest.fn()} /><StatusBadge label="Online" tone="success" /><AppIcon color="#0F6B5C" name="settings" /></>);
    expect(tree.root.findByProps({ testID: 'shared-card' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: 'Back' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: 'Settings' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).map(node => node.props.children).join(' ')).toContain('Online');
  });

  it('renders consistent loading, empty, and retryable error states', () => {
    const retry = jest.fn();
    const tree = renderUi(<><LoadingState message="Loading devices…" testID="loading" /><EmptyState body="Add a device to begin." testID="empty" title="No devices yet" /><ErrorState error="Network unavailable" onRetry={retry} testID="error" title="Unable to load" /></>);
    expect(tree.root.findByProps({ testID: 'loading' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'empty' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'error' })).toBeTruthy();
    act(() => { tree.root.findByProps({ accessibilityRole: 'button' }).props.onPress(); });
  });
});
