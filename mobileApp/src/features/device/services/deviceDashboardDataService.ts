import { deviceDashboardApi, type CommandHistoryRequest, type TelemetryRequest } from '../api/deviceDashboardApi';

/** Service boundary kept consistent with Flutter's DeviceService. All operations are read-only in Phase 4.2. */
export const deviceDashboardDataService = {
  getDevice: deviceDashboardApi.getDevice,
  getShadow: deviceDashboardApi.getShadow,
  getTelemetry: (deviceId: string, request: TelemetryRequest) => deviceDashboardApi.listTelemetry(deviceId, request),
  getCommands: (deviceId: string, request: CommandHistoryRequest) => deviceDashboardApi.listCommands(deviceId, request),
};
