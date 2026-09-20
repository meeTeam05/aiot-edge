import { QueryClient } from '@tanstack/react-query';

import { deviceOtaQueryKeys } from '../src/features/device/ota/hooks/useDeviceOta';
import type { Device } from '../src/features/device/models/deviceModels';
import {
  OTA_RECONCILIATION_INTERVAL_MS,
  OTA_RECONCILIATION_MAX_DURATION_MS,
  OTAReconciliationService,
} from '../src/features/device/ota/reconciliation';
import { applyOtaProgressEvent } from '../src/features/device/ota/realtime';
import { realtimeEventFromDto } from '../src/services/realtime/realtimeEvents';

const deviceId = 'aa:bb:cc:dd:ee:ff';

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: deviceId, name: 'Office Air', homeId: 'home-1', roomId: null, online: false,
    lastSeen: null, firmwareVer: '1.0.0', mode: null, relay1: null, relay2: null, relay3: null, createdAt: null,
    ...overrides,
  };
}

function rebootEvent(id = 'ota-reboot') {
  const event = realtimeEventFromDto({
    id, type: 'ota.progress', device_id: deviceId, occurred_at: new Date().toISOString(), payload: { status: 'rebooting', progress: 100 },
  });
  if (event === null || event.type !== 'ota.progress') throw new Error('Expected reboot event');
  return event;
}

describe('OTA post-reboot reconciliation', () => {
  function setup(fetchDevice: jest.MockedFunction<(id: string) => Promise<Device | null>>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let clock = 0;
    let nextTimer = 1;
    const callbacks = new Map<number, () => void>();
    const service = new OTAReconciliationService(queryClient, {
      fetchDevice,
      now: () => clock,
      setTimeout: callback => {
        const timer = nextTimer++;
        callbacks.set(timer, callback);
        return timer as never;
      },
      clearTimeout: timer => { callbacks.delete(timer as never); },
    });
    const runNext = async () => {
      const entry = callbacks.entries().next().value as [number, () => void] | undefined;
      if (entry === undefined) throw new Error('Expected a scheduled reconciliation retry');
      callbacks.delete(entry[0]);
      entry[1]();
      await Promise.resolve();
      await Promise.resolve();
    };
    return {
      queryClient,
      service,
      setClock: (value: number) => { clock = value; },
      runNext,
      scheduledCount: () => callbacks.size,
    };
  }

  it('completes when the device reconnects with the requested firmware version', async () => {
    const fetchDevice = jest.fn().mockResolvedValue(device({ online: true, firmwareVer: '1.1.0' }));
    const { queryClient, runNext, service } = setup(fetchDevice);
    expect(service.start(deviceId, '1.1.0')).toBe(true);
    await runNext();
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ state: 'completed', requestedVersion: '1.1.0' }));
    expect(fetchDevice).toHaveBeenCalledWith(deviceId);
    queryClient.clear();
  });

  it('fails when the device reconnects on its previous firmware version', async () => {
    const fetchDevice = jest.fn().mockResolvedValue(device({ online: true, firmwareVer: '1.0.0' }));
    const { queryClient, runNext, service } = setup(fetchDevice);
    service.start(deviceId, '1.1.0');
    await runNext();
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ state: 'failed' }));
    queryClient.clear();
  });

  it('times out when the device remains offline for the maximum duration', async () => {
    const fetchDevice = jest.fn().mockResolvedValue(device({ online: false }));
    const { queryClient, runNext, service, setClock } = setup(fetchDevice);
    service.start(deviceId, '1.1.0');
    setClock(OTA_RECONCILIATION_INTERVAL_MS);
    await runNext();
    setClock(OTA_RECONCILIATION_MAX_DURATION_MS);
    await runNext();
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ state: 'timeout' }));
    queryClient.clear();
  });

  it('does not start a second reconciliation for a duplicate reboot SSE event', () => {
    const fetchDevice = jest.fn().mockResolvedValue(device());
    const { queryClient, scheduledCount, service } = setup(fetchDevice);
    queryClient.setQueryData(deviceOtaQueryKeys.progress(deviceId), { eventId: null, state: 'idle', progress: null, occurredAt: new Date(), requestedVersion: '1.1.0' });
    const event = rebootEvent();
    expect(applyOtaProgressEvent(queryClient, event)).toBe(true);
    expect(service.start(deviceId, queryClient.getQueryData<{ requestedVersion: string }>(deviceOtaQueryKeys.progress(deviceId))?.requestedVersion ?? null)).toBe(true);
    expect(applyOtaProgressEvent(queryClient, event)).toBe(false);
    expect(service.start(deviceId, '1.1.0')).toBe(false);
    expect(scheduledCount()).toBe(1);
    queryClient.clear();
  });

  it('cancels an in-flight retry without writing a terminal result', async () => {
    let resolveFetch: ((value: Device | null) => void) | undefined;
    const fetchDevice = jest.fn((_deviceId: string) => new Promise<Device | null>(resolve => { resolveFetch = resolve; }));
    const { queryClient, runNext, service } = setup(fetchDevice);
    service.start(deviceId, '1.1.0');
    const checking = runNext();
    await Promise.resolve();
    expect(service.cancel(deviceId)).toBe(true);
    resolveFetch?.(device({ online: true, firmwareVer: '1.1.0' }));
    await checking;
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ state: 'checking_device' }));
    queryClient.clear();
  });
});
