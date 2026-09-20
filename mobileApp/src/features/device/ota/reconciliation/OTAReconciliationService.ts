import type { QueryClient } from '@tanstack/react-query';

import { deviceDashboardQueryKeys, deviceQueryOptions } from '../../hooks/useDeviceDashboardQueries';
import type { Device } from '../../models/deviceModels';
import { homeQueryKeys } from '../../../home/hooks/useHomeQueries';
import { deviceOtaQueryKeys } from '../hooks/useDeviceOta';
import type { OtaRealtimeProgress } from '../models/otaProgressModels';

export const OTA_RECONCILIATION_INTERVAL_MS = 5_000;
export const OTA_RECONCILIATION_MAX_DURATION_MS = 120_000;

interface ReconciliationRun {
  deviceId: string;
  requestedVersion: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface OtaReconciliationDependencies {
  fetchDevice?: (deviceId: string) => Promise<Device | null>;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Reconciles the firmware result from the existing GET /devices data source.
 * A reboot is successful only when that source reports the requested version.
 */
export class OTAReconciliationService {
  private readonly runs = new Map<string, ReconciliationRun>();
  private readonly fetchDevice: (deviceId: string) => Promise<Device | null>;
  private readonly now: () => number;
  private readonly scheduleTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private readonly cancelTimeout: (timer: ReturnType<typeof setTimeout>) => void;

  constructor(
    private readonly queryClient: QueryClient,
    dependencies: OtaReconciliationDependencies = {},
  ) {
    this.fetchDevice = dependencies.fetchDevice ?? (deviceId => queryClient.fetchQuery(deviceQueryOptions(deviceId)));
    this.now = dependencies.now ?? Date.now;
    this.scheduleTimeout = dependencies.setTimeout ?? setTimeout;
    this.cancelTimeout = dependencies.clearTimeout ?? clearTimeout;
  }

  /** Starts one run per device. Duplicate/replayed reboot events are no-ops. */
  start(deviceId: string, requestedVersion: string | null): boolean {
    const normalizedId = normaliseDeviceId(deviceId);
    if (requestedVersion === null || requestedVersion.trim().length === 0 || this.runs.has(normalizedId)) return false;

    const run: ReconciliationRun = {
      deviceId: normalizedId,
      requestedVersion,
      startedAt: this.now(),
      timer: null,
    };
    this.runs.set(normalizedId, run);
    this.updateProgress(run, 'waiting_reboot');
    this.invalidateDeviceCaches(normalizedId);
    this.scheduleNext(run);
    return true;
  }

  cancel(deviceId: string): boolean {
    const normalizedId = normaliseDeviceId(deviceId);
    const run = this.runs.get(normalizedId);
    if (run === undefined) return false;
    if (run.timer !== null) this.cancelTimeout(run.timer);
    this.runs.delete(normalizedId);
    return true;
  }

  private scheduleNext(run: ReconciliationRun): void {
    run.timer = this.scheduleTimeout(() => { this.check(run).catch(() => undefined); }, OTA_RECONCILIATION_INTERVAL_MS);
  }

  private async check(run: ReconciliationRun): Promise<void> {
    if (!this.isActive(run)) return;
    if (this.elapsed(run) >= OTA_RECONCILIATION_MAX_DURATION_MS) return this.finish(run, 'timeout');

    this.updateProgress(run, 'checking_device');
    this.invalidateDeviceCaches(run.deviceId);
    try {
      const device = await this.fetchDevice(run.deviceId);
      if (!this.isActive(run)) return;
      if (device?.online === true) {
        return this.finish(run, device.firmwareVer === run.requestedVersion ? 'completed' : 'failed');
      }
    } catch {
      // The device may still be restarting or the network request may be transient; retry until the deadline.
    }

    if (!this.isActive(run)) return;
    if (this.elapsed(run) >= OTA_RECONCILIATION_MAX_DURATION_MS) return this.finish(run, 'timeout');
    this.updateProgress(run, 'waiting_reboot');
    this.scheduleNext(run);
  }

  private finish(run: ReconciliationRun, state: Extract<OtaRealtimeProgress['state'], 'completed' | 'failed' | 'timeout'>): void {
    if (!this.isActive(run)) return;
    if (run.timer !== null) this.cancelTimeout(run.timer);
    this.runs.delete(run.deviceId);
    this.updateProgress(run, state);
    this.invalidateDeviceCaches(run.deviceId);
  }

  private updateProgress(run: ReconciliationRun, state: OtaRealtimeProgress['state']): void {
    this.queryClient.setQueryData<OtaRealtimeProgress>(deviceOtaQueryKeys.progress(run.deviceId), current => ({
      eventId: current?.eventId ?? null,
      state,
      progress: current?.progress ?? null,
      occurredAt: new Date(this.now()),
      errorMessage: current?.errorMessage ?? null,
      requestedVersion: current?.requestedVersion ?? run.requestedVersion,
    }));
  }

  private invalidateDeviceCaches(deviceId: string): void {
    this.queryClient.invalidateQueries({ queryKey: deviceOtaQueryKeys.catalog(deviceId) }).catch(() => undefined);
    this.queryClient.invalidateQueries({ queryKey: deviceDashboardQueryKeys.device(deviceId) }).catch(() => undefined);
    this.queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
  }

  private elapsed(run: ReconciliationRun): number { return this.now() - run.startedAt; }
  private isActive(run: ReconciliationRun): boolean { return this.runs.get(run.deviceId) === run; }
}

function normaliseDeviceId(deviceId: string): string { return deviceId.trim().toLowerCase(); }
