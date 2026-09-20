import type { QueryClient } from '@tanstack/react-query';

import { homeQueryKeys } from '../../features/home/hooks/useHomeQueries';
import type { Device } from '../../features/home/models/homeModels';
import { notificationQueryKeys } from '../../features/notifications/hooks/useNotificationsQuery';
import { applyRealtimeNotification } from '../../features/notifications/realtime';
import { deviceDashboardQueryKeys } from '../../features/device/hooks/useDeviceDashboardQueries';
import { applyOtaProgressEvent, OTAReconciliationService } from '../../features/device/ota/realtime';
import { deviceOtaQueryKeys } from '../../features/device/ota/hooks/useDeviceOta';
import { calibrationQueryKeys } from '../../features/device/calibration/hooks/useCalibration';
import type { OtaRealtimeProgress } from '../../features/device/ota/models/otaProgressModels';
import type { Command, DeviceShadow, TelemetryPoint } from '../../features/device/models/deviceModels';
import { reportedShadowFromEvent, type RealtimeEvent } from './realtimeEvents';

export class RealtimeEventRouter {
  private readonly otaReconciliation: OTAReconciliationService;
  private readonly eventIds = new Set<string>();
  private readonly latestEventTimes = new Map<string, number>();

  constructor(private readonly queryClient: QueryClient) {
    this.otaReconciliation = new OTAReconciliationService(queryClient);
  }

  dispatch(event: RealtimeEvent): void {
    if (!this.acceptsEvent(event)) return;
    if (event.type === 'device.status') this.patchDeviceStatus(event);
    if (event.type === 'shadow.reported') this.patchReportedShadow(event);
    if (event.type === 'telemetry.point') this.appendTelemetry(event);
    if (event.type === 'command.updated') this.patchCommand(event);
    if (event.type === 'ota.progress') this.applyOtaProgress(event);
    if (event.type === 'replay.reset') return this.invalidateSnapshots();
    applyRealtimeNotification(this.queryClient, event);
  }

  /**
   * SSE reconnect/replay can resend frames. Keep router state bounded and reject
   * only stale snapshots; telemetry remains ordered in its rolling series.
   */
  private acceptsEvent(event: RealtimeEvent): boolean {
    if (this.eventIds.has(event.id)) return false;
    this.eventIds.add(event.id);
    if (this.eventIds.size > 1_000) this.eventIds.delete(this.eventIds.values().next().value as string);

    const key = event.type === 'telemetry.point' || event.type === 'replay.reset'
      ? null
      : event.type === 'command.updated'
        ? `${event.type}:${event.deviceId}:${event.payload.commandId}`
        : `${event.type}:${event.deviceId}`;
    if (key === null) return true;
    const eventTime = event.occurredAt.getTime();
    const previous = this.latestEventTimes.get(key);
    if (previous !== undefined && eventTime < previous) return false;
    this.latestEventTimes.set(key, eventTime);
    return true;
  }

  private applyOtaProgress(event: Extract<RealtimeEvent, { type: 'ota.progress' }>): void {
    if (!applyOtaProgressEvent(this.queryClient, event)) return;
    const progress = this.queryClient.getQueryData<OtaRealtimeProgress>(deviceOtaQueryKeys.progress(event.deviceId));
    if (progress?.state === 'failed') {
      this.otaReconciliation.cancel(event.deviceId);
      return;
    }
    if (event.payload.status !== 'rebooting') return;
    this.otaReconciliation.start(event.deviceId, progress?.requestedVersion ?? null);
  }

  private patchDeviceStatus(event: Extract<RealtimeEvent, { type: 'device.status' }>): void {
    this.queryClient.setQueryData<Device[]>(homeQueryKeys.devices(), current => current?.map(device => (
      normaliseDeviceId(device.id) === event.deviceId ? { ...device, online: event.payload.online, lastSeen: event.occurredAt, firmwareVer: event.payload.firmware ?? device.firmwareVer } : device
    )));
    this.queryClient.setQueryData<Device | null>(deviceDashboardQueryKeys.device(event.deviceId), current => (
      current === null || current === undefined ? current : { ...current, online: event.payload.online, lastSeen: event.occurredAt, firmwareVer: event.payload.firmware ?? current.firmwareVer }
    ));
  }

