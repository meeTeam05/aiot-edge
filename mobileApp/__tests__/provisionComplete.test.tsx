import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../src/features/device/hooks/useDeviceDashboardQueries', () => {
  const actual = jest.requireActual('../src/features/device/hooks/useDeviceDashboardQueries');
  return { ...actual, useDeviceQuery: jest.fn() };
});
jest.mock('../src/features/home/hooks/useHomeQueries', () => {
  const actual = jest.requireActual('../src/features/home/hooks/useHomeQueries');
  return { ...actual, useRoomsQuery: jest.fn() };
});

import { ProvisionCompleteScreen } from '../src/features/devices/completion/ProvisionCompleteScreen';
import { useDeviceQuery } from '../src/features/device/hooks/useDeviceDashboardQueries';
import { useRoomsQuery } from '../src/features/home/hooks/useHomeQueries';
import type { Device, Room } from '../src/features/home/models/homeModels';

const mockDeviceQuery = useDeviceQuery as jest.MockedFunction<typeof useDeviceQuery>;
const mockRoomsQuery = useRoomsQuery as jest.MockedFunction<typeof useRoomsQuery>;
const device: Device = { id: 'device-1', name: 'Kitchen Air', homeId: 'home-1', roomId: 'room-1', online: true, lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null };
const rooms: Room[] = [{ id: 'room-1', homeId: 'home-1', name: 'Kitchen', icon: null }];

function query(data: unknown, isLoading = false) { return { data, error: null, isLoading } as never; }
function content(tree: renderer.ReactTestRenderer): string { return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join(' '); }
function render(params: Record<string, unknown> = { deviceId: device.id, deviceName: device.name, roomName: 'Kitchen', homeId: device.homeId }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const navigation = { reset: jest.fn() };
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<QueryClientProvider client={queryClient}><ProvisionCompleteScreen navigation={navigation as never} route={{ params } as never} /></QueryClientProvider>); });
  return { navigation, queryClient, tree };
}

beforeEach(() => {
  mockDeviceQuery.mockReturnValue(query(device));
  mockRoomsQuery.mockReturnValue(query(rooms));
});

describe('provision completion', () => {
  it('renders the setup-completed success confirmation', () => {
    const { tree } = render();
    expect(tree.root.findByProps({ testID: 'provision-complete-success' })).toBeTruthy();
    expect(content(tree)).toContain('Device setup completed');
  });

  it('displays the supplied device and room summaries', () => {
    const { tree } = render();
    expect(content(tree)).toContain('Kitchen Air');
    expect(content(tree)).toContain('Kitchen');
  });

  it('uses fallbacks for explicitly missing summary values', () => {
    const { tree } = render({ deviceId: device.id, deviceName: null, roomName: null, homeId: device.homeId });
    expect(content(tree)).toContain('Your Smart Air device');
    expect(content(tree)).toContain('No room assigned');
  });

  it('loads existing cached data when required summary fields were not supplied', () => {
    mockDeviceQuery.mockReturnValue(query(undefined, true));
    mockRoomsQuery.mockReturnValue(query(undefined, true));
    const { tree } = render({ deviceId: device.id });
    expect(tree.root.findByProps({ testID: 'provision-complete-loading' })).toBeTruthy();
  });

  it('resets the stack to Device Detail so provisioning routes cannot be revisited', async () => {
    const { navigation, tree } = render();
    await act(async () => { tree.root.findByProps({ testID: 'provision-complete-detail' }).props.onPress(); });
    expect(navigation.reset).toHaveBeenCalledWith({ index: 1, routes: [{ name: 'Tabs' }, { name: 'DeviceDetail', params: { deviceId: device.id } }] });
  });
});
