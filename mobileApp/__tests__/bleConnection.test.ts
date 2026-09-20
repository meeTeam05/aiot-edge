import { SmartAirProvisioningConnectionService } from '../src/services/ble/provisioningConnection';
import { smartAirGatt } from '../src/services/ble/smartAirGatt';
import type { BleAdapter, BleGattService } from '../src/services/ble/bleTypes';

const validServices: BleGattService[] = [{
  uuid: smartAirGatt.provisioningServiceUuid,
  characteristics: [
    { uuid: smartAirGatt.provisioningSsidCharacteristicUuid },
    { uuid: smartAirGatt.provisioningPasswordCharacteristicUuid },
    { uuid: smartAirGatt.provisioningNotifyCharacteristicUuid },
  ],
}];

function makeAdapter(services: readonly BleGattService[] = validServices): BleAdapter {
  return {
    getState: jest.fn(async () => 'poweredOn'),
    requestPermissions: jest.fn(), startScan: jest.fn(), stopScan: jest.fn(),
    connect: jest.fn(async () => ({ id: 'device-1', name: 'SMART_AIR_123456', rssi: -42 })),
    disconnect: jest.fn(async () => undefined),
    discoverServices: jest.fn(async () => services),
    requestMtu: jest.fn(async () => undefined),
    writeCharacteristic: jest.fn(), subscribeToCharacteristic: jest.fn(), destroy: jest.fn(),
  } as unknown as BleAdapter;
}

describe('Smart Air BLE connection service', () => {
  it('connects, explicitly requests MTU 256, discovers GATT, and reaches ready', async () => {
    const adapter = makeAdapter();
    const service = new SmartAirProvisioningConnectionService(adapter);
    const transitions: string[] = [];
    service.subscribe((state) => transitions.push(state));

    const connection = await service.connect('device-1');

    expect(adapter.connect).toHaveBeenCalledWith('device-1', 10_000);
    expect(adapter.requestMtu).toHaveBeenCalledWith('device-1', 256);
    expect(connection).toEqual({
      deviceId: 'device-1',
      serviceUUID: smartAirGatt.provisioningServiceUuid,
      ssidCharacteristic: { serviceUuid: smartAirGatt.provisioningServiceUuid, characteristicUuid: smartAirGatt.provisioningSsidCharacteristicUuid },
      passwordCharacteristic: { serviceUuid: smartAirGatt.provisioningServiceUuid, characteristicUuid: smartAirGatt.provisioningPasswordCharacteristicUuid },
      statusCharacteristic: { serviceUuid: smartAirGatt.provisioningServiceUuid, characteristicUuid: smartAirGatt.provisioningNotifyCharacteristicUuid },
    });
    expect(transitions).toEqual(['idle', 'connecting', 'connected', 'discovering', 'ready']);
  });

  it('disconnects the previous active device before connecting another', async () => {
    const adapter = makeAdapter();
    const service = new SmartAirProvisioningConnectionService(adapter);
    await service.connect('device-1');
    await service.connect('device-2');

    expect(adapter.disconnect).toHaveBeenCalledWith('device-1');
    expect(adapter.connect).toHaveBeenLastCalledWith('device-2', 10_000);
  });

  it('normalizes a connection timeout and does not continue', async () => {
    const adapter = makeAdapter();
    (adapter.connect as jest.Mock).mockRejectedValue({ errorCode: 'OperationTimedOut', message: 'timed out' });
    const service = new SmartAirProvisioningConnectionService(adapter);

    await expect(service.connect('device-1')).rejects.toMatchObject({ code: 'connectionTimeout' });
    expect(service.currentState).toBe('connection_failed');
    expect(adapter.discoverServices).not.toHaveBeenCalled();
  });

  it('rejects unavailable Bluetooth before attempting a connection', async () => {
    const adapter = makeAdapter();
    (adapter.getState as jest.Mock).mockResolvedValue('unsupported');
    const service = new SmartAirProvisioningConnectionService(adapter);

    await expect(service.connect('device-1')).rejects.toMatchObject({ code: 'unsupported' });
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(service.currentState).toBe('connection_failed');
  });

  it('fails explicitly when the Smart Air service or a required characteristic is missing', async () => {
    const missingService = new SmartAirProvisioningConnectionService(makeAdapter([]));
    await expect(missingService.connect('device-1')).rejects.toEqual(expect.objectContaining({ code: 'gattFailure', message: expect.stringContaining('service not found') }));
    expect(missingService.currentState).toBe('gatt_failed');

    const missingStatus = new SmartAirProvisioningConnectionService(makeAdapter([{ ...validServices[0]!, characteristics: validServices[0]!.characteristics.slice(0, 2) }]));
    await expect(missingStatus.connect('device-1')).rejects.toEqual(expect.objectContaining({ code: 'gattFailure', message: expect.stringContaining('status characteristic not found') }));
    expect(missingStatus.currentState).toBe('gatt_failed');
  });

  it('retains explicit cancellation state when disconnected', async () => {
    const service = new SmartAirProvisioningConnectionService(makeAdapter());
    await service.connect('device-1');
    await service.disconnect();
    expect(service.currentState).toBe('cancelled');
    expect(service.activeConnection).toBeNull();
  });
});