  private patchReportedShadow(event: Extract<RealtimeEvent, { type: 'shadow.reported' }>): void {
    this.queryClient.setQueryData<DeviceShadow>(deviceDashboardQueryKeys.shadow(event.deviceId), current => reportedShadowFromEvent(event, current ?? null));
    this.queryClient.setQueryData<Device[]>(homeQueryKeys.devices(), current => current?.map(device => (
      normaliseDeviceId(device.id) === event.deviceId ? {
        ...device,
        mode: typeof event.payload.reported.mode === 'string' ? event.payload.reported.mode : device.mode,
        relay1: typeof event.payload.reported.relay_1 === 'boolean' ? event.payload.reported.relay_1 : device.relay1,
        relay2: typeof event.payload.reported.relay_2 === 'boolean' ? event.payload.reported.relay_2 : device.relay2,
        relay3: typeof event.payload.reported.relay_3 === 'boolean' ? event.payload.reported.relay_3 : device.relay3,
      } : device
    )));
  }

  private appendTelemetry(event: Extract<RealtimeEvent, { type: 'telemetry.point' }>): void {
    this.queryClient.setQueriesData<TelemetryPoint[]>({ queryKey: ['device', event.deviceId, 'telemetry'] }, current => appendTelemetryPoint(current ?? [], event.payload.point));
  }

  private patchCommand(event: Extract<RealtimeEvent, { type: 'command.updated' }>): void {
    this.queryClient.setQueriesData<Command[]>({ queryKey: ['device', event.deviceId, 'commands'] }, current => {
      const commands = [...(current ?? [])];
      const index = commands.findIndex(command => command.id === event.payload.commandId);
      const existing = index < 0 ? null : commands[index] ?? null;
      if (existing !== null && isTerminal(existing.status) && !isTerminal(event.payload.status)) return commands;
      const terminal = event.payload.status === 'done' || event.payload.status === 'error' || event.payload.status === 'timeout';
      const next: Command = { id: event.payload.commandId, payload: Object.keys(event.payload.payload).length > 0 ? event.payload.payload : existing?.payload ?? {}, status: event.payload.status, createdAt: existing?.createdAt ?? event.occurredAt, executedAt: terminal ? event.occurredAt : existing?.executedAt ?? null, errorMessage: event.payload.errorMessage ?? existing?.errorMessage ?? null };
      if (index < 0) commands.unshift(next); else commands[index] = next;
      return commands.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    });
    // Calibration observes a REST command-history query; only calibration
    // frames expedite that authoritative refresh, never completing it directly.
    if (event.payload.payload.type === 'calibrate_co' || event.payload.payload.type === 'calibrate_no2') {
      this.queryClient.invalidateQueries({ queryKey: calibrationQueryKeys.commandHistory(event.deviceId) }).catch(() => undefined);
    }
  }

  private invalidateSnapshots(): void {
    this.queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
    this.queryClient.invalidateQueries({ queryKey: ['device'] }).catch(() => undefined);
    this.queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() }).catch(() => undefined);
  }
}

function normaliseDeviceId(deviceId: string): string { return deviceId.trim().toLowerCase(); }

export function appendTelemetryPoint(current: TelemetryPoint[], point: TelemetryPoint): TelemetryPoint[] {
  const keyed = new Map<string, TelemetryPoint>();
  for (const value of [...current, point]) keyed.set(telemetryKey(value), value);
  return [...keyed.values()].sort((left, right) => left.ts.getTime() - right.ts.getTime()).slice(-720);
}

function isTerminal(status: Command['status']): boolean {
  return status === 'done' || status === 'error' || status === 'timeout';
}

function telemetryKey(point: TelemetryPoint): string {
  return [point.ts.getTime(), point.mode ?? '', point.temperature, point.humidity, point.coPpm, point.no2Ppm].join('|');
}

export const realtimeEventRouter = (queryClient: QueryClient) => new RealtimeEventRouter(queryClient);
