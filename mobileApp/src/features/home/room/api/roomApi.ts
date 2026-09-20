import { ApiError, httpClient } from '../../../../api/httpClient';
import { HomeDataMappingError, roomFromDto } from '../../models/homeModels';
import type { CreateRoomRequest, Room, UpdateRoomRequest } from '../models/roomModels';

function mapRoom(value: unknown): Room {
  try { return roomFromDto(value); } catch (error) {
    if (error instanceof HomeDataMappingError) throw new ApiError(error.message, 0);
    throw error;
  }
}

/** Existing authenticated room mutation contracts; room listing remains on the shared home query. */
export const roomApi = {
  async create(homeId: string, request: CreateRoomRequest): Promise<Room> {
    const response = await httpClient.post<unknown>(`/homes/${encodeURIComponent(homeId)}/rooms`, { name: request.name });
    return mapRoom(response.data);
  },
  async update(roomId: string, request: UpdateRoomRequest): Promise<Room> {
    const response = await httpClient.put<unknown>(`/rooms/${encodeURIComponent(roomId)}`, { name: request.name });
    return mapRoom(response.data);
  },
  async remove(roomId: string): Promise<void> { await httpClient.delete(`/rooms/${encodeURIComponent(roomId)}`); },
};
