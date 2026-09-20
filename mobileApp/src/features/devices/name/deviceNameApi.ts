import { ApiError, httpClient } from '../../../api/httpClient';
import { deviceFromDto, HomeDataMappingError, type Device } from '../../home/models/homeModels';

export interface DeviceNameApi {
  update(deviceId: string, name: string): Promise<Device>;
}

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

/** Existing authenticated Flutter DeviceService PUT /devices/:id contract. */
export const deviceNameApi: DeviceNameApi = {
  async update(deviceId, name) {
    const response = await httpClient.put<unknown>(`/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}`, { name });
    try {
      return deviceFromDto(response.data);
    } catch (error) {
      if (error instanceof HomeDataMappingError) throw new ApiError(error.message, 0);
      throw error;
    }
  },
};
