import { ApiError, httpClient } from '../../../api/httpClient';
import {
  commandsFromDto,
  dashboardDeviceFromDto,
  DeviceDataMappingError,
  deviceShadowFromDto,
  telemetryPointsFromDto,
  type Command,
  type Device,
  type DeviceShadow,
  type TelemetryPoint,
} from '../models/deviceModels';

export interface TelemetryRequest {
  from?: Date;
  to?: Date;
  agg?: string;
  limit?: number;
}

export interface CommandHistoryRequest {
  limit?: number;
  offset?: number;
}

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

function mapResponse<T>(mapper: (value: unknown) => T, value: unknown): T {
  try {
    return mapper(value);
  } catch (error) {
    if (error instanceof DeviceDataMappingError) throw new ApiError(error.message, 0);
    throw error;
  }
}

function dateQueryValue(date: Date | undefined): string | undefined {
  return date?.toISOString();
}

/** Read-only dashboard API. The backend has no GET /devices/:id endpoint. */
export const deviceDashboardApi = {
  async getDevice(deviceId: string): Promise<Device | null> {
    const response = await httpClient.get<unknown>('/devices');
    const normalizedId = normaliseDeviceId(deviceId);
    const devices = mapResponse((value: unknown) => {
      if (!Array.isArray(value)) throw new DeviceDataMappingError();
      return value.map(dashboardDeviceFromDto);
    }, response.data);
    return devices.find(device => normaliseDeviceId(device.id) === normalizedId) ?? null;
  },

  async getShadow(deviceId: string): Promise<DeviceShadow> {
    const response = await httpClient.get<unknown>(`/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/shadow`);
    return mapResponse(deviceShadowFromDto, response.data);
  },

  async listTelemetry(deviceId: string, request: TelemetryRequest = {}): Promise<TelemetryPoint[]> {
    const response = await httpClient.get<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/telemetry`,
      {
        params: {
          from: dateQueryValue(request.from),
          to: dateQueryValue(request.to),
          ...(request.agg === undefined ? {} : { agg: request.agg }),
          ...(request.limit === undefined ? {} : { limit: request.limit }),
        },
      },
    );
    return mapResponse(telemetryPointsFromDto, response.data);
  },

  async listCommands(deviceId: string, request: CommandHistoryRequest = {}): Promise<Command[]> {
    const response = await httpClient.get<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/commands`,
      { params: { limit: request.limit ?? 50, offset: request.offset ?? 0 } },
    );
    return mapResponse(commandsFromDto, response.data);
  },
};
