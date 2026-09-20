import { cancelProvisioningSession, completeProvisioningSession, provisioningBleRegistry, useProvisioningSessionStore } from '../src/features/provisioning/session';

describe('provisioning session architecture', () => {
  beforeEach(async () => {
    await provisioningBleRegistry.clear();
    useProvisioningSessionStore.getState().clear();
  });

  it('retains only serializable device identity and workflow data across screen transitions', () => {
    const store = useProvisioningSessionStore.getState();
    store.beginScan();
    store.beginConnection();
    store.setConnected({ bleDeviceId: 'ble-device-1', homeId: 'home-1' });
    store.setWifiResult({ deviceId: 'aa:bb:cc:dd', ip: '192.168.1.8' });

    expect(useProvisioningSessionStore.getState().session).toEqual({
      bleDeviceId: 'ble-device-1',
      deviceMac: 'aa:bb:cc:dd',
      homeId: 'home-1',
      ipAddress: '192.168.1.8',
      status: 'wifi_provisioning',
      wifiResult: { deviceId: 'aa:bb:cc:dd', ip: '192.168.1.8' },
    });
    expect(JSON.parse(JSON.stringify(useProvisioningSessionStore.getState().session))).toEqual(useProvisioningSessionStore.getState().session);
  });

  it('disconnects the BLE service and clears serializable state when cancelled', async () => {
    const disconnect = jest.fn(async () => undefined);
    provisioningBleRegistry.set({ disconnect } as never, {} as never);
    useProvisioningSessionStore.getState().setConnected({ bleDeviceId: 'ble-device-1' });

    await cancelProvisioningSession();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session).toBeNull();
    expect(useProvisioningSessionStore.getState().workflowStatus).toBe('idle');
  });

  it('clears the session after a future overall provisioning completion', async () => {
    const disconnect = jest.fn(async () => undefined);
    provisioningBleRegistry.set({ disconnect } as never, {} as never);
    useProvisioningSessionStore.getState().setConnected({ bleDeviceId: 'ble-device-1' });

    await completeProvisioningSession();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session).toBeNull();
  });
});
