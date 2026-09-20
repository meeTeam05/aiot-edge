export class RoomAssignmentValidationError extends Error {
  constructor() {
    super('Select a room');
    this.name = 'RoomAssignmentValidationError';
  }
}

export function validatedRoomId(roomId: string | null): string {
  const value = roomId?.trim() ?? '';
  if (value.length === 0) throw new RoomAssignmentValidationError();
  return value;
}
