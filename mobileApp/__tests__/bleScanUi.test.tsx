import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff', Resetting: 'Resetting', Unauthorized: 'Unauthorized', Unknown: 'Unknown', Unsupported: 'Unsupported' },
}));

import { BleScanScreen, SCAN_TIMEOUT_MS, sortAndMergeDevices } from '../src/features/provision/BleScanScreen';
import { checkBlePreflight } from '../src/features/provision/bleScanState';
import type { BleAdapter, BleScanDevice } from '../src/services/ble/bleTypes';
import { provisioningBleRegistry, useProvisioningSessionStore } from '../src/features/provisioning/session';
import type { SmartAirGattConnection } from '../src/services/ble/smartAirGatt';

function makeAdapter(): BleAdapter {
  return {
    getState: jest.fn(async () => 'poweredOn'),
    requestPermissions: jest.fn(async () => ({ status: 'granted', requestedPermissions: [] })),
    startScan: jest.fn(async () => undefined),
    stopScan: jest.fn(async () => undefined),
    connect: jest.fn(), disconnect: jest.fn(), discoverServices: jest.fn(), requestMtu: jest.fn(), writeCharacteristic: jest.fn(), subscribeToCharacteristic: jest.fn(), destroy: jest.fn(),
  } as unknown as BleAdapter;
}

const navigation = { goBack: jest.fn() } as never;
const route = { key: 'scan', name: 'ProvisionScan', params: { homeId: 'home-1' } } as never;

function hasText(tree: renderer.ReactTestRenderer, text: string): boolean {
  return tree.root.findAllByType(Text).some((node) => node.props.children === text);
}

describe('Flutter-equivalent BLE scan step', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await provisioningBleRegistry.clear();
    useProvisioningSessionStore.getState().clear();
  });

  afterEach(() => jest.useRealTimers());

  it('filters, de-duplicates, and sorts Smart Air results by RSSI', () => {
    const weak: BleScanDevice = { id: 'weak', name: 'SMART_AIR_WEAK', rssi: -82 };
    const strong: BleScanDevice = { id: 'strong', name: 'SmartAir-legacy', rssi: -48 };
    expect(sortAndMergeDevices([], { id: 'other', name: 'Other', rssi: -20 })).toEqual([]);
    expect(sortAndMergeDevices([weak], strong)).toEqual([strong, weak]);
    expect(sortAndMergeDevices([weak], weak)).toEqual([weak]);
  });

  it('preserves Flutter preflight blocker ordering', async () => {
    const adapter = makeAdapter();
    (adapter.requestPermissions as jest.Mock).mockResolvedValue({ status: 'blocked', requestedPermissions: [] });
    await expect(checkBlePreflight({ adapter })).resolves.toBe('permissionPermanentlyDenied');

    (adapter.requestPermissions as jest.Mock).mockResolvedValue({ status: 'granted', requestedPermissions: [] });
    (adapter.getState as jest.Mock).mockResolvedValue('poweredOff');
    await expect(checkBlePreflight({ adapter })).resolves.toBe('bluetoothOff');

    (adapter.getState as jest.Mock).mockResolvedValue('poweredOn');
    await expect(checkBlePreflight({ adapter, requiresLegacyLocationService: true, isLegacyLocationServiceEnabled: async () => false })).resolves.toBe('locationOff');
  });

  it('renders scan state, receives matching devices, and ends the scan after 12 seconds', async () => {
    jest.useFakeTimers();
    const adapter = makeAdapter();
    let onDevice: ((device: BleScanDevice) => void) | undefined;
    (adapter.startScan as jest.Mock).mockImplementation(async (deviceCallback: (device: BleScanDevice) => void) => { onDevice = deviceCallback; });
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<BleScanScreen adapter={adapter} navigation={navigation} route={route} />); });
    expect(tree!.root.findByProps({ testID: 'provision-scan-ready' })).toBeTruthy();

    await act(async () => {
      tree!.root.findByProps({ testID: 'provision-scan-primary' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasText(tree!, 'Scanning…')).toBe(true);
    act(() => {
      onDevice?.({ id: 'weak', name: 'SMART_AIR_WEAK', rssi: -80 });
      onDevice?.({ id: 'strong', name: 'SmartAir-legacy', rssi: -40 });
      onDevice?.({ id: 'weak', name: 'SMART_AIR_WEAK', rssi: -20 });
      onDevice?.({ id: 'ignore', name: 'Not Smart Air', rssi: -10 });
    });
    (adapter.stopScan as jest.Mock).mockClear();
    act(() => jest.advanceTimersByTime(SCAN_TIMEOUT_MS));
    expect(adapter.stopScan).toHaveBeenCalledTimes(1);
    expect([...new Set(tree!.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('provision-scan-device-')).map((node) => node.props.testID))]).toEqual([
      'provision-scan-device-strong',
      'provision-scan-device-weak',
    ]);
    expect(hasText(tree!, 'Scan')).toBe(true);
  });

  it('renders Flutter-equivalent permission error copy', async () => {
    const adapter = makeAdapter();
    (adapter.requestPermissions as jest.Mock).mockResolvedValue({ status: 'blocked', requestedPermissions: [] });
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<BleScanScreen adapter={adapter} navigation={navigation} route={route} />); });
    await act(async () => {
      tree!.root.findByProps({ testID: 'provision-scan-primary' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasText(tree!, 'Bluetooth permission blocked')).toBe(true);
    expect(hasText(tree!, 'Open app settings and allow Bluetooth access, then check again.')).toBe(true);
  });

  it('persists the ready device identity before navigating to Wi-Fi provisioning', async () => {
    jest.useFakeTimers();
    const adapter = makeAdapter();
    let onDevice: ((device: BleScanDevice) => void) | undefined;
    (adapter.startScan as jest.Mock).mockImplementation(async (deviceCallback: (device: BleScanDevice) => void) => { onDevice = deviceCallback; });
    const readyConnection: SmartAirGattConnection = {
      deviceId: 'ble-device-1', serviceUUID: 'service',
      ssidCharacteristic: { serviceUuid: 'service', characteristicUuid: 'ssid' },
      passwordCharacteristic: { serviceUuid: 'service', characteristicUuid: 'password' },
      statusCharacteristic: { serviceUuid: 'service', characteristicUuid: 'status' },
    };
    const service = {
      currentState: 'idle',
      subscribe: jest.fn((listener: (state: 'idle') => void) => { listener('idle'); return () => undefined; }),
      connect: jest.fn(async () => readyConnection),
      activeConnection: readyConnection,
      disconnect: jest.fn(async () => undefined),
    };
    const scanNavigation = { goBack: jest.fn(), navigate: jest.fn() } as never;
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<BleScanScreen adapter={adapter} navigation={scanNavigation} provisioningConnection={service as never} route={route} />); });
    await act(async () => {
      tree!.root.findByProps({ testID: 'provision-scan-primary' }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      onDevice?.({ id: 'ble-device-1', name: 'SMART_AIR_1', rssi: -40 });
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(SCAN_TIMEOUT_MS));
    await act(async () => {
      tree!.root.findByProps({ testID: 'provision-scan-device-ble-device-1' }).props.onPress();
      await Promise.resolve();
    });

    expect(useProvisioningSessionStore.getState().session).toMatchObject({ bleDeviceId: 'ble-device-1', homeId: 'home-1', status: 'connected' });
    expect((scanNavigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('WifiProvision');
  });
});
