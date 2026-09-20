import { QueryClient } from '@tanstack/react-query';

import { deviceOtaQueryKeys } from '../src/features/device/ota/hooks/useDeviceOta';
import { applyOtaProgressEvent } from '../src/features/device/ota/realtime';
import { deviceDashboardQueryKeys } from '../src/features/device/hooks/useDeviceDashboardQueries';
import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import { realtimeEventFromDto } from '../src/services/realtime/realtimeEvents';

const deviceId = 'aa:bb:cc:dd:ee:ff';

function otaEvent(id: string, payload: Record<string, unknown>, occurredAt = '2026-09-20T02:00:00.000Z') {
  const mapped = realtimeEventFromDto({
    id,
    type: 'ota.progress',
    device_id: deviceId,
    occurred_at: occurredAt,
    payload,
  });
  if (mapped === null || mapped.type !== 'ota.progress') throw new Error('Expected OTA event');
  return mapped;
}

describe('OTA realtime progress cache', () => {
  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return { queryClient, invalidate: jest.spyOn(queryClient, 'invalidateQueries') };
  }

  it('maps numeric download frames into progress state and preserves their SSE timestamp', () => {
    const { queryClient } = setup();
    expect(applyOtaProgressEvent(queryClient, otaEvent('ota-1', { progress: 40 }))).toBe(true);
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual({
      eventId: 'ota-1', state: 'downloading', progress: 40, occurredAt: new Date('2026-09-20T02:00:00.000Z'), errorMessage: null, requestedVersion: null,
    });
    queryClient.clear();
  });

  it('maps rebooting and failed terminal frames', () => {
    const { queryClient, invalidate } = setup();
    applyOtaProgressEvent(queryClient, otaEvent('ota-2', { progress: 100, status: 'rebooting' }));
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ state: 'waiting_reboot', progress: 100 }));
    applyOtaProgressEvent(queryClient, otaEvent('ota-3', { progress: 0, status: 'failed' }));
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ state: 'failed', progress: 0 }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deviceOtaQueryKeys.catalog(deviceId) });
    queryClient.clear();
  });

  it('ignores duplicate frames and unsupported completed status', () => {
    const { queryClient, invalidate } = setup();
    const frame = otaEvent('ota-4', { progress: 60 });
    expect(applyOtaProgressEvent(queryClient, frame)).toBe(true);
    expect(applyOtaProgressEvent(queryClient, frame)).toBe(false);
    expect(applyOtaProgressEvent(queryClient, otaEvent('ota-5', { progress: 100, status: 'completed' }))).toBe(false);
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ eventId: 'ota-4', progress: 60 }));
    expect(invalidate).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('ignores a delayed OTA progress frame without invalidating unrelated caches', () => {
    const { queryClient, invalidate } = setup();
    expect(applyOtaProgressEvent(queryClient, otaEvent('ota-new', { progress: 70 }, '2026-09-20T02:02:00.000Z'))).toBe(true);
    expect(applyOtaProgressEvent(queryClient, otaEvent('ota-old', { progress: 20 }, '2026-09-20T02:01:00.000Z'))).toBe(false);
    expect(queryClient.getQueryData(deviceOtaQueryKeys.progress(deviceId))).toEqual(expect.objectContaining({ eventId: 'ota-new', progress: 70 }));
    expect(invalidate).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('refreshes OTA catalog and affected device snapshots after a terminal state', () => {
    const { queryClient, invalidate } = setup();
    applyOtaProgressEvent(queryClient, otaEvent('ota-6', { status: 'rebooting', progress: 100 }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deviceOtaQueryKeys.catalog(deviceId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deviceDashboardQueryKeys.device(deviceId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeQueryKeys.devices() });
    queryClient.clear();
  });
});
