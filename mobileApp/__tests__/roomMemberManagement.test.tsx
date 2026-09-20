import { QueryClient } from '@tanstack/react-query';
import renderer, { act } from 'react-test-renderer';

jest.mock('../src/features/home/room/hooks/useRoomMutations', () => ({
  ...jest.requireActual('../src/features/home/room/hooks/useRoomMutations'),
  useRoomMutations: jest.fn(),
}));
jest.mock('../src/features/home/member/hooks/useMemberMutations', () => ({
  useMemberMutations: jest.fn(),
}));

import { MemberInviteScreen } from '../src/features/home/member/MemberInviteScreen';
import { addRoomToCache, removeRoomFromCache, updateRoomInCache, useRoomMutations } from '../src/features/home/room/hooks/useRoomMutations';
import { RoomFormScreen } from '../src/features/home/room/RoomFormScreen';
import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import { useMemberMutations } from '../src/features/home/member/hooks/useMemberMutations';

const mockRoomMutations = useRoomMutations as jest.MockedFunction<typeof useRoomMutations>;
const mockMemberMutations = useMemberMutations as jest.MockedFunction<typeof useMemberMutations>;
const trees: renderer.ReactTestRenderer[] = [];
const createRoom = jest.fn().mockResolvedValue({ id: 'room-2', homeId: 'home-1', name: 'Bedroom', icon: null });
const updateRoom = jest.fn().mockResolvedValue({ id: 'room-1', homeId: 'home-1', name: 'Office', icon: null });
const inviteMember = jest.fn().mockResolvedValue(undefined);

function navigation() { return { goBack: jest.fn() }; }

function renderRoomForm(params: { homeId: string; roomId?: string; roomName?: string } = { homeId: 'home-1' }) {
  const nav = navigation();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<RoomFormScreen navigation={nav as never} route={{ params } as never} />); });
  trees.push(tree!);
  return { nav, tree: tree! };
}

function renderInvite() {
  const nav = navigation();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MemberInviteScreen navigation={nav as never} route={{ params: { homeId: 'home-1' } } as never} />); });
  trees.push(tree!);
  return { nav, tree: tree! };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomMutations.mockReturnValue({ createRoom, isCreating: false, isDeleting: false, isUpdating: false, updateRoom } as never);
  mockMemberMutations.mockReturnValue({ inviteMember, isInviting: false } as never);
});

afterEach(() => { act(() => { trees.splice(0).forEach(tree => tree.unmount()); }); });

describe('room form', () => {
  it('requires a name, creates a trimmed room, and returns on success', async () => {
    const { nav, tree } = renderRoomForm();
    await act(async () => { tree.root.findByProps({ testID: 'room-form-submit' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'room-form-error' }).props.children).toBe('Room name required');
    act(() => { tree.root.findByProps({ testID: 'room-form-name' }).props.onChangeText('  Bedroom  '); });
    await act(async () => { tree.root.findByProps({ testID: 'room-form-submit' }).props.onPress(); });
    expect(createRoom).toHaveBeenCalledWith({ name: 'Bedroom' });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('shows API failure and retries the same edit request', async () => {
    updateRoom.mockRejectedValueOnce(new Error('Offline'));
    const { tree } = renderRoomForm({ homeId: 'home-1', roomId: 'room-1', roomName: 'Office' });
    await act(async () => { tree.root.findByProps({ testID: 'room-form-submit' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'room-form-error' }).props.children).toBe('Offline');
    await act(async () => { tree.root.findByProps({ testID: 'room-form-submit' }).props.onPress(); });
    expect(updateRoom).toHaveBeenLastCalledWith('room-1', { name: 'Office' });
  });
});

describe('household invite', () => {
  it('validates email, posts a normalized invite, and shows Flutter success feedback', async () => {
    const { nav, tree } = renderInvite();
    await act(async () => { tree.root.findByProps({ testID: 'member-invite-submit' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'member-invite-error' }).props.children).toBe('Enter a valid email address.');
    act(() => { tree.root.findByProps({ testID: 'member-invite-email' }).props.onChangeText('  MEMBER@EXAMPLE.COM '); });
    await act(async () => { tree.root.findByProps({ testID: 'member-invite-submit' }).props.onPress(); });
    expect(inviteMember).toHaveBeenCalledWith({ email: 'member@example.com' });
    expect(tree.root.findByProps({ testID: 'member-invite-success' }).props.children).toBe('Invitation sent if the account exists.');
    await act(async () => { tree.root.findByProps({ testID: 'member-invite-submit' }).props.onPress(); });
    expect(nav.goBack).toHaveBeenCalled();
  });
});

describe('room cache reconciliation', () => {
  it('patches only the selected home room list for create, rename, and delete', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(homeQueryKeys.rooms('home-1'), [{ id: 'room-1', homeId: 'home-1', name: 'Living room', icon: null }]);
    addRoomToCache(client, 'home-1', { id: 'room-2', homeId: 'home-1', name: 'Bedroom', icon: null });
    updateRoomInCache(client, 'home-1', { id: 'room-1', homeId: 'home-1', name: 'Lounge', icon: null });
    removeRoomFromCache(client, 'home-1', 'room-2');
    expect(client.getQueryData(homeQueryKeys.rooms('home-1'))).toEqual([{ id: 'room-1', homeId: 'home-1', name: 'Lounge', icon: null }]);
    expect(client.getQueryData(homeQueryKeys.rooms('home-2'))).toBeUndefined();
    client.clear();
  });
});
