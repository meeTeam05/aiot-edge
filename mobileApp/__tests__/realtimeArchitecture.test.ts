import { QueryClient } from '@tanstack/react-query';

import { deviceDashboardQueryKeys } from '../src/features/device/hooks/useDeviceDashboardQueries';
import { homeQueryKeys } from '../src/features/home/hooks/useHomeQueries';
import { notificationQueryKeys } from '../src/features/notifications/hooks/useNotificationsQuery';
import { calibrationQueryKeys } from '../src/features/device/calibration/hooks/useCalibration';
import { deviceOtaQueryKeys } from '../src/features/device/ota/hooks/useDeviceOta';
import { RealtimeClient, type RealtimeFetchResponse } from '../src/services/realtime/realtimeClient';
import { RealtimeEventRouter } from '../src/services/realtime/realtimeEventRouter';
import { realtimeEventFromDto } from '../src/services/realtime/realtimeEvents';
import { SseParser } from '../src/services/realtime/sseParser';

function event(dto: Record<string, unknown>) {
  const mapped = realtimeEventFromDto(dto);
  if (mapped === null) throw new Error('Expected a valid realtime event');
  return mapped;
}

function asciiStream(chunks: string[]): RealtimeFetchResponse['body'] {
  let index = 0;
  return {
    getReader: () => ({
      read: async () => {
        const value = chunks[index];
        index += 1;
        return value === undefined ? { done: true } : { done: false, value: Uint8Array.from([...value].map(character => character.charCodeAt(0))) };
      },
      releaseLock: () => undefined,
    }),
  };
}

async function flushRealtime(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
}

describe('SSE parsing and authenticated connection', () => {
  it('parses split, multi-line SSE frames and ignores comments', () => {
    const parser = new SseParser();
    expect(parser.add(': heartbeat\n\nid: 42\nevent: telemetry.point\ndata: {"id":"42",\ndata: "type":"telemetry.point"}\n\n')).toEqual([{
      id: '42', type: 'telemetry.point', data: '{"id":"42",\n"type":"telemetry.point"}',
    }]);
  });

  it('sends Bearer authentication, parses events, and schedules a bounded reconnect after stream closure', async () => {
    const fetchImpl = jest.fn(async (): Promise<RealtimeFetchResponse> => ({ ok: true, status: 200, body: asciiStream([
      'id: 42\nevent: device.status\ndata: {"id":"42","type":"device.status","device_id":"AA:BB","occurred_at":"2026-09-19T02:00:00.000Z","payload":{"online":true,"firmware":"1.2.3"}}\n\n',
    ]) }));
    const states: string[] = [];
    const events: string[] = [];
    let client: RealtimeClient;
    client = new RealtimeClient({
      fetchImpl,
      initialReconnectDelayMs: 5,
      maxReconnectDelayMs: 10,
      onConnectionState: state => states.push(state),
      onEvent: next => events.push(next.type),
      sleep: async () => { client.stop(); },
    });

    client.start('access-token');
    await flushRealtime();

    expect(fetchImpl).toHaveBeenCalledWith('https://smart-air.test/api/realtime', expect.objectContaining({ headers: expect.objectContaining({ Accept: 'text/event-stream', Authorization: 'Bearer access-token' }) }));
    expect(events).toEqual(['device.status']);
    expect(states).toContain('connected');
    expect(states).toContain('reconnecting');
    expect(states.at(-1)).toBe('disconnected');
  });

  it('reconnects after a disconnect and retains Last-Event-ID for replay', async () => {
    let attempts = 0;
    const fetchImpl = jest.fn(async (): Promise<RealtimeFetchResponse> => {
      attempts += 1;
      if (attempts === 1) return { ok: true, status: 200, body: asciiStream([
        'id: 77\nevent: device.status\ndata: {"device_id":"AA:BB","occurred_at":"2026-09-20T02:00:00.000Z","payload":{"online":true}}\n\n',
      ]) };
      return { ok: true, status: 200, body: asciiStream([]) };
    });
    let client: RealtimeClient;
    let sleeps = 0;
    client = new RealtimeClient({
      fetchImpl,
      initialReconnectDelayMs: 1,
      onEvent: () => undefined,
      sleep: async () => { sleeps += 1; if (sleeps === 2) client.stop(); },
    });
    client.start('access-token');
    await flushRealtime();
    await flushRealtime();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://smart-air.test/api/realtime', expect.objectContaining({ headers: expect.objectContaining({ 'Last-Event-ID': '77' }) }));
  });
});

