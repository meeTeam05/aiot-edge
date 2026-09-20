import type { Device, Room } from '../../../home/models/homeModels';

export const DEVICE_NAME_FALLBACK = 'Your Smart Air device';
export const ROOM_NAME_FALLBACK = 'No room assigned';

function displayValue(value: string | null | undefined, fallback: string): string {
  return value?.trim() ? value.trim() : fallback;
}

export function provisionCompletionSummary(input: {
  device?: Device;
  deviceName?: string | null;
  roomName?: string | null;
  rooms?: Room[];
}): { deviceName: string; roomName: string } {
  const deviceName = input.deviceName === undefined ? input.device?.name : input.deviceName;
  const roomName = input.roomName === undefined
    ? input.device?.roomId === null || input.device?.roomId === undefined
      ? null
      : input.rooms?.find(room => room.id === input.device?.roomId)?.name
    : input.roomName;
  return { deviceName: displayValue(deviceName, DEVICE_NAME_FALLBACK), roomName: displayValue(roomName, ROOM_NAME_FALLBACK) };
}
