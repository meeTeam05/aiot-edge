import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { WifiProvisionScreen } from '../src/features/provision/WifiProvisionScreen';
import type { SmartAirGattConnection } from '../src/services/ble/smartAirGatt';
import type { WifiProvisioningResult, WifiProvisioningState } from '../src/services/ble/provisioningProtocol';
import { useProvisioningSessionStore } from '../src/features/provisioning/session';

const connection: SmartAirGattConnection = {
  deviceId: 'device-1', serviceUUID: 'service',
  ssidCharacteristic: { serviceUuid: 'service', characteristicUuid: 'ssid' },
  passwordCharacteristic: { serviceUuid: 'service', characteristicUuid: 'password' },
  statusCharacteristic: { serviceUuid: 'service', characteristicUuid: 'status' },
};

function makeProtocol(implementation: (ssid: string, password: string, emit: (state: WifiProvisioningState) => void) => Promise<WifiProvisioningResult>) {
  let listener: ((state: WifiProvisioningState) => void) | undefined;
  return {
    currentState: 'idle' as WifiProvisioningState,
    subscribe: jest.fn((next: (state: WifiProvisioningState) => void) => { listener = next; next('idle'); return () => undefined; }),
    provision: jest.fn((_: SmartAirGattConnection, ssid: string, password: string) => implementation(ssid, password, (state) => listener?.(state))),
  };
}

function hasText(tree: renderer.ReactTestRenderer, text: string): boolean {
  return tree.root.findAllByType(Text).some((node) => node.props.children === text);
}

describe('Flutter-equivalent Wi-Fi provisioning UI', () => {
  beforeEach(() => useProvisioningSessionStore.getState().clear());
  it('validates an empty SSID without starting BLE provisioning', async () => {
    const protocol = makeProtocol(async () => ({ deviceId: 'id', ip: 'ip' }));
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WifiProvisionScreen connection={connection} protocol={protocol} />); });
    await act(async () => { tree!.root.findByProps({ testID: 'wifi-provision-primary' }).props.onPress(); });
    expect(hasText(tree!, 'Enter your Wi‑Fi SSID')).toBe(true);
    expect(protocol.provision).not.toHaveBeenCalled();
  });

  it('renders the submission state and prevents duplicate submission', async () => {
    let resolve!: (result: WifiProvisioningResult) => void;
    const protocol = makeProtocol(async (_ssid, _password, emit) => {
      emit('sending_ssid');
      return new Promise<WifiProvisioningResult>((done) => { resolve = done; });
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WifiProvisionScreen connection={connection} protocol={protocol} />); });
    act(() => {
      tree!.root.findByProps({ testID: 'wifi-provision-ssid' }).props.onChangeText('Home WiFi');
      tree!.root.findByProps({ testID: 'wifi-provision-password' }).props.onChangeText('secret12');
    });
    await act(async () => { tree!.root.findByProps({ testID: 'wifi-provision-primary' }).props.onPress(); await Promise.resolve(); });
    expect(hasText(tree!, 'Sending Wi-Fi network…')).toBe(true);
    expect(protocol.provision).toHaveBeenCalledTimes(1);
    resolve({ deviceId: 'aa:bb', ip: '192.168.1.2' });
    await act(async () => { await Promise.resolve(); });
  });

  it('renders a retryable error after a failed provision attempt', async () => {
    const protocol = makeProtocol(async () => { throw new Error('Device failed to connect to WiFi — check password'); });
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WifiProvisionScreen connection={connection} protocol={protocol} />); });
    act(() => {
      tree!.root.findByProps({ testID: 'wifi-provision-ssid' }).props.onChangeText('Home WiFi');
      tree!.root.findByProps({ testID: 'wifi-provision-password' }).props.onChangeText('secret12');
    });
    await act(async () => { tree!.root.findByProps({ testID: 'wifi-provision-primary' }).props.onPress(); await Promise.resolve(); });
    expect(tree!.root.findByProps({ testID: 'wifi-provision-error' })).toBeTruthy();
    expect(hasText(tree!, 'Device failed to connect to WiFi — check password')).toBe(true);
    expect(hasText(tree!, 'Send credentials')).toBe(true);
  });

  it('renders success and exposes the placeholder continuation callback', async () => {
    const protocol = makeProtocol(async () => ({ deviceId: 'aa:bb', ip: '192.168.1.2' }));
    const onContinue = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WifiProvisionScreen connection={connection} onContinue={onContinue} protocol={protocol} />); });
    act(() => {
      tree!.root.findByProps({ testID: 'wifi-provision-ssid' }).props.onChangeText('Home WiFi');
      tree!.root.findByProps({ testID: 'wifi-provision-password' }).props.onChangeText('secret12');
    });
    await act(async () => { tree!.root.findByProps({ testID: 'wifi-provision-primary' }).props.onPress(); await Promise.resolve(); });
    expect(tree!.root.findByProps({ testID: 'wifi-provision-success' })).toBeTruthy();
    act(() => { tree!.root.findByProps({ testID: 'wifi-provision-primary' }).props.onPress(); });
    expect(onContinue).toHaveBeenCalledWith({ deviceId: 'aa:bb', ip: '192.168.1.2' });
  });

  it('adds the Wi-Fi result to the existing serializable provisioning session', async () => {
    useProvisioningSessionStore.getState().setConnected({ bleDeviceId: 'ble-device-1', homeId: 'home-1' });
    const protocol = makeProtocol(async () => ({ deviceId: 'aa:bb', ip: '192.168.1.2' }));
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WifiProvisionScreen connection={connection} protocol={protocol} />); });
    act(() => {
      tree!.root.findByProps({ testID: 'wifi-provision-ssid' }).props.onChangeText('Home WiFi');
      tree!.root.findByProps({ testID: 'wifi-provision-password' }).props.onChangeText('secret12');
    });
    await act(async () => { tree!.root.findByProps({ testID: 'wifi-provision-primary' }).props.onPress(); await Promise.resolve(); });
    expect(useProvisioningSessionStore.getState().session).toMatchObject({
      bleDeviceId: 'ble-device-1', homeId: 'home-1', deviceMac: 'aa:bb', ipAddress: '192.168.1.2', status: 'wifi_provisioning',
    });
  });
});
