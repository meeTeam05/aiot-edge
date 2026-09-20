import renderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';

jest.mock('../src/features/device/settings/hooks/useDeviceSettings', () => ({ useDeviceSettings: jest.fn() }));

import { DeviceSettingsScreen } from '../src/features/device/settings/DeviceSettingsScreen';
import { useDeviceSettings } from '../src/features/device/settings/hooks/useDeviceSettings';

const mockSettings = useDeviceSettings as jest.MockedFunction<typeof useDeviceSettings>;
const updateDevice = jest.fn().mockResolvedValue(undefined);
const deleteDevice = jest.fn().mockResolvedValue(undefined);
const device = { id: 'device-1', name: 'Living Room Purifier', homeId: 'home-1', roomId: 'room-1', online: true, lastSeen: null, firmwareVer: '1.2.3', mode: null, relay1: null, relay2: null, relay3: null, createdAt: null };
const mountedTrees: renderer.ReactTestRenderer[] = [];

function renderSettings(navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() }) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<DeviceSettingsScreen navigation={navigation as never} route={{ params: { deviceId: 'device-1' } } as never} />); });
  mountedTrees.push(tree!);
  return { navigation, tree: tree! };
}
function textContent(tree: renderer.ReactTestRenderer): string { return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join(' '); }

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.mockReturnValue({ deleteDevice, deleteError: null, device, deviceError: null, isDeleting: false, isLoading: false, isUpdating: false, rooms: [{ id: 'room-1', homeId: 'home-1', name: 'Living Room', icon: null }, { id: 'room-2', homeId: 'home-1', name: 'Kitchen', icon: null }], roomsError: null, roomsLoading: false, updateDevice } as never);
});
afterEach(() => { act(() => { mountedTrees.splice(0).forEach(tree => tree.unmount()); }); });

describe('Flutter Device Settings UI', () => {
  it('returns to Device Detail and renders populated General, entry, and danger sections', () => {
    const { navigation, tree } = renderSettings();
    expect(textContent(tree)).toContain('Device name');
    expect(textContent(tree)).toContain('Sensor calibration');
    expect(textContent(tree)).toContain('Danger zone');
    act(() => { tree.root.findByProps({ testID: 'device-settings-back' }).props.onPress(); });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('opens the OTA stack route from the firmware row', () => {
    const { navigation, tree } = renderSettings();
    act(() => { tree.root.findByProps({ testID: 'ota-entry' }).props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('DeviceOta', { deviceId: 'device-1' });
  });

  it('opens typed CO and NO₂ calibration stack routes', () => {
    const { navigation, tree } = renderSettings();
    act(() => { tree.root.findByProps({ testID: 'co-calibration-entry' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'no2-calibration-entry' }).props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('DeviceCalibration', { deviceId: 'device-1', sensor: 'co' });
    expect(navigation.navigate).toHaveBeenCalledWith('DeviceCalibration', { deviceId: 'device-1', sensor: 'no2' });
  });

  it('updates the device name and selected room through the settings hook', async () => {
    const { tree } = renderSettings();
    act(() => { tree.root.findByProps({ testID: 'edit-device-name' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'device-name-input' }).props.onChangeText('Kitchen Purifier'); });
    await act(async () => { tree.root.findByProps({ testID: 'save-device-name' }).props.onPress(); });
    expect(updateDevice).toHaveBeenCalledWith({ name: 'Kitchen Purifier' });
    act(() => { tree.root.findByProps({ testID: 'select-device-room' }).props.onPress(); });
    await act(async () => { tree.root.findByProps({ testID: 'room-option-room-2' }).props.onPress(); });
    expect(updateDevice).toHaveBeenCalledWith({ roomId: 'room-2' });
  });

  it('confirms delete, returns to Home on success, and surfaces delete failure', async () => {
    const { navigation, tree } = renderSettings();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, actions) => actions?.find(action => action.text === 'Delete')?.onPress?.());
    await act(async () => { tree.root.findByProps({ testID: 'delete-device' }).props.onPress(); });
    expect(deleteDevice).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs');
    alert.mockRestore();
    deleteDevice.mockRejectedValueOnce(new Error('Forbidden'));
    const errorAlert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, actions) => actions?.find(action => action.text === 'Delete')?.onPress?.());
    await act(async () => { tree.root.findByProps({ testID: 'delete-device' }).props.onPress(); });
    expect(errorAlert).toHaveBeenCalledWith('Failed to delete device', 'Forbidden');
    errorAlert.mockRestore();
  });

  it('renders Flutter-equivalent loading and device error states', () => {
    mockSettings.mockReturnValue({ device: undefined, deviceError: null, isLoading: true } as never);
    expect(renderSettings().tree.root.findByProps({ testID: 'device-settings-loading' })).toBeTruthy();
    mockSettings.mockReturnValue({ device: undefined, deviceError: new Error('Offline'), isLoading: false } as never);
    const { tree } = renderSettings();
    expect(textContent(tree)).toContain('Failed to load device');
    expect(textContent(tree)).toContain('Offline');
  });
});
