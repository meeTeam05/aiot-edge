import { ApiError, httpClient } from '../../../api/httpClient';
import {
  devicesFromDto,
  homesFromDto,
  HomeDataMappingError,
  roomsFromDto,
  homeFromDto,
  type CreateHomeRequest,
  type Device,
  type Home,
  type Room,
  type UpdateHomeRequest,
} from '../models/homeModels';

function mapResponse<T>(mapper: (value: unknown) => T, value: unknown): T {
  try {
    return mapper(value);
  } catch (error) {
    if (error instanceof HomeDataMappingError) throw new ApiError(error.message, 0);
    throw error;
  }
}

/** Existing authenticated HomeService contracts, mapped at the transport boundary. */
export const homeApi = {
  async listDevices(): Promise<Device[]> {
    const response = await httpClient.get<unknown>('/devices');
    return mapResponse(devicesFromDto, response.data);
  },

  async listHomes(): Promise<Home[]> {
    const response = await httpClient.get<unknown>('/homes');
    return mapResponse(homesFromDto, response.data);
  },

  async listRooms(homeId: string): Promise<Room[]> {
    const response = await httpClient.get<unknown>(`/homes/${encodeURIComponent(homeId)}/rooms`);
    return mapResponse(roomsFromDto, response.data);
  },

  async createHome(request: CreateHomeRequest): Promise<Home> {
    const response = await httpClient.post<unknown>('/homes', {
      name: request.name,
      timezone: request.timezone ?? 'Asia/Ho_Chi_Minh',
    });
    return mapResponse(homeFromDto, response.data);
  },

  async updateHome(homeId: string, request: UpdateHomeRequest): Promise<Home> {
    const response = await httpClient.put<unknown>(`/homes/${encodeURIComponent(homeId)}`, { name: request.name });
    return mapResponse(homeFromDto, response.data);
  },

  async deleteHome(homeId: string): Promise<void> {
    await httpClient.delete(`/homes/${encodeURIComponent(homeId)}`);
  },
};
