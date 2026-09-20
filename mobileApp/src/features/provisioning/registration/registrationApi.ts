import { ApiError, httpClient } from '../../../api/httpClient';

import {
  deviceRegistrationFromDto,
  RegistrationDataMappingError,
  type DeviceRegistrationRequest,
  type DeviceRegistrationResult,
} from './models/registrationModels';

export interface RegistrationApi {
  register(request: DeviceRegistrationRequest): Promise<DeviceRegistrationResult>;
}

/** Existing authenticated POST /devices registration contract only. */
export const registrationApi: RegistrationApi = {
  async register(request) {
    const response = await httpClient.post<unknown>('/devices', {
      device_id: request.deviceId.trim().toLowerCase(),
      name: request.name,
      home_id: request.homeId,
    });
    try {
      return deviceRegistrationFromDto(response.data);
    } catch (error) {
      if (error instanceof RegistrationDataMappingError) throw new ApiError(error.message, 0);
      throw error;
    }
  },
};
