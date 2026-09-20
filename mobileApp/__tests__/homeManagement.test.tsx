import { QueryClient } from '@tanstack/react-query';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/home/hooks/useHomeMutations', () => ({
  ...jest.requireActual('../src/features/home/hooks/useHomeMutations'),
  useHomeMutations: jest.fn(),
}));
jest.mock('../src/features/home/hooks/useHomeQueries', () => ({
  ...jest.requireActual('../src/features/home/hooks/useHomeQueries'),
  useHomesQuery: jest.fn(),
  useRoomsQuery: jest.fn(),
}));
jest.mock('../src/features/home/room/hooks/useRoomMutations', () => ({
  useRoomMutations: jest.fn(),
}));

import { CreateHomeScreen } from '../src/features/home/CreateHomeScreen';
import { HomeDetailScreen } from '../src/features/home/HomeDetailScreen';
import { addHomeToCache, removeHomeFromCache, updateHomeInCache, useHomeMutations } from '../src/features/home/hooks/useHomeMutations';
import { useHomesQuery, useRoomsQuery } from '../src/features/home/hooks/useHomeQueries';
import { useRoomMutations } from '../src/features/home/room/hooks/useRoomMutations';
import { useSessionStore } from '../src/state/sessionStore';

const mockMutations = useHomeMutations as jest.MockedFunction<typeof useHomeMutations>;
const mockHomesQuery = useHomesQuery as jest.MockedFunction<typeof useHomesQuery>;
const mockRoomsQuery = useRoomsQuery as jest.MockedFunction<typeof useRoomsQuery>;
const mockRoomMutations = useRoomMutations as jest.MockedFunction<typeof useRoomMutations>;
const created = { id: 'home-2', name: 'Studio', address: null, ownerId: 'user-1', timezone: 'Asia/Ho_Chi_Minh' };
const existing = { id: 'home-1', name: 'Primary Home', address: '1 Smart Air Way', ownerId: 'user-1', timezone: 'Asia/Ho_Chi_Minh' };
const createHome = jest.fn().mockResolvedValue(created);
const updateHome = jest.fn().mockResolvedValue({ ...existing, name: 'Renamed Home' });
const deleteHome = jest.fn().mockResolvedValue(undefined);
const trees: renderer.ReactTestRenderer[] = [];

function navigation() { return { goBack: jest.fn(), navigate: jest.fn() }; }
function renderCreate() {
  const nav = navigation();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<CreateHomeScreen navigation={nav as never} route={{} as never} />); });
  trees.push(tree!);
  return { nav, tree: tree! };
}
function renderDetail() {
  const nav = navigation();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<HomeDetailScreen navigation={nav as never} route={{ params: { homeId: existing.id } } as never} />); });
  trees.push(tree!);
  return { nav, tree: tree! };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ user: { id: 'user-1', email: 'owner@example.com', displayName: null } as never });
  mockMutations.mockReturnValue({ createHome, createError: null, deleteError: null, deleteHome, isCreating: false, isDeleting: false, isUpdating: false, updateError: null, updateHome } as never);
  mockHomesQuery.mockReturnValue({ data: [existing], isLoading: false, isError: false } as never);
  mockRoomsQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn().mockResolvedValue(undefined) } as never);
  mockRoomMutations.mockReturnValue({ deleteRoom: jest.fn(), isDeleting: false } as never);
});
afterEach(() => { act(() => { trees.splice(0).forEach(tree => tree.unmount()); useSessionStore.setState({ user: null }); }); });

