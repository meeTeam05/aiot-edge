import { ApiError, httpClient } from '../../../../api/httpClient';
import {
  otaCatalogFromDto,
  otaRequestFromDto,
  OtaDataMappingError,
  type OtaCatalogResponse,
  type OtaRequest,
} from '../models/otaModels';

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

function mapResponse<T>(mapper: (value: unknown) => T, value: unknown): T {
  try {
    return mapper(value);
  } catch (error) {
    if (error instanceof OtaDataMappingError) throw new ApiError(error.message, 0);
    throw error;
  }
}

/** Existing authenticated OTA contracts only; HTTP errors are normalized by httpClient. */
export const deviceOtaApi = {
  async getCatalog(deviceId: string): Promise<OtaCatalogResponse> {
    const response = await httpClient.get<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/ota/versions`,
    );
    return mapResponse(otaCatalogFromDto, response.data);
  },

  async requestOta(deviceId: string, version: string): Promise<OtaRequest> {
    const response = await httpClient.post<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/ota`,
      { version },
    );
    return mapResponse(otaRequestFromDto, response.data);
  },
};
