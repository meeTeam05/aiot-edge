import renderer, { act } from 'react-test-renderer';

jest.mock('../src/features/home/hooks/useHomeQueries', () => ({
  useActiveHomeDevicesQuery: jest.fn(),
  useActiveHomeSelection: () => ({ activeHomeId: null, selectHome: jest.fn() }),
  useHomesQuery: jest.fn(),
  useRoomsQuery: jest.fn(),
}));

import { HomeScreen } from '../src/features/home/HomeScreen';
import { useActiveHomeDevicesQuery, useHomesQuery, useRoomsQuery } from '../src/features/home/hooks/useHomeQueries';
import type { Home } from '../src/features/home/models/homeModels';
import { getAddDeviceDestination } from '../src/features/provision/addDeviceDecision';

const mockDevicesQuery = useActiveHomeDevicesQuery as jest.MockedFunction<typeof useActiveHomeDevicesQuery>;
const mockHomesQuery = useHomesQuery as jest.MockedFunction<typeof useHomesQuery>;
const mockRoomsQuery = useRoomsQuery as jest.MockedFunction<typeof useRoomsQuery>;

const primaryHome: Home = {
  id: 'home-1',
  name: 'Primary Home',
  address: null,
  ownerId: 'user-1',
  timezone: 'Asia/Ho_Chi_Minh',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHomesQuery.mockReturnValue({ data: [primaryHome], isLoading: false } as never);
  mockRoomsQuery.mockReturnValue({ data: [], isLoading: false } as never);
});

describe('Flutter Home navigation handoff', () => {
  it('passes a device ID from its card into the Device Detail navigation callback', () => {
    const onOpenDevice = jest.fn();
    mockDevicesQuery.mockReturnValue({
      data: [{ id: 'device-1', name: 'Living Room Purifier', homeId: 'home-1', roomId: null, online: true, lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null }],
      isLoading: false,
      isError: false,
    } as never);

    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<HomeScreen onOpenDevice={onOpenDevice} />); });
    act(() => { tree!.root.findByProps({ accessibilityLabel: 'View details for Living Room Purifier' }).props.onPress(); });

    expect(onOpenDevice).toHaveBeenCalledWith('device-1');
  });

  it('routes an existing single home to the Flutter-equivalent Provision route', () => {
    expect(getAddDeviceDestination([primaryHome], false)).toEqual({ kind: 'provision', homeId: 'home-1' });
  });

  it('routes no homes to the Flutter-equivalent Create Home route', () => {
    expect(getAddDeviceDestination([], false)).toEqual({ kind: 'createHome' });
  });

  it('retains Flutter multi-home selection and loading behavior', () => {
    expect(getAddDeviceDestination([primaryHome, { ...primaryHome, id: 'home-2' }], false)).toEqual({ kind: 'chooseHome' });
    expect(getAddDeviceDestination([], true)).toEqual({ kind: 'loading' });
  });
});
