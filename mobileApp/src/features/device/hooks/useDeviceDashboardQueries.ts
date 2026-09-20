import { queryOptions, useQuery } from '@tanstack/react-query';

import type { CommandHistoryRequest, TelemetryRequest } from '../api/deviceDashboardApi';
import { deviceDashboardDataService } from '../services/deviceDashboardDataService';

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

function telemetryKey(request: TelemetryRequest) {
  return {
    from: request.from?.toISOString() ?? null,
    to: request.to?.toISOString() ?? null,
    agg: request.agg ?? null,
    limit: request.limit ?? null,
  };
}

function commandKey(request: CommandHistoryRequest) {
  return { limit: request.limit ?? 50, offset: request.offset ?? 0 };
}

export const deviceDashboardQueryKeys = {
  device: (deviceId: string) => ['device', normaliseDeviceId(deviceId)] as const,
  shadow: (deviceId: string) => ['device', normaliseDeviceId(deviceId), 'shadow'] as const,
  telemetry: (deviceId: string, request: TelemetryRequest) =>
    ['device', normaliseDeviceId(deviceId), 'telemetry', telemetryKey(request)] as const,
  commands: (deviceId: string, request: CommandHistoryRequest = {}) =>
    ['device', normaliseDeviceId(deviceId), 'commands', commandKey(request)] as const,
};

export function deviceQueryOptions(deviceId: string) {
  const normalizedId = normaliseDeviceId(deviceId);
  return queryOptions({
    queryKey: deviceDashboardQueryKeys.device(normalizedId),
    queryFn: () => deviceDashboardDataService.getDevice(normalizedId),
    enabled: normalizedId.length > 0,
  });
}

export function shadowQueryOptions(deviceId: string) {
  const normalizedId = normaliseDeviceId(deviceId);
  return queryOptions({
    queryKey: deviceDashboardQueryKeys.shadow(normalizedId),
    queryFn: () => deviceDashboardDataService.getShadow(normalizedId),
    enabled: normalizedId.length > 0,
  });
}

export function telemetryQueryOptions(deviceId: string, request: TelemetryRequest = {}) {
  const normalizedId = normaliseDeviceId(deviceId);
  return queryOptions({
    queryKey: deviceDashboardQueryKeys.telemetry(normalizedId, request),
    queryFn: () => deviceDashboardDataService.getTelemetry(normalizedId, request),
    enabled: normalizedId.length > 0,
  });
}

export function commandHistoryQueryOptions(deviceId: string, request: CommandHistoryRequest = {}) {
  const normalizedId = normaliseDeviceId(deviceId);
  return queryOptions({
    queryKey: deviceDashboardQueryKeys.commands(normalizedId, request),
    queryFn: () => deviceDashboardDataService.getCommands(normalizedId, request),
    enabled: normalizedId.length > 0,
  });
}

export function useDeviceQuery(deviceId: string) {
  return useQuery(deviceQueryOptions(deviceId));
}

export function useDeviceShadowQuery(deviceId: string) {
  return useQuery(shadowQueryOptions(deviceId));
}

export function useDeviceTelemetryQuery(deviceId: string, request: TelemetryRequest = {}) {
  return useQuery(telemetryQueryOptions(deviceId, request));
}

export function useDeviceCommandHistoryQuery(deviceId: string, request: CommandHistoryRequest = {}) {
  return useQuery(commandHistoryQueryOptions(deviceId, request));
}
