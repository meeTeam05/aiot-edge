import { encodeUtf8, WifiProvisioningProtocol, RESULT_TIMEOUT_MS } from '../src/services/ble/provisioningProtocol';
import { smartAirGatt, type SmartAirGattConnection } from '../src/services/ble/smartAirGatt';
import type { BleAdapter, BleNotificationListener } from '../src/services/ble/bleTypes';

const connection: SmartAirGattConnection = {
  deviceId: 'device-1', serviceUUID: smartAirGatt.provisioningServiceUuid,
  ssidCharacteristic: { serviceUuid: smartAirGatt.provisioningServiceUuid, characteristicUuid: smartAirGatt.provisioningSsidCharacteristicUuid },
  passwordCharacteristic: { serviceUuid: smartAirGatt.provisioningServiceUuid, characteristicUuid: smartAirGatt.provisioningPasswordCharacteristicUuid },
  statusCharacteristic: { serviceUuid: smartAirGatt.provisioningServiceUuid, characteristicUuid: smartAirGatt.provisioningNotifyCharacteristicUuid },
};

function makeAdapter() {
  let listener: BleNotificationListener | undefined;
  const adapter = {
    subscribeToCharacteristic: jest.fn((_deviceId, _characteristic, next: BleNotificationListener) => {
      listener = next;
      return { remove: jest.fn() };
    }),
    writeCharacteristic: jest.fn(async () => undefined),
  } as unknown as BleAdapter;
  return { adapter, notify: (payload: string) => listener?.(null, encodeUtf8(payload)) };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Wi-Fi BLE provisioning protocol', () => {
  afterEach(() => jest.useRealTimers());

  it('subscribes to FF03 and writes exact UTF-8 SSID then password characteristics', async () => {
    const { adapter, notify } = makeAdapter();
    const protocol = new WifiProvisioningProtocol(adapter);
    const request = protocol.provision(connection, 'Home WiFi', 'secret12');
    await flush();
    expect(adapter.subscribeToCharacteristic).toHaveBeenCalledWith('device-1', connection.statusCharacteristic, expect.any(Function));
    expect(adapter.writeCharacteristic).toHaveBeenNthCalledWith(1, 'device-1', connection.ssidCharacteristic, encodeUtf8('Home WiFi'));
    expect(adapter.writeCharacteristic).toHaveBeenNthCalledWith(2, 'device-1', connection.passwordCharacteristic, encodeUtf8('secret12'));
    notify('{"status":"ok","device_id":"AA:BB:CC","ip":"192.168.1.2"}');
    await expect(request).resolves.toEqual({ deviceId: 'aa:bb:cc', ip: '192.168.1.2' });
  });

  it('joins fragmented FF03 JSON notifications before validating success', async () => {
    const { adapter, notify } = makeAdapter();
    const request = new WifiProvisioningProtocol(adapter).provision(connection, 'ssid', 'secret12');
    await flush();
    notify('{"status":"ok","device_id":"aa:');
    notify('bb","ip":"192.168.0.9"}');
    await expect(request).resolves.toEqual({ deviceId: 'aa:bb', ip: '192.168.0.9' });
  });

  it('fails on a device failure response and malformed JSON', async () => {
    const failure = makeAdapter();
    const failedRequest = new WifiProvisioningProtocol(failure.adapter).provision(connection, 'ssid', 'secret12');
    await flush();
    failure.notify('{"status":"fail"}');
    await expect(failedRequest).rejects.toMatchObject({ code: 'provisioningFailed' });

    const malformed = makeAdapter();
    const malformedRequest = new WifiProvisioningProtocol(malformed.adapter).provision(connection, 'ssid', 'secret12');
    await flush();
    malformed.notify('{not-json}');
    await expect(malformedRequest).rejects.toMatchObject({ code: 'invalidProvisioningResponse' });
  });

  it('fails after the Flutter-equivalent 30-second no-notification timeout', async () => {
    jest.useFakeTimers();
    const { adapter } = makeAdapter();
    const request = new WifiProvisioningProtocol(adapter).provision(connection, 'ssid', 'secret12');
    await flush();
    jest.advanceTimersByTime(RESULT_TIMEOUT_MS);
    await expect(request).rejects.toMatchObject({ code: 'provisioningTimeout' });
  });
});
