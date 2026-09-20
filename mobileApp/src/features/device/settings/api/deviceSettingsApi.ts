import { ApiError, httpClient } from '../../../../api/httpClient';
import { deviceFromDto, HomeDataMappingError, type Device } from '../../../home/models/homeModels';

export interface UpdateDeviceRequest {
  name?: string;
  roomId?: string | null;
}

function normalizedDeviceId(deviceId: string): string { return deviceId.trim().toLowerCase(); }

function mapDevice(value: unknown): Device {
  try {
    return deviceFromDto(value);
  } catch (error) {
    if (error instanceof HomeDataMappingError) throw new ApiError(error.message, 0);
    throw error;
  }
}

/** Existing Flutter DeviceService settings contracts; no backend behavior is duplicated. */
export const deviceSettingsApi = {
  async updateDevice(deviceId: string, request: UpdateDeviceRequest): Promise<Device> {
    const body = {
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.roomId === undefined ? {} : { room_id: request.roomId }),
    };
    const response = await httpClient.put<unknown>(`/devices/${encodeURIComponent(normalizedDeviceId(deviceId))}`, body);
    return mapDevice(response.data);
  },

  async deleteDevice(deviceId: string): Promise<void> {
    await httpClient.delete(`/devices/${encodeURIComponent(normalizedDeviceId(deviceId))}`);
  },
};
