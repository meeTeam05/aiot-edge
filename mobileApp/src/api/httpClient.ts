import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import { getEnvironment } from '../services/environment';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network error — check your connection') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Session expired — please log in again') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface AuthRequestConfig extends AxiosRequestConfig {
  skipAuth?: boolean;
  authRetried?: boolean;
}

interface HttpClientAuthHandlers {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string>;
  onRefreshFailure: () => Promise<void>;
}

let authHandlers: HttpClientAuthHandlers | null = null;
let refreshPromise: Promise<string> | null = null;

export const httpClient: AxiosInstance = axios.create({
  baseURL: getEnvironment().apiBaseUrl,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

export function configureHttpClientAuth(handlers: HttpClientAuthHandlers): void {
  authHandlers = handlers;
}

function isAuthEndpoint(url: string | undefined): boolean {
  return url?.includes('/auth/') === true || url?.startsWith('auth/') === true;
}

function refreshAccessToken(): Promise<string> {
  if (authHandlers === null) return Promise.reject(new AuthenticationError());
  if (refreshPromise !== null) return refreshPromise;

  const pending = authHandlers.refreshAccessToken();
  refreshPromise = pending;
  pending
    .finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    })
    .catch(() => undefined);
  return pending;
}

function normaliseError(error: unknown): Error {
  if (error instanceof ApiError || error instanceof NetworkError || error instanceof AuthenticationError) {
    return error;
  }
  if (!axios.isAxiosError(error)) return error instanceof Error ? error : new Error('Unknown error');

  const statusCode = error.response?.status;
  const body = error.response?.data;
  const message = typeof body === 'object'
    && body !== null
    && 'error' in body
    && typeof body.error === 'string'
    ? body.error
    : undefined;
  if (statusCode !== undefined) return new ApiError(message ?? 'Unknown error', statusCode);
  return new NetworkError();
}

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const authConfig = config as AuthRequestConfig & InternalAxiosRequestConfig;
  if (authConfig.skipAuth) return config;
  const accessToken = authHandlers?.getAccessToken();
  if (accessToken) authConfig.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

httpClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const request = error.config as (AuthRequestConfig & InternalAxiosRequestConfig) | undefined;
    const statusCode = error.response?.status;
    if (!request || statusCode !== 401 || isAuthEndpoint(request.url) || request.authRetried) {
      return Promise.reject(normaliseError(error));
    }

    try {
      const accessToken = await refreshAccessToken();
      request.authRetried = true;
      request.headers.Authorization = `Bearer ${accessToken}`;
      return httpClient.request(request);
    } catch {
      await authHandlers?.onRefreshFailure();
      return Promise.reject(new AuthenticationError());
    }
  },
);
