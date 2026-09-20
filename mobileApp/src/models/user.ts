export interface User {
  id: string;
  email: string;
  fullName: string | null;
}

/** Server-shaped user payload. Keep snake_case at the transport boundary. */
export interface UserDto {
  id: string;
  email: string;
  full_name?: string | null;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RegisterRequestDto extends LoginRequestDto {
  full_name: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface RefreshRequestDto {
  refreshToken: string;
}

export interface RefreshResponseDto {
  accessToken: string;
  refreshToken?: string;
}

export interface LogoutResponseDto {
  success: true;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function userFromDto(value: unknown): User {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.email !== 'string') {
    throw new Error('Unexpected user response');
  }
  if (value.full_name !== undefined && value.full_name !== null && typeof value.full_name !== 'string') {
    throw new Error('Unexpected user response');
  }

  return {
    id: value.id,
    email: value.email,
    fullName: value.full_name ?? null,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
