import { QueryClient } from '@tanstack/react-query';

import { deviceDashboardQueryKeys } from '../src/features/device/hooks/useDeviceDashboardQueries';
import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import type { Device } from '../src/features/home/models/homeModels';
import { finalizeProvisioningHandoff, markProvisioningAnnounced, useProvisioningSessionStore } from '../src/features/provisioning/session';

const device: Device = { id: 'aa:bb:cc:dd:ee:ff', name: 'Kitchen Air', homeId: 'home-1', roomId: 'room-1', online: true, lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null };

function activeSession(): void {
  const store = useProvisioningSessionStore.getState();
  store.clear();
  store.setConnected({ bleDeviceId: 'ble-device-1', homeId: device.homeId });
  store.setWifiResult({ deviceId: device.id, ip: '192.168.1.2' });
}

describe('final provisioning cache refresh and handoff', () => {
  beforeEach(() => useProvisioningSessionStore.getState().clear());

  it('retains temporary state through cloud acknowledgement and before user confirmation', async () => {
    activeSession();
    await markProvisioningAnnounced();
    expect(useProvisioningSessionStore.getState().session).toMatchObject({ deviceMac: device.id, status: 'completed' });
  });

  it('invalidates only device list and selected device caches, retains latest data, then clears after acknowledgement', async () => {
    activeSession();
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    queryClient.setQueryData(homeQueryKeys.devices(), [device]);
    queryClient.setQueryData(deviceDashboardQueryKeys.device(device.id), device);
    const complete = jest.fn(async () => {
      expect(useProvisioningSessionStore.getState().session).not.toBeNull();
      useProvisioningSessionStore.getState().clear();
    });

    await finalizeProvisioningHandoff(queryClient, device.id, complete);

    expect(queryClient.getQueryData(homeQueryKeys.devices())).toEqual([device]);
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.device(device.id))).toEqual(device);
    expect(queryClient.getQueryState(homeQueryKeys.devices())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(deviceDashboardQueryKeys.device(device.id))?.isInvalidated).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(useProvisioningSessionStore.getState().session).toBeNull();
  });

  it('does not clear temporary state when final acknowledgement fails and can be retried', async () => {
    activeSession();
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    await expect(finalizeProvisioningHandoff(queryClient, device.id, async () => { throw new Error('Temporary cleanup failure'); })).rejects.toThrow('Temporary cleanup failure');
    expect(useProvisioningSessionStore.getState().session).not.toBeNull();
  });
});
