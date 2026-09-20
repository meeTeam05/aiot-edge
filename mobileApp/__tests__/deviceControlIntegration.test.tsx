import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/device/hooks/useDeviceCommandMutations', () => ({
  useModeCommandMutation: jest.fn(),
  useRelayCommandMutation: jest.fn(),
}));

import { useDeviceControls } from '../src/features/device/hooks/useDeviceControls';
import { useModeCommandMutation, useRelayCommandMutation } from '../src/features/device/hooks/useDeviceCommandMutations';

const relayMutation = useRelayCommandMutation as jest.MockedFunction<typeof useRelayCommandMutation>;
const modeMutation = useModeCommandMutation as jest.MockedFunction<typeof useModeCommandMutation>;

let controls: ReturnType<typeof useDeviceControls> | null = null;
let submittedAt: Date;

function Probe({ commands = [], shadow = { reported: { mode: 'on', relay_1: false, relay_2: false, relay_3: false }, desired: {}, updatedAt: null } }: { commands?: never[] | Array<{ id: string; payload: Record<string, unknown>; status: 'pending' | 'sent' | 'done' | 'error' | 'timeout'; createdAt: Date; executedAt: Date | null; errorMessage: string | null }>; shadow?: { reported: Record<string, unknown>; desired: Record<string, unknown>; updatedAt: Date | null } }) {
  controls = useDeviceControls({ commands, deviceId: 'device-1', refetchShadow: jest.fn(() => Promise.resolve()), shadow });
  return <Text>{`${controls.fan.state}/${controls.mode.state}`}</Text>;
}

function mutationStub(mutateAsync: jest.Mock) {
  return { mutateAsync } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  submittedAt = new Date();
  relayMutation.mockReturnValue(mutationStub(jest.fn().mockResolvedValue({ commandId: 'relay-1', status: 'pending', submittedAt })));
  modeMutation.mockReturnValue(mutationStub(jest.fn().mockResolvedValue({ commandId: 'mode-1', status: 'pending', submittedAt })));
});

describe('Device control command and reported-shadow reconciliation', () => {
  it('submits one relay, disables only that control, and waits for reported shadow without an optimistic update', async () => {
    const shadow = { reported: { mode: 'on', relay_1: false, relay_2: false, relay_3: false }, desired: {}, updatedAt: null };
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<Probe shadow={shadow} />); });
    await act(async () => { await controls?.fan.submit(true); });
    expect(controls?.fan.state).toBe('pending');
    expect(controls?.fan.isPending).toBe(true);
    expect(controls?.lamp.isPending).toBe(false);
    expect(shadow.reported.relay_1).toBe(false);

    await act(async () => { tree!.update(<Probe commands={[{ id: 'relay-1', payload: {}, status: 'done', createdAt: submittedAt, executedAt: submittedAt, errorMessage: null }]} shadow={shadow} />); });
    expect(controls?.fan.state).toBe('waiting-for-device');
    expect(shadow.reported.relay_1).toBe(false);

    await act(async () => { tree!.update(<Probe commands={[{ id: 'relay-1', payload: {}, status: 'done', createdAt: submittedAt, executedAt: submittedAt, errorMessage: null }]} shadow={{ ...shadow, reported: { ...shadow.reported, relay_1: true } }} />); });
    expect(controls?.fan.state).toBe('success');
    expect(controls?.fan.isPending).toBe(false);
    await act(async () => { tree!.unmount(); });
  });

  it('surfaces a relay command failure and handles command.updated errors', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<Probe />); });
    await act(async () => { await controls?.fan.submit(true); });
    await act(async () => { tree!.update(<Probe commands={[{ id: 'relay-1', payload: {}, status: 'error', createdAt: submittedAt, executedAt: submittedAt, errorMessage: 'Relay fault' }]} />); });
    expect(controls?.fan.state).toBe('failure');
    expect(controls?.fan.errorMessage).toBe('Relay fault');
    await act(async () => { tree!.unmount(); });
  });

  it('keeps a mode command pending until its reported mode changes', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<Probe />); });
    await act(async () => { await controls?.mode.submit('off'); });
    expect(controls?.mode.state).toBe('pending');
    await act(async () => { tree!.update(<Probe commands={[{ id: 'mode-1', payload: {}, status: 'done', createdAt: submittedAt, executedAt: submittedAt, errorMessage: null }]} />); });
    expect(controls?.mode.state).toBe('waiting-for-device');
    await act(async () => { tree!.unmount(); });
  });

  it('shows the queued state after Flutter’s five-second pending timeout', async () => {
    jest.useFakeTimers();
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<Probe />); });
    await act(async () => { await controls?.fan.submit(true); });
    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(controls?.fan.state).toBe('queued');
    jest.useRealTimers();
    await act(async () => { tree!.unmount(); });
  });
});
