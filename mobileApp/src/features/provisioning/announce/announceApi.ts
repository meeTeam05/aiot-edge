import { ApiError, httpClient } from '../../../api/httpClient';

import { AnnounceDataMappingError, announceResponseFromDto } from './models/announceModels';

export interface AnnounceApi {
  check(deviceId: string): Promise<boolean>;
}

/** Existing authenticated cloud announcement endpoint only. */
export const announceApi: AnnounceApi = {
  async check(deviceId) {
    const response = await httpClient.get<unknown>(`/devices/announce/${encodeURIComponent(deviceId.trim().toLowerCase())}`);
    try {
      return announceResponseFromDto(response.data).announced;
    } catch (error) {
      if (error instanceof AnnounceDataMappingError) throw new ApiError(error.message, 0);
      throw error;
    }
  },
};
