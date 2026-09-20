import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/features/device/calibration/hooks/useCalibration', () => ({
  useCalibrationCommandTracking: jest.fn(),
  useStartCalibrationMutation: jest.fn(),
}));

import { CalibrationWizardScreen } from '../src/features/device/calibration/CalibrationWizardScreen';
import { useCalibrationCommandTracking, useStartCalibrationMutation } from '../src/features/device/calibration/hooks/useCalibration';

const mockTracking = useCalibrationCommandTracking as jest.MockedFunction<typeof useCalibrationCommandTracking>;
const mockStart = useStartCalibrationMutation as jest.MockedFunction<typeof useStartCalibrationMutation>;
const mutateAsync = jest.fn().mockResolvedValue({ commandId: 'calibration-1', status: 'pending', submittedAt: new Date() });
const mountedTrees: renderer.ReactTestRenderer[] = [];

function renderWizard(sensor: 'co' | 'no2' = 'co', navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() }) {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<CalibrationWizardScreen navigation={navigation as never} route={{ params: { deviceId: 'device-1', sensor } } as never} />); });
  mountedTrees.push(tree!);
  return { navigation, tree: tree! };
}

function textContent(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join(' ').replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockReturnValue({ isPending: false, mutateAsync } as never);
  mockTracking.mockReturnValue({ command: null, error: null, isPolling: true, status: 'sent' } as never);
});

afterEach(() => { act(() => { mountedTrees.splice(0).forEach(tree => tree.unmount()); }); });

describe('Flutter Calibration Wizard UI', () => {
  it('renders the preparation step and the sensor-specific instructions', () => {
    const { tree } = renderWizard('no2');
    expect(tree.root.findByProps({ testID: 'calibration-preparation' })).toBeTruthy();
    expect(textContent(tree)).toContain('Calibrate NO₂ sensor');
    expect(textContent(tree)).toContain('Keep it powered on for at least 24 hours');
    expect(textContent(tree)).toContain('final confirmation can take up to 7 minutes');
  });

  it('starts the selected calibration and exposes the active polling state', async () => {
    const { tree } = renderWizard('co');
    act(() => { tree.root.findByProps({ testID: 'calibration-prepare-start' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'calibration-ready' })).toBeTruthy();
    await act(async () => { tree.root.findByProps({ testID: 'calibration-start' }).props.onPress(); });
    expect(mutateAsync).toHaveBeenCalledWith('co');
    expect(tree.root.findByProps({ testID: 'calibration-running' })).toBeTruthy();
    expect(textContent(tree)).toContain('Command status: sent');
  });

  it('shows success only after the polling hook reports done', async () => {
    mockTracking.mockReturnValue({ command: { id: 'calibration-1', status: 'done' }, error: null, isPolling: false, status: 'done' } as never);
    const { tree } = renderWizard();
    act(() => { tree.root.findByProps({ testID: 'calibration-prepare-start' }).props.onPress(); });
    await act(async () => { tree.root.findByProps({ testID: 'calibration-start' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'calibration-success' })).toBeTruthy();
    expect(textContent(tree)).toContain('Calibration command completed');
  });

  it('renders failure for command error and timeout, and allows retry', async () => {
    mockTracking.mockReturnValue({ command: { id: 'calibration-1', status: 'error' }, error: new Error('Device rejected calibration'), isPolling: false, status: 'error' } as never);
    const { tree } = renderWizard();
    act(() => { tree.root.findByProps({ testID: 'calibration-prepare-start' }).props.onPress(); });
    await act(async () => { tree.root.findByProps({ testID: 'calibration-start' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'calibration-failure' })).toBeTruthy();
    expect(textContent(tree)).toContain('Device rejected calibration');
    act(() => { tree.root.findByProps({ testID: 'calibration-retry' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'calibration-ready' })).toBeTruthy();

    mockTracking.mockReturnValue({ command: { id: 'calibration-1', status: 'timeout' }, error: null, isPolling: false, status: 'timeout' } as never);
    const timeoutTree = renderWizard().tree;
    act(() => { timeoutTree.root.findByProps({ testID: 'calibration-prepare-start' }).props.onPress(); });
    await act(async () => { timeoutTree.root.findByProps({ testID: 'calibration-start' }).props.onPress(); });
    expect(textContent(timeoutTree)).toContain('Calibration finished with status: timeout');
  });
});
