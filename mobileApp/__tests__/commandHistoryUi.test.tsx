import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/device/commands/hooks/useCommandHistory', () => ({
  useCommandHistoryQuery: jest.fn(),
}));

import { CommandHistoryScreen } from '../src/features/device/commands/CommandHistoryScreen';
import { useCommandHistoryQuery } from '../src/features/device/commands/hooks/useCommandHistory';

const mockHistoryQuery = useCommandHistoryQuery as jest.MockedFunction<typeof useCommandHistoryQuery>;
const refresh = jest.fn().mockResolvedValue(undefined);
const mountedTrees: renderer.ReactTestRenderer[] = [];
const commands = [
  { id: 'relay-1', payload: { type: 'relay_set', relay: 1, state: true }, status: 'done' as const, createdAt: new Date(Date.now() - 30_000), executedAt: null, errorMessage: null },
  { id: 'mode-1', payload: { type: 'device_mode', mode: 'off' }, status: 'pending' as const, createdAt: new Date(Date.now() - 90_000), executedAt: null, errorMessage: null },
  { id: 'failed-1', payload: { type: 'calibrate_co' }, status: 'error' as const, createdAt: new Date(Date.now() - 120_000), executedAt: null, errorMessage: null },
];

function renderHistory(navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() }) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<CommandHistoryScreen navigation={navigation as never} route={{ params: { deviceId: 'device-1' } } as never} />); });
  mountedTrees.push(tree!);
  return { navigation, tree: tree! };
}

function textContent(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join(' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistoryQuery.mockReturnValue({ commands, isError: false, isLoading: false, isRefetching: false, refresh } as never);
});

afterEach(() => {
  act(() => { mountedTrees.splice(0).forEach(tree => tree.unmount()); });
});

describe('Flutter Command History UI', () => {
  it('returns to the device dashboard from its stack route', () => {
    const { navigation, tree } = renderHistory();
    act(() => { tree.root.findByProps({ testID: 'command-history-back' }).props.onPress(); });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('renders Flutter filters and filters the command list client-side', () => {
    const { tree } = renderHistory();
    expect(textContent(tree)).toContain('Relay 1: ON');
    expect(textContent(tree)).toContain('Mode: off');
    act(() => { tree.root.findByProps({ testID: 'command-filter-failed' }).props.onPress(); });
    expect(textContent(tree)).toContain('Calibrate CO sensor');
    expect(textContent(tree)).not.toContain('Relay 1: ON');
  });

  it('renders loading, empty, and retryable error states', () => {
    mockHistoryQuery.mockReturnValue({ commands: [], isError: false, isLoading: true, isRefetching: false, refresh } as never);
    expect(renderHistory().tree.root.findByProps({ testID: 'command-history-loading' })).toBeTruthy();

    mockHistoryQuery.mockReturnValue({ commands: [], isError: false, isLoading: false, isRefetching: false, refresh } as never);
    expect(textContent(renderHistory().tree)).toContain('No commands yet');

    mockHistoryQuery.mockReturnValue({ commands: [], error: new Error('Offline'), isError: true, isLoading: false, isRefetching: false, refresh } as never);
    const { tree } = renderHistory();
    expect(textContent(tree)).toContain('Unable to load command history');
    act(() => { tree.root.findByProps({ testID: 'command-history-retry' }).props.onPress(); });
    expect(refresh).toHaveBeenCalled();
  });

  it('opens a selectable payload sheet for a command row', () => {
    const { tree } = renderHistory();
    act(() => { tree.root.findByProps({ testID: 'command-row-relay-1' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'command-payload-sheet' })).toBeTruthy();
    expect(textContent(tree)).toContain('type: relay_set');
    expect(textContent(tree)).toContain('state: true');
  });
});
