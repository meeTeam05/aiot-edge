import renderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';

jest.mock('../src/features/device/ota/hooks/useDeviceOta', () => ({
  useDeviceOtaQuery: jest.fn(),
  useOtaRealtimeProgressQuery: jest.fn(),
  useOtaRequestMutation: jest.fn(),
}));

import { OtaScreen } from '../src/features/device/ota/OtaScreen';
import { useDeviceOtaQuery, useOtaRealtimeProgressQuery, useOtaRequestMutation } from '../src/features/device/ota/hooks/useDeviceOta';

const mockCatalogQuery = useDeviceOtaQuery as jest.MockedFunction<typeof useDeviceOtaQuery>;
const mockProgressQuery = useOtaRealtimeProgressQuery as jest.MockedFunction<typeof useOtaRealtimeProgressQuery>;
const mockRequestMutation = useOtaRequestMutation as jest.MockedFunction<typeof useOtaRequestMutation>;
const mutateAsync = jest.fn().mockResolvedValue({ deviceId: 'device-1', version: '1.1.0', filename: 'smart-air-1.1.0.bin', status: 'accepted' });
const refetch = jest.fn().mockResolvedValue(undefined);
const mountedTrees: renderer.ReactTestRenderer[] = [];
const catalog = {
  deviceId: 'device-1',
  currentVersion: '1.0.0',
  deviceOnline: true,
  versions: [
    { version: '1.0.0', filename: 'smart-air-1.0.0.bin', url: 'https://example.test/ota/1.0.0.bin' },
    { version: '1.1.0', filename: 'smart-air-1.1.0.bin', url: 'https://example.test/ota/1.1.0.bin' },
  ],
};

function renderOta(navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() }) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<OtaScreen navigation={navigation as never} route={{ params: { deviceId: 'device-1' } } as never} />); });
  mountedTrees.push(tree!);
  return { navigation, tree: tree! };
}

function textContent(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join(' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalogQuery.mockReturnValue({ data: catalog, error: null, isError: false, isLoading: false, refetch } as never);
  mockProgressQuery.mockReturnValue({ data: null } as never);
  mockRequestMutation.mockReturnValue({ isPending: false, mutateAsync } as never);
});

afterEach(() => { act(() => { mountedTrees.splice(0).forEach(tree => tree.unmount()); }); });

describe('Flutter OTA UI', () => {
  it('renders the firmware/status card, catalog versions, and current-version badge', () => {
    const { tree } = renderOta();
    expect(textContent(tree)).toContain('Current firmware');
    expect(textContent(tree)).toContain('Online');
    expect(textContent(tree)).toContain('1.0.0');
    expect(textContent(tree)).toContain('smart-air-1.1.0.bin');
    expect(tree.root.findByProps({ testID: 'ota-current-1.0.0' })).toBeTruthy();
  });

  it('renders Flutter-equivalent loading, retryable error, and empty catalog states', () => {
    mockCatalogQuery.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: true, refetch } as never);
    expect(renderOta().tree.root.findByProps({ testID: 'ota-loading' })).toBeTruthy();

    mockCatalogQuery.mockReturnValue({ data: undefined, error: new Error('Offline'), isError: true, isLoading: false, refetch } as never);
    const errorTree = renderOta().tree;
    expect(textContent(errorTree)).toContain('Failed to load OTA versions');
    act(() => { errorTree.root.findByProps({ testID: 'ota-retry' }).props.onPress(); });
    expect(refetch).toHaveBeenCalled();

    mockCatalogQuery.mockReturnValue({ data: { ...catalog, currentVersion: null, deviceOnline: false, versions: [] }, error: null, isError: false, isLoading: false, refetch } as never);
    const emptyTree = renderOta().tree;
    expect(textContent(emptyTree)).toContain('No OTA versions found');
    expect(textContent(emptyTree)).toContain('Offline');
  });

  it('requests the selected version and confirms server acceptance without claiming completion', async () => {
    const { tree } = renderOta();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => { tree.root.findByProps({ testID: 'ota-update-1.1.0' }).props.onPress(); });
    expect(mutateAsync).toHaveBeenCalledWith('1.1.0');
    expect(alert).toHaveBeenCalledWith('Firmware update requested', 'OTA update requested for 1.1.0');
    expect(textContent(tree)).not.toContain('completed');
    alert.mockRestore();
  });

  it('renders downloading, rebooting, and failed realtime OTA states', () => {
    mockProgressQuery.mockReturnValue({ data: { eventId: null, state: 'accepted', progress: null, occurredAt: new Date(), errorMessage: null, requestedVersion: '1.1.0' } } as never);
    const accepted = renderOta().tree;
    expect(accepted.root.findByProps({ testID: 'ota-progress-accepted' })).toBeTruthy();
    expect(textContent(accepted)).toContain('Waiting for firmware progress');

    mockProgressQuery.mockReturnValue({ data: { eventId: 'ota-1', state: 'downloading', progress: 40, occurredAt: new Date(), requestedVersion: '1.1.0' } } as never);
    const downloading = renderOta().tree;
    expect(downloading.root.findByProps({ testID: 'ota-progress-downloading' })).toBeTruthy();
    expect(textContent(downloading)).toContain('Downloading firmware: 40%');

    mockProgressQuery.mockReturnValue({ data: { eventId: 'ota-2', state: 'waiting_reboot', progress: 100, occurredAt: new Date(), requestedVersion: '1.1.0' } } as never);
    const rebooting = renderOta().tree;
    expect(rebooting.root.findByProps({ testID: 'ota-progress-waiting_reboot' })).toBeTruthy();
    expect(textContent(rebooting)).toContain('Device is rebooting to finish the update.');

    mockProgressQuery.mockReturnValue({ data: { eventId: 'ota-3', state: 'failed', progress: 0, occurredAt: new Date(), requestedVersion: '1.1.0' } } as never);
    const failed = renderOta().tree;
    expect(failed.root.findByProps({ testID: 'ota-progress-failed' })).toBeTruthy();
    expect(textContent(failed)).toContain('Device reported an OTA failure.');
  });

  it('shows a retryable OTA request failure without claiming firmware completion', async () => {
    mockProgressQuery.mockReturnValue({ data: { eventId: null, state: 'failed', progress: null, occurredAt: new Date(), errorMessage: 'device offline', requestedVersion: '1.1.0' } } as never);
    const { tree } = renderOta();
    expect(textContent(tree)).toContain('device offline');
    await act(async () => { tree.root.findByProps({ testID: 'ota-progress-retry' }).props.onPress(); });
    expect(mutateAsync).toHaveBeenCalledWith('1.1.0');
  });
});
