export interface Device {
  id: string;
  name: string;
  homeId: string;
  roomId: string | null;
  online: boolean;
  lastSeen: Date | null;
  firmwareVer: string | null;
  mode: string | null;
  relay1: boolean | null;
  relay2: boolean | null;
  relay3: boolean | null;
  createdAt: Date | null;
}

export interface Home {
  id: string;
  name: string;
  address: string | null;
  ownerId: string | null;
  timezone: string;
}

/** Existing POST /homes request shape used by Flutter HomeService. */
export interface CreateHomeRequest {
  name: string;
  timezone?: string;
}

/** Existing PUT /homes/:id request shape; this phase updates the name only. */
export interface UpdateHomeRequest {
  name: string;
}

export interface Room {
  id: string;
  homeId: string;
  name: string;
  icon: string | null;
}

export interface DeviceDto {
  id: string;
  name: string;
  home_id: string;
  room_id: string | null;
  online: boolean;
  last_seen?: string | null;
  firmware_ver?: string | null;
  mode?: string | null;
  relay_1?: boolean | null;
  relay_2?: boolean | null;
  relay_3?: boolean | null;
  created_at?: string | null;
}

export interface HomeDto {
  id: string;
  name: string;
  address?: string | null;
  owner_id?: string | null;
  timezone?: string;
}

export interface RoomDto {
  id: string;
  home_id: string;
  name: string;
  icon?: string | null;
}

export class HomeDataMappingError extends Error {
  constructor() {
    super('Unexpected server response');
    this.name = 'HomeDataMappingError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) throw new HomeDataMappingError();
  return field;
}

function nullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === undefined || field === null) return null;
  if (typeof field !== 'string') throw new HomeDataMappingError();
  return field;
}

function nullableBoolean(value: Record<string, unknown>, key: string): boolean | null {
  const field = value[key];
  if (field === undefined || field === null) return null;
  if (typeof field !== 'boolean') throw new HomeDataMappingError();
  return field;
}

function nullableDate(value: Record<string, unknown>, key: string): Date | null {
  const raw = nullableString(value, key);
  if (raw === null) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new HomeDataMappingError();
  return date;
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new HomeDataMappingError();
  return value;
}

export function deviceFromDto(value: unknown): Device {
  const dto = record(value);
  const online = dto.online;
  if (online !== undefined && typeof online !== 'boolean') throw new HomeDataMappingError();
  return {
    id: requiredString(dto, 'id'),
    name: requiredString(dto, 'name'),
    homeId: requiredString(dto, 'home_id'),
    roomId: nullableString(dto, 'room_id'),
    online: online ?? false,
    lastSeen: nullableDate(dto, 'last_seen'),
    firmwareVer: nullableString(dto, 'firmware_ver'),
    mode: nullableString(dto, 'mode'),
    relay1: nullableBoolean(dto, 'relay_1'),
    relay2: nullableBoolean(dto, 'relay_2'),
    relay3: nullableBoolean(dto, 'relay_3'),
    createdAt: nullableDate(dto, 'created_at'),
  };
}

export function homeFromDto(value: unknown): Home {
  const dto = record(value);
  const timezone = dto.timezone;
  if (timezone !== undefined && typeof timezone !== 'string') throw new HomeDataMappingError();
  return {
    id: requiredString(dto, 'id'),
    name: requiredString(dto, 'name'),
    address: nullableString(dto, 'address'),
    ownerId: nullableString(dto, 'owner_id'),
    timezone: timezone ?? 'Asia/Ho_Chi_Minh',
  };
}

export function roomFromDto(value: unknown): Room {
  const dto = record(value);
  return {
    id: requiredString(dto, 'id'),
    homeId: requiredString(dto, 'home_id'),
    name: requiredString(dto, 'name'),
    icon: nullableString(dto, 'icon'),
  };
}

function listFromDto<T>(value: unknown, mapper: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new HomeDataMappingError();
  return value.map(mapper);
}

export function devicesFromDto(value: unknown): Device[] {
  return listFromDto(value, deviceFromDto);
}

export function homesFromDto(value: unknown): Home[] {
  return listFromDto(value, homeFromDto);
}

export function roomsFromDto(value: unknown): Room[] {
  return listFromDto(value, roomFromDto);
}
