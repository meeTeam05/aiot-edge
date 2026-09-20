import type { Device } from '../../home/models/homeModels';
import { roomApi, type RoomApi } from './roomApi';
import { validatedRoomId } from './models/roomAssignmentModels';

export async function assignDeviceRoom(deviceId: string, roomId: string | null, api: RoomApi = roomApi): Promise<Device> {
  return api.assign(deviceId, validatedRoomId(roomId));
}
