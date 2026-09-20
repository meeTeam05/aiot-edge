import { httpClient, ApiError, type AuthRequestConfig } from './httpClient';
import {
  isRecord,
  type AuthSession,
  type LoginRequestDto,
  type LoginResponseDto,
  type RefreshRequestDto,
  type RefreshResponseDto,
  type RegisterRequestDto,
  type User,
  userFromDto,
} from '../models/user';

function responseRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError('Unexpected server response', 0);
  return value;
}

function requiredToken(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError('Unexpected server response', 0);
  }
  return value;
}

function mapLoginResponse(value: unknown): AuthSession {
  const body = responseRecord(value);
  try {
    return {
      accessToken: requiredToken(body.accessToken),
      refreshToken: requiredToken(body.refreshToken),
      user: userFromDto(body.user),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unexpected server response', 0);
  }
}

const skipAuth: AuthRequestConfig = { skipAuth: true };

export const authApi = {
  async login(request: LoginRequestDto): Promise<AuthSession> {
    const response = await httpClient.post<LoginResponseDto>('/auth/login', request, skipAuth);
    return mapLoginResponse(response.data);
  },

  async register(request: RegisterRequestDto): Promise<User> {
    const response = await httpClient.post('/auth/register', request, skipAuth);
    try {
      return userFromDto(response.data);
    } catch {
      throw new ApiError('Unexpected server response', 0);
    }
  },

  async refresh(request: RefreshRequestDto): Promise<RefreshResponseDto> {
    const response = await httpClient.post<RefreshResponseDto>('/auth/refresh', request, skipAuth);
    const body = responseRecord(response.data);
    const accessToken = requiredToken(body.accessToken);
    const refreshToken = body.refreshToken;
    if (refreshToken !== undefined && (typeof refreshToken !== 'string' || refreshToken.length === 0)) {
      throw new ApiError('Unexpected server response', 0);
    }
    return { accessToken, ...(refreshToken === undefined ? {} : { refreshToken }) };
  },

  async logout(): Promise<void> {
    await httpClient.post('/auth/logout');
  },
};
