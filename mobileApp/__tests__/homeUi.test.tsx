import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/home/hooks/useHomeQueries', () => ({
  useActiveHomeDevicesQuery: jest.fn(),
  useActiveHomeSelection: () => ({ activeHomeId: null, selectHome: jest.fn() }),
  useHomesQuery: jest.fn(),
  useRoomsQuery: jest.fn(),
}));

import { HomeScreen } from '../src/features/home/HomeScreen';
import { useActiveHomeDevicesQuery, useHomesQuery, useRoomsQuery } from '../src/features/home/hooks/useHomeQueries';

const mockDevicesQuery = useActiveHomeDevicesQuery as jest.MockedFunction<typeof useActiveHomeDevicesQuery>;
const mockHomesQuery = useHomesQuery as jest.MockedFunction<typeof useHomesQuery>;
const mockRoomsQuery = useRoomsQuery as jest.MockedFunction<typeof useRoomsQuery>;

function renderHome() {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<HomeScreen />); });
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHomesQuery.mockReturnValue({ data: [], isLoading: false } as never);
  mockRoomsQuery.mockReturnValue({ data: [], isLoading: false } as never);
});

describe('Flutter Home UI states', () => {
  it('renders the three-card Flutter loading state', () => {
    mockDevicesQuery.mockReturnValue({ data: undefined, isLoading: true } as never);
    const tree = renderHome();
    expect(tree.root.findByProps({ testID: 'home-loading-state' })).toBeTruthy();
  });

  it('renders device summaries and resolves their room names through the room hook', () => {
    mockDevicesQuery.mockReturnValue({ data: [{ id: 'device-1', name: 'Living Room Purifier', homeId: 'home-1', roomId: 'room-1', online: true, lastSeen: null, firmwareVer: null, mode: 'on', relay1: null, relay2: null, relay3: null, createdAt: null }], isLoading: false, isError: false } as never);
    mockRoomsQuery.mockReturnValue({ data: [{ id: 'room-1', homeId: 'home-1', name: 'Living Room', icon: null }] } as never);

    const tree = renderHome();
    const text = tree.root.findAllByType(Text).map(node => node.props.children).join(' ');
    expect(text).toContain('My Devices');
    expect(text).toContain('Living Room Purifier');
    expect(text).toContain('Living Room');
    expect(mockRoomsQuery).toHaveBeenCalledWith('home-1');
  });

  it('renders the Flutter empty state when the device list is empty', () => {
    mockDevicesQuery.mockReturnValue({ data: [], isLoading: false, isError: false } as never);
    const tree = renderHome();
    expect(tree.root.findByProps({ testID: 'home-empty-state' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).map(node => node.props.children).join(' ')).toContain('No devices yet');
  });

  it('renders the raw device error from the query', () => {
    mockDevicesQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Server unavailable'), refetch: jest.fn() } as never);
    const tree = renderHome();
    expect(tree.root.findByProps({ testID: 'home-error-state' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).map(node => node.props.children).join(' ')).toContain('Server unavailable');
  });

  it('uses feature query hooks rather than issuing component-level API requests', () => {
    mockDevicesQuery.mockReturnValue({ data: [], isLoading: false, isError: false } as never);
    renderHome();
    expect(mockDevicesQuery).toHaveBeenCalledTimes(1);
    expect(mockHomesQuery).toHaveBeenCalledTimes(1);
  });
});