describe('home creation and detail UI', () => {
  it('validates, creates a trimmed home name, and returns after success', async () => {
    const { nav, tree } = renderCreate();
    await act(async () => { tree.root.findByProps({ testID: 'create-home-submit' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'create-home-error' }).props.children).toBe('Name required');
    act(() => { tree.root.findByProps({ testID: 'create-home-name' }).props.onChangeText('  Studio  '); });
    await act(async () => { tree.root.findByProps({ testID: 'create-home-submit' }).props.onPress(); });
    expect(createHome).toHaveBeenCalledWith({ name: 'Studio' });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('edits the home name and updates through the mutation', async () => {
    const { tree } = renderDetail();
    act(() => { tree.root.findByProps({ testID: 'home-detail-edit' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'home-detail-name-input' }).props.onChangeText('  Renamed Home  '); });
    await act(async () => { tree.root.findByProps({ testID: 'home-detail-edit' }).props.onPress(); });
    expect(updateHome).toHaveBeenCalledWith('home-1', { name: 'Renamed Home' });
  });

  it('requires confirmation, deletes the home, then navigates back', async () => {
    const { nav, tree } = renderDetail();
    act(() => { tree.root.findByProps({ testID: 'home-detail-delete' }).props.onPress(); });
    let confirm = tree.root.findAllByType(Text).find(node => node.props.children === 'Delete')?.parent;
    while (confirm !== null && confirm !== undefined && typeof confirm.props.onPress !== 'function') confirm = confirm.parent;
    expect(confirm).toBeTruthy();
    await act(async () => { confirm?.props.onPress(); });
    expect(deleteHome).toHaveBeenCalledWith('home-1');
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('renders loading and unavailable-home states', () => {
    mockHomesQuery.mockReturnValue({ data: undefined, isLoading: true } as never);
    expect(renderDetail().tree.root.findByProps({ testID: 'home-detail-loading' })).toBeTruthy();
    mockHomesQuery.mockReturnValue({ data: [], isLoading: false, isError: true, error: new Error('Offline') } as never);
    expect(renderDetail().tree.root.findByProps({ testID: 'home-detail-error' })).toBeTruthy();
  });

  it('renders room loading, empty, error/retry, and owner room actions', () => {
    mockRoomsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    expect(renderDetail().tree.root.findByProps({ testID: 'room-list-loading' })).toBeTruthy();

    mockRoomsQuery.mockReturnValue({ data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const empty = renderDetail();
    expect(empty.tree.root.findByProps({ testID: 'room-list-empty' })).toBeTruthy();
    act(() => { empty.tree.root.findByProps({ testID: 'room-add' }).props.onPress(); });
    expect(empty.nav.navigate).toHaveBeenCalledWith('RoomForm', { homeId: 'home-1' });

    const retry = jest.fn().mockResolvedValue(undefined);
    mockRoomsQuery.mockReturnValue({ data: undefined, error: new Error('Offline'), isLoading: false, isError: true, isRefetching: false, refetch: retry } as never);
    const errored = renderDetail();
    expect(errored.tree.root.findByProps({ testID: 'room-list-error' })).toBeTruthy();
    act(() => { errored.tree.root.findByProps({ accessibilityLabel: 'Retry rooms' }).props.onPress(); });
    expect(retry).toHaveBeenCalled();
  });

  it('opens the Flutter warning before deleting a room', () => {
    const deleteRoom = jest.fn().mockResolvedValue(undefined);
    mockRoomMutations.mockReturnValue({ deleteRoom, isDeleting: false } as never);
    mockRoomsQuery.mockReturnValue({ data: [{ id: 'room-1', homeId: 'home-1', name: 'Living room', icon: null }], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never);
    const { tree } = renderDetail();
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Delete Living room' }).props.onPress(); });
    expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Devices assigned to this room will remain in the home but lose the room assignment.')).toBe(true);
  });

  it('blocks room and household mutations for a non-owner', () => {
    useSessionStore.setState({ user: { id: 'member-1', email: 'member@example.com', displayName: null } as never });
    mockHomesQuery.mockReturnValue({ data: [{ ...existing, ownerId: 'owner-1' }], isLoading: false, isError: false } as never);
    const { tree } = renderDetail();
    expect(tree.root.findAllByProps({ testID: 'room-add' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'member-invite' })).toHaveLength(0);
  });
});

describe('home mutation cache helpers', () => {
  it('adds, updates, and removes home cache entries', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['homes'], [existing]);
    addHomeToCache(queryClient, created);
    expect(queryClient.getQueryData(['homes'])).toEqual([existing, created]);
    updateHomeInCache(queryClient, { ...created, name: 'Studio Home' });
    expect(queryClient.getQueryData(['homes'])).toEqual([existing, expect.objectContaining({ name: 'Studio Home' })]);
    expect(removeHomeFromCache(queryClient, existing.id)).toEqual([expect.objectContaining({ id: created.id })]);
    queryClient.clear();
  });
});
