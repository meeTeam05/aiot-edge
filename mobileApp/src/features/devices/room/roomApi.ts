import { ApiError, httpClient } from '../../../api/httpClient';
import { deviceFromDto, HomeDataMappingError, type Device } from '../../home/models/homeModels';

export interface RoomApi {
  assign(deviceId: string, roomId: string): Promise<Device>;
}

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

/** Existing authenticated Flutter DeviceService PUT /devices/:id room contract. */
export const roomApi: RoomApi = {
  async assign(deviceId, roomId) {
    const response = await httpClient.put<unknown>(`/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}`, { room_id: roomId });
    try {
      return deviceFromDto(response.data);
    } catch (error) {
      if (error instanceof HomeDataMappingError) throw new ApiError(error.message, 0);
      throw error;
    }
  },
};
