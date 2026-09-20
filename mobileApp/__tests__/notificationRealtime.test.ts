import { QueryClient } from '@tanstack/react-query';

import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import { notificationQueryKeys } from '../src/features/notifications/hooks/useNotificationsQuery';
import type { NotificationItem } from '../src/features/notifications/models/notificationModels';
import { RealtimeEventRouter } from '../src/services/realtime/realtimeEventRouter';
import { realtimeEventFromDto } from '../src/services/realtime/realtimeEvents';

const deviceId = 'aa:bb:cc:dd:ee:ff';

function event(dto: Record<string, unknown>) {
  const mapped = realtimeEventFromDto(dto);
  if (mapped === null) throw new Error('Expected valid realtime event');
  return mapped;
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(homeQueryKeys.devices(), [{ id: deviceId, name: 'Kitchen Air', homeId: 'home-1', roomId: null, online: false, lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null }]);
  queryClient.setQueryData<NotificationItem[]>(notificationQueryKeys.list(), []);
  return { queryClient, router: new RealtimeEventRouter(queryClient) };
}

function notifications(queryClient: QueryClient): NotificationItem[] {
  return queryClient.getQueryData<NotificationItem[]>(notificationQueryKeys.list()) ?? [];
}

describe('Flutter-equivalent realtime notification derivation', () => {
  it('creates a device-status notification with cached device name and SSE timestamp', () => {
    const { queryClient, router } = setup();
    const occurredAt = '2026-09-20T04:05:06.000Z';
    router.dispatch(event({ id: 'device-online-1', type: 'device.status', device_id: deviceId, occurred_at: occurredAt, payload: { online: true, firmware: '1.2.3' } }));

    expect(notifications(queryClient)).toEqual([expect.objectContaining({
      id: 'device-online-1', type: 'device.online', deviceId, deviceName: 'Kitchen Air', title: 'Device came online', body: 'Device is connected and reporting.', severity: 'success', occurredAt: new Date(occurredAt),
    })]);
    queryClient.clear();
  });

  it('creates a terminal command notification and ignores non-terminal command updates', () => {
    const { queryClient, router } = setup();
    router.dispatch(event({ id: 'command-sent-1', type: 'command.updated', device_id: deviceId, occurred_at: '2026-09-20T04:06:00.000Z', payload: { command_id: 'cmd-1', status: 'sent', payload: { type: 'relay_set', relay: 1, state: true } } }));
    router.dispatch(event({ id: 'command-done-1', type: 'command.updated', device_id: deviceId, occurred_at: '2026-09-20T04:07:00.000Z', payload: { command_id: 'cmd-1', status: 'done', payload: { type: 'relay_set', relay: 1, state: true } } }));

    expect(notifications(queryClient)).toEqual([expect.objectContaining({ id: 'command-done-1', type: 'command.done', title: 'Relay 1 turned on', body: 'Command completed successfully.', severity: 'success' })]);
    queryClient.clear();
  });

  it('maps Flutter-supported OTA reboot and failure events', () => {
    const { queryClient, router } = setup();
    router.dispatch(event({ id: 'ota-reboot-1', type: 'ota.progress', device_id: deviceId, occurred_at: '2026-09-20T04:08:00.000Z', payload: { status: 'rebooting' } }));
    router.dispatch(event({ id: 'ota-failed-1', type: 'ota.progress', device_id: deviceId, occurred_at: '2026-09-20T04:09:00.000Z', payload: { status: 'failed', reason: 'Checksum mismatch' } }));

    expect(notifications(queryClient)).toEqual([
      expect.objectContaining({ id: 'ota-failed-1', type: 'ota.failed', title: 'OTA update failed', body: 'Checksum mismatch', severity: 'danger' }),
      expect.objectContaining({ id: 'ota-reboot-1', type: 'ota.rebooting', title: 'OTA update applied', severity: 'success' }),
    ]);
    queryClient.clear();
  });

  it('ignores duplicate event IDs and replay-reset events', () => {
    const { queryClient, router } = setup();
    const duplicate = event({ id: 'duplicate-1', type: 'device.status', device_id: deviceId, occurred_at: '2026-09-20T04:10:00.000Z', payload: { online: false } });
    router.dispatch(duplicate);
    router.dispatch(duplicate);
    router.dispatch(event({ id: 'replay-1', type: 'replay.reset', device_id: '', occurred_at: '2026-09-20T04:11:00.000Z', payload: { reason: 'replay_unavailable' } }));

    expect(notifications(queryClient)).toHaveLength(1);
    expect(notifications(queryClient)[0]).toMatchObject({ id: 'duplicate-1', type: 'device.offline' });
    queryClient.clear();
  });
});
