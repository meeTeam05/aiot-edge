import renderer, { act } from 'react-test-renderer';
import { RefreshControl, Text } from 'react-native';

jest.mock('../src/features/home/hooks/useHomeQueries', () => ({
  useHomesQuery: jest.fn(),
  useActiveHomeSelection: jest.fn(),
}));

import { HomeListScreen } from '../src/features/home/HomeListScreen';
import { useActiveHomeSelection, useHomesQuery } from '../src/features/home/hooks/useHomeQueries';

const mockHomesQuery = useHomesQuery as jest.MockedFunction<typeof useHomesQuery>;
const mockSelection = useActiveHomeSelection as jest.MockedFunction<typeof useActiveHomeSelection>;
const refetch = jest.fn().mockResolvedValue(undefined);
const selectHome = jest.fn();
const homes = [
  { id: 'home-1', name: 'Primary Home', address: '1 Smart Air Way', ownerId: 'user-1', timezone: 'Asia/Ho_Chi_Minh' },
  { id: 'home-2', name: 'Studio', address: null, ownerId: 'user-1', timezone: 'Asia/Ho_Chi_Minh' },
];
const trees: renderer.ReactTestRenderer[] = [];

function render(props: Partial<React.ComponentProps<typeof HomeListScreen>> = {}) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<HomeListScreen {...props} />); });
  trees.push(tree!);
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHomesQuery.mockReturnValue({ data: homes, isLoading: false, isError: false, isRefetching: false, refetch } as never);
  mockSelection.mockReturnValue({ activeHomeId: 'home-1', selectHome } as never);
});

afterEach(() => { act(() => { trees.splice(0).forEach(tree => tree.unmount()); }); });

describe('Flutter HomesScreen parity', () => {
  it('renders loading, error, and empty states', () => {
    mockHomesQuery.mockReturnValue({ data: undefined, isLoading: true } as never);
    expect(render().root.findByProps({ testID: 'homes-loading' })).toBeTruthy();

    mockHomesQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Offline'), refetch } as never);
    const error = render();
    expect(error.root.findByProps({ testID: 'homes-error' })).toBeTruthy();
    act(() => { error.root.findByProps({ accessibilityLabel: 'Retry' }).props.onPress(); });
    expect(refetch).toHaveBeenCalled();

    mockHomesQuery.mockReturnValue({ data: [], isLoading: false, isError: false, refetch } as never);
    expect(render().root.findByProps({ testID: 'homes-empty' })).toBeTruthy();
  });

  it('renders homes, marks the active selection, and switches on row press', () => {
    const onSelected = jest.fn();
    const tree = render({ onSelected });
    const content = tree.root.findAllByType(Text).map(node => node.props.children).join(' ');
    expect(content).toContain('My Homes');
    expect(content).toContain('Primary Home');
    expect(content).toContain('1 Smart Air Way');
    expect(content).toContain('Selected');
    act(() => { tree.root.findByProps({ testID: 'home-row-home-2' }).props.onPress(); });
    expect(selectHome).toHaveBeenCalledWith('home-2');
    expect(onSelected).toHaveBeenCalled();
  });

  it('uses query refetch for pull-to-refresh', () => {
    const tree = render();
    act(() => { tree.root.findByType(RefreshControl).props.onRefresh(); });
    expect(refetch).toHaveBeenCalled();
  });
});
