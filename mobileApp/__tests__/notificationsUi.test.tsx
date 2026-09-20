import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/notifications/hooks/useNotificationsQuery', () => ({
  useNotificationsQuery: jest.fn(),
}));

import { NotificationsScreen } from '../src/features/notifications/NotificationsScreen';
import { useNotificationsQuery } from '../src/features/notifications/hooks/useNotificationsQuery';

const mockNotificationsQuery = useNotificationsQuery as jest.MockedFunction<typeof useNotificationsQuery>;

function renderNotifications(props: React.ComponentProps<typeof NotificationsScreen> = {}) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<NotificationsScreen {...props} />); });
  return tree!;
}

describe('Flutter Notifications UI', () => {
  it('renders the four-card loading state', () => {
    mockNotificationsQuery.mockReturnValue({ data: undefined, isLoading: true } as never);
    const tree = renderNotifications();
    expect(tree.root.findByProps({ testID: 'notifications-loading-state' })).toBeTruthy();
  });

  it('renders the empty state and Open devices action', () => {
    mockNotificationsQuery.mockReturnValue({ data: [], isLoading: false, isError: false } as never);
    const tree = renderNotifications();
    expect(tree.root.findByProps({ testID: 'notifications-empty-state' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).map(node => node.props.children).join(' ')).toContain('No notifications yet');
  });

  it('renders the error state and server message', () => {
    mockNotificationsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Notifications unavailable'), refetch: jest.fn() } as never);
    const tree = renderNotifications();
    expect(tree.root.findByProps({ testID: 'notifications-error-state' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).map(node => node.props.children).join(' ')).toContain('Notifications unavailable');
  });

  it('renders a populated Flutter notification card with device metadata and local timestamp', () => {
    mockNotificationsQuery.mockReturnValue({ data: [{ id: '42', type: 'command.done', deviceId: 'device-1', deviceName: 'Living Room Air', title: 'Relay 1 turned on', body: 'Command completed successfully.', severity: 'success', occurredAt: new Date(2026, 4, 24, 20, 55), payload: {} }], isLoading: false, isError: false } as never);
    const tree = renderNotifications();
    const text = tree.root.findAllByType(Text).map(node => node.props.children).join(' ');
    expect(text).toContain('Relay 1 turned on');
    expect(text).toContain('Living Room Air');
    expect(text).toContain('24/5 20:55');
  });

  it('passes a notification device ID into the detail navigation callback', () => {
    const onOpenDevice = jest.fn();
    mockNotificationsQuery.mockReturnValue({ data: [{ id: '42', type: 'command.done', deviceId: 'device-1', deviceName: 'Living Room Air', title: 'Relay 1 turned on', body: 'Command completed successfully.', severity: 'success', occurredAt: new Date(), payload: {} }], isLoading: false, isError: false } as never);
    const tree = renderNotifications({ onOpenDevice });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Open notification for Living Room Air' }).props.onPress(); });
    expect(onOpenDevice).toHaveBeenCalledWith('device-1');
  });
});