describe('typed realtime events and TanStack Query cache routing', () => {
  const deviceId = 'aa:bb:cc:dd:ee:ff';

  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(homeQueryKeys.devices(), [{
      id: deviceId, name: 'Living Room', homeId: 'home-1', roomId: null, online: false,
      lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null,
    }]);
    queryClient.setQueryData(deviceDashboardQueryKeys.device(deviceId), {
      id: deviceId, name: 'Living Room', homeId: 'home-1', roomId: null, online: false,
      lastSeen: null, firmwareVer: null, mode: null, relay1: null, relay2: null, relay3: null, createdAt: null,
    });
    queryClient.setQueryData(deviceDashboardQueryKeys.shadow(deviceId), { reported: { relay_1: false }, desired: { mode: 'on' }, updatedAt: null });
    queryClient.setQueryData(deviceDashboardQueryKeys.telemetry(deviceId, { limit: 720 }), []);
    queryClient.setQueryData(deviceDashboardQueryKeys.commands(deviceId), [{ id: 'cmd-1', payload: { type: 'relay_set' }, status: 'pending', createdAt: new Date('2026-09-19T01:59:00.000Z'), executedAt: null, errorMessage: null }]);
    return { queryClient, router: new RealtimeEventRouter(queryClient) };
  }

  it('normalizes every supported backend event type and rejects malformed frames', () => {
    const base = { id: '1', device_id: deviceId, occurred_at: '2026-09-19T02:00:00.000Z' };
    expect(realtimeEventFromDto({ ...base, type: 'device.status', payload: { online: true } })?.type).toBe('device.status');
    expect(realtimeEventFromDto({ ...base, type: 'shadow.reported', payload: { reported: {}, patch: {} } })?.type).toBe('shadow.reported');
    expect(realtimeEventFromDto({ ...base, type: 'telemetry.point', payload: { ts: '2026-09-19T02:00:00.000Z', mode: 'on' } })?.type).toBe('telemetry.point');
    expect(realtimeEventFromDto({ ...base, type: 'command.updated', payload: { command_id: 'cmd-1', status: 'sent', payload: {} } })?.type).toBe('command.updated');
    expect(realtimeEventFromDto({ ...base, type: 'ota.progress', payload: { status: 'downloading' } })?.type).toBe('ota.progress');
    expect(realtimeEventFromDto({ ...base, type: 'replay.reset', payload: { reason: 'replay_unavailable' } })?.type).toBe('replay.reset');
    expect(realtimeEventFromDto({ ...base, type: 'telemetry.point', payload: { ts: 'bad-date' } })).toBeNull();
  });

  it('patches device status and merges reported shadow patches without changing desired state', () => {
    const { queryClient, router } = setup();
    router.dispatch(event({ id: '2', type: 'device.status', device_id: deviceId, occurred_at: '2026-09-19T02:01:00.000Z', payload: { online: true, firmware: '1.2.3' } }));
    router.dispatch(event({ id: '3', type: 'shadow.reported', device_id: deviceId, occurred_at: '2026-09-19T02:02:00.000Z', payload: { reported: { mode: 'on', relay_1: true }, patch: { relay_1: true } } }));

    expect(queryClient.getQueryData(homeQueryKeys.devices())).toEqual([expect.objectContaining({ online: true, firmwareVer: '1.2.3', mode: 'on', relay1: true })]);
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.shadow(deviceId))).toEqual({ reported: { relay_1: true, mode: 'on' }, desired: { mode: 'on' }, updatedAt: new Date('2026-09-19T02:02:00.000Z') });
    queryClient.clear();
  });

  it('appends normalized telemetry and upserts command status in their isolated caches', () => {
    const { queryClient, router } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    router.dispatch(event({ id: '4', type: 'telemetry.point', device_id: deviceId, occurred_at: '2026-09-19T02:03:00.000Z', payload: { ts: '2026-09-19T02:03:00.000Z', temperature: 24.6, humidity: 60, co_ppm: 4, no2_ppm: 0.2, mode: 'on' } }));
    router.dispatch(event({ id: '5', type: 'command.updated', device_id: deviceId, occurred_at: '2026-09-19T02:04:00.000Z', payload: { command_id: 'cmd-1', status: 'done', payload: { type: 'calibrate_co' }, error_message: null } }));

    expect(queryClient.getQueryData(deviceDashboardQueryKeys.telemetry(deviceId, { limit: 720 }))).toEqual([expect.objectContaining({ temperature: 24.6 })]);
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.commands(deviceId))).toEqual([expect.objectContaining({ id: 'cmd-1', status: 'done', executedAt: new Date('2026-09-19T02:04:00.000Z') })]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calibrationQueryKeys.commandHistory(deviceId) });
    queryClient.clear();
  });

  it('invalidates device and notification snapshots after replay.reset', () => {
    const { queryClient, router } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(deviceOtaQueryKeys.catalog(deviceId), { deviceId, currentVersion: '1.0.0', deviceOnline: false, versions: [] });
    router.dispatch(event({ id: '0', type: 'replay.reset', device_id: '', occurred_at: '2026-09-19T02:05:00.000Z', payload: { reason: 'replay_unavailable' } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeQueryKeys.devices() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['device'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationQueryKeys.list() });
    expect(queryClient.getQueryState(deviceOtaQueryKeys.catalog(deviceId))?.isInvalidated).toBe(true);
    queryClient.clear();
  });

  it('ignores duplicate IDs and delayed status, shadow, and command frames', () => {
    const { queryClient, router } = setup();
    router.dispatch(event({ id: 'new-status', type: 'device.status', device_id: deviceId, occurred_at: '2026-09-20T02:05:00.000Z', payload: { online: true, firmware: '2.0.0' } }));
    router.dispatch(event({ id: 'old-status', type: 'device.status', device_id: deviceId, occurred_at: '2026-09-20T02:04:00.000Z', payload: { online: false, firmware: '1.0.0' } }));
    router.dispatch(event({ id: 'new-shadow', type: 'shadow.reported', device_id: deviceId, occurred_at: '2026-09-20T02:05:00.000Z', payload: { reported: { relay_1: true }, patch: { relay_1: true } } }));
    router.dispatch(event({ id: 'old-shadow', type: 'shadow.reported', device_id: deviceId, occurred_at: '2026-09-20T02:04:00.000Z', payload: { reported: { relay_1: false }, patch: { relay_1: false } } }));
    const done = { id: 'done-command', type: 'command.updated', device_id: deviceId, occurred_at: '2026-09-20T02:05:00.000Z', payload: { command_id: 'cmd-1', status: 'done', payload: {}, error_message: null } };
    router.dispatch(event(done));
    router.dispatch(event(done));
    router.dispatch(event({ id: 'old-command', type: 'command.updated', device_id: deviceId, occurred_at: '2026-09-20T02:04:00.000Z', payload: { command_id: 'cmd-1', status: 'sent', payload: {}, error_message: null } }));

    expect(queryClient.getQueryData(homeQueryKeys.devices())).toEqual([expect.objectContaining({ online: true, firmwareVer: '2.0.0' })]);
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.shadow(deviceId))).toEqual(expect.objectContaining({ reported: expect.objectContaining({ relay_1: true }) }));
    expect(queryClient.getQueryData(deviceDashboardQueryKeys.commands(deviceId))).toEqual([expect.objectContaining({ id: 'cmd-1', status: 'done' })]);
    queryClient.clear();
  });
});
