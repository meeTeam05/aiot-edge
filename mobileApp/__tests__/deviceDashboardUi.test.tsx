import renderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';

jest.mock('../src/features/device/hooks/useDeviceDashboardQueries', () => ({
  useDeviceQuery: jest.fn(),
  useDeviceShadowQuery: jest.fn(),
  useDeviceTelemetryQuery: jest.fn(),
  useDeviceCommandHistoryQuery: jest.fn(),
}));

jest.mock('../src/features/device/hooks/useDeviceControls', () => ({
  useDeviceControls: jest.fn(),
}));
jest.mock('../src/features/home/hooks/useHomeQueries', () => ({
  useRoomsQuery: jest.fn(),
}));

import { DeviceDetailScreen } from '../src/features/device/DeviceDetailScreen';
import { dashboardLayout, isLiveTelemetryPoint } from '../src/features/device/DeviceDetailScreen';
import {
  useDeviceCommandHistoryQuery,
  useDeviceQuery,
  useDeviceShadowQuery,
  useDeviceTelemetryQuery,
} from '../src/features/device/hooks/useDeviceDashboardQueries';
import { useDeviceControls } from '../src/features/device/hooks/useDeviceControls';
import { useRoomsQuery } from '../src/features/home/hooks/useHomeQueries';

const mockDeviceQuery = useDeviceQuery as jest.MockedFunction<typeof useDeviceQuery>;
const mockShadowQuery = useDeviceShadowQuery as jest.MockedFunction<typeof useDeviceShadowQuery>;
const mockTelemetryQuery = useDeviceTelemetryQuery as jest.MockedFunction<typeof useDeviceTelemetryQuery>;
const mockCommandsQuery = useDeviceCommandHistoryQuery as jest.MockedFunction<typeof useDeviceCommandHistoryQuery>;
const mockControls = useDeviceControls as jest.MockedFunction<typeof useDeviceControls>;
const mockRoomsQuery = useRoomsQuery as jest.MockedFunction<typeof useRoomsQuery>;

const idleControl = { commandId: null, errorMessage: null, isPending: false, state: 'idle' as const, submit: jest.fn() };

function renderDashboard(deviceId = 'device-1', navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() }) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<DeviceDetailScreen navigation={navigation as never} route={{ params: { deviceId } } as never} />);
  });
  return tree!;
}

function textContent(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join(' ');
}

const device = {
  id: 'device-1', name: 'Living Room Purifier', homeId: 'home-1', roomId: null,
  online: true, lastSeen: new Date('2026-09-19T02:00:00.000Z'), firmwareVer: '1.2.3',
  mode: null, relay1: null, relay2: null, relay3: null, createdAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockControls.mockReturnValue({ fan: idleControl, filter: idleControl, lamp: idleControl, mode: idleControl });
  mockCommandsQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
  mockRoomsQuery.mockReturnValue({ data: [], isLoading: false, isError: false } as never);
});

