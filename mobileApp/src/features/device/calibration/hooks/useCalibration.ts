import { useEffect, useState } from 'react';
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';

import { calibrationApi } from '../api/calibrationApi';
import {
  CalibrationPollingCancelledError,
  pollCalibrationCommand,
} from '../services/calibrationPolling';
import type {
  CalibrationPollingResult,
  CalibrationPollingStatus,
  CalibrationType,
} from '../models/calibrationModels';

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

export const calibrationQueryKeys = {
  commandHistory: (deviceId: string) => ['device', normaliseDeviceId(deviceId), 'calibration', 'commands'] as const,
};

export function calibrationCommandHistoryQueryOptions(deviceId: string, enabled = true) {
  const normalizedId = normaliseDeviceId(deviceId);
  return queryOptions({
    queryKey: calibrationQueryKeys.commandHistory(normalizedId),
    queryFn: () => calibrationApi.getCommandHistory(normalizedId),
    enabled: enabled && normalizedId.length > 0,
  });
}

export function useCalibrationCommandHistoryQuery(deviceId: string, enabled = true) {
  return useQuery(calibrationCommandHistoryQueryOptions(deviceId, enabled));
}

export function useStartCalibrationMutation(deviceId: string) {
  return useMutation({
    mutationFn: (type: CalibrationType) => calibrationApi.start(deviceId, type),
  });
}

export interface CalibrationTrackingState extends CalibrationPollingResult {
  error: Error | null;
  isPolling: boolean;
}

const idleTrackingState: CalibrationTrackingState = { command: null, error: null, isPolling: false, status: 'pending' };

/** Polls only while a submitted calibration command ID is supplied; it never writes shadow or device state. */
export function useCalibrationCommandTracking(deviceId: string, commandId: string | null): CalibrationTrackingState {
  const [state, setState] = useState<CalibrationTrackingState>(idleTrackingState);
  const commandHistory = useCalibrationCommandHistoryQuery(deviceId, commandId !== null);

  // The router invalidates this query after command.updated. Its REST result can
  // finish polling early, but an SSE frame alone is never a completion authority.
  useEffect(() => {
    if (commandId === null || state.isPolling === false) return;
    const command = commandHistory.data?.find(item => item.id === commandId);
    if (command?.status !== 'done' && command?.status !== 'error' && command?.status !== 'timeout') return;
    setState({ command, error: null, isPolling: false, status: command.status });
  }, [commandHistory.data, commandId, state.isPolling]);

  useEffect(() => {
    if (commandId === null) {
      setState(idleTrackingState);
      return undefined;
    }

    const controller = new AbortController();
    setState({ command: null, error: null, isPolling: true, status: 'pending' });
    pollCalibrationCommand({
      commandId,
      deviceId,
      onStateChange: result => setState({ ...result, error: null, isPolling: true }),
      signal: controller.signal,
    }).then(result => {
      if (!controller.signal.aborted) setState({ ...result, error: null, isPolling: false });
    }).catch(error => {
      if (!controller.signal.aborted && !(error instanceof CalibrationPollingCancelledError)) {
        setState(current => ({ ...current, error: error instanceof Error ? error : new Error(String(error)), isPolling: false, status: 'error' }));
      }
    });
    return () => controller.abort();
  }, [commandId, deviceId]);

  return state;
}

export function calibrationStatusIsTerminal(status: CalibrationPollingStatus): boolean {
  return status === 'done' || status === 'error' || status === 'timeout';
}