describe('Flutter Device Dashboard UI states', () => {
  it('renders the initial dashboard loading state', () => {
    mockDeviceQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(tree.root.findByProps({ testID: 'device-dashboard-loading' })).toBeTruthy();
    expect(textContent(tree)).toContain('Loading device dashboard…');
  });

  it('renders the populated read-only dashboard from feature query hooks', () => {
    mockRoomsQuery.mockReturnValue({ data: [{ id: 'room-1', homeId: 'home-1', name: 'Living room', icon: null }], isLoading: false, isError: false } as never);
    mockDeviceQuery.mockReturnValue({ data: { ...device, roomId: 'room-1' }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on', relay_1: true, relay_2: false, relay_3: true, temperature: 21 }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [{ ts: new Date(), temperature: 24.6, humidity: 61.2, coPpm: 5.4, no2Ppm: 0.3, mode: 'on' }], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockCommandsQuery.mockReturnValue({ data: [{ id: 'command-1', payload: { type: 'relay_set', relay: 1, state: true }, status: 'done', createdAt: new Date(), executedAt: null }], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    const content = textContent(tree);
    expect(content).toContain('Living Room Purifier');
    expect(content).toContain('Firmware 1.2.3');
    expect(content).toContain('Living room');
    expect(content).toContain('24.60');
    expect(content).toContain('61.20');
    expect(content).toContain('5.40');
    expect(content).toContain('0.30');
    expect(content).toContain('Relay 1 turned on');
    expect(mockDeviceQuery).toHaveBeenCalledWith('device-1');
    expect(mockShadowQuery).toHaveBeenCalledWith('device-1');
    expect(mockTelemetryQuery).toHaveBeenCalledWith('device-1', expect.objectContaining({ limit: 720 }));
    expect(mockCommandsQuery).toHaveBeenCalledWith('device-1');
  });

  it('uses the Flutter offline/last-seen presentation and standby mode', () => {
    mockDeviceQuery.mockReturnValue({ data: { ...device, online: false, lastSeen: new Date(Date.now() - 5 * 60 * 1000) }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'off' }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(textContent(tree)).toContain('● Offline · 5m ago');
    expect(textContent(tree)).toContain('OFF');
  });

  it('renders em dashes for missing sensor values and mode-off sensor presentation', () => {
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on' }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(tree.root.findAllByType(Text).filter(node => node.props.children === '—')).toHaveLength(4);
  });

  it('renders command history loading, empty, error, and populated states', () => {
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on' }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockCommandsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(textContent(tree)).toContain('Loading command activity...');
  });

  it('renders a retryable Flutter-equivalent error for missing device or initial query failure', () => {
    mockDeviceQuery.mockReturnValue({ data: null, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(tree.root.findByProps({ testID: 'device-dashboard-error' })).toBeTruthy();
    expect(textContent(tree)).toContain('Device not found.');
  });

  it('submits relay controls from their reported state and preserves the standby confirmation', () => {
    const fanSubmit = jest.fn().mockResolvedValue(undefined);
    const modeSubmit = jest.fn().mockResolvedValue(undefined);
    mockControls.mockReturnValue({
      fan: { ...idleControl, submit: fanSubmit }, filter: idleControl, lamp: idleControl, mode: { ...idleControl, submit: modeSubmit },
    });
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on', relay_1: false }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, actions) => actions?.find(action => action.text === 'Confirm')?.onPress?.());
    const tree = renderDashboard();
    act(() => { tree.root.findByProps({ testID: 'relay-toggle-1' }).props.onPress(); });
    expect(fanSubmit).toHaveBeenCalledWith(true);
    act(() => { tree.root.findByProps({ testID: 'device-mode-toggle' }).props.onPress(); });
    expect(alert).toHaveBeenCalledWith('Switch to Standby?', 'Sensors will pause and relays will turn off.', expect.any(Array));
    expect(modeSubmit).toHaveBeenCalledWith('off');
    alert.mockRestore();
  });

  it('displays command failures without changing reported dashboard values', () => {
    mockControls.mockReturnValue({
      fan: { ...idleControl, errorMessage: 'Relay fault', state: 'failure' }, filter: idleControl, lamp: idleControl, mode: idleControl,
    });
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on', relay_1: false }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(tree.root.findByProps({ testID: 'device-control-feedback' }).props.children).toBe('Relay fault');
    expect(tree.root.findByProps({ testID: 'relay-1' }).props.accessibilityLabel).toContain('Off');
  });

  it('keeps unrelated relays available while a mode command waits for shadow confirmation', () => {
    mockControls.mockReturnValue({
      fan: idleControl, filter: idleControl, lamp: idleControl, mode: { ...idleControl, isPending: true, state: 'waiting-for-device' },
    });
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on' }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const tree = renderDashboard();
    expect(tree.root.findByProps({ testID: 'relay-toggle-1' }).props.disabled).toBe(false);
  });

  it('uses Flutter live-window rules for stale telemetry and responsive dashboard grids', () => {
    const now = new Date('2026-09-20T02:00:00.000Z');
    expect(isLiveTelemetryPoint({ ts: new Date('2026-09-20T01:31:00.000Z'), temperature: null, humidity: null, coPpm: null, no2Ppm: null, mode: null }, now)).toBe(true);
    expect(isLiveTelemetryPoint({ ts: new Date('2026-09-20T01:29:59.000Z'), temperature: null, humidity: null, coPpm: null, no2Ppm: null, mode: null }, now)).toBe(false);
    expect(dashboardLayout(320, 1, 20)).toEqual({ compactSensors: true, contentWidth: 280, relayColumns: 1 });
    expect(dashboardLayout(480, 1.8, 20)).toEqual({ compactSensors: true, contentWidth: 440, relayColumns: 1 });
    expect(dashboardLayout(480, 1, 20)).toEqual({ compactSensors: false, contentWidth: 440, relayColumns: 2 });
  });

  it('hands the dashboard View all action to the Command History stack route', () => {
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on' }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
    const tree = renderDashboard('device-1', navigation);
    act(() => { tree.root.findByProps({ testID: 'device-view-all-commands' }).props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('CommandHistory', { deviceId: 'device-1' });
  });

  it('hands the dashboard Settings action to the Device Settings stack route', () => {
    mockDeviceQuery.mockReturnValue({ data: device, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockShadowQuery.mockReturnValue({ data: { reported: { mode: 'on' }, desired: {}, updatedAt: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    mockTelemetryQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
    const tree = renderDashboard('device-1', navigation);
    act(() => { tree.root.findByProps({ testID: 'device-dashboard-settings' }).props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('DeviceSettings', { deviceId: 'device-1' });
  });
});
