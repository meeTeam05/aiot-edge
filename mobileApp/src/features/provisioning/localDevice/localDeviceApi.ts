import axios, { type AxiosInstance } from 'axios';

import {
  localConfigurationAcknowledged,
  localDeviceInfoFromDto,
  LocalDeviceError,
  type LocalDeviceConfigurationRequest,
  type LocalDeviceInfo,
} from './models/localDeviceModels';

export const LOCAL_CONNECT_TIMEOUT_MS = 2_000;
export const LOCAL_SEND_TIMEOUT_MS = 10_000;
export const LOCAL_RECEIVE_TIMEOUT_MS = 2_000;

export interface LocalDeviceApi {
  getInfo(host: string): Promise<LocalDeviceInfo>;
  configure(host: string, request: LocalDeviceConfigurationRequest): Promise<void>;
}

function normaliseHost(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new LocalDeviceError('sessionMissing', 'Provisioning session has no device IP address');
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return new URL(trimmed).host;
  } catch {
    throw new LocalDeviceError('sessionMissing', 'Provisioning session has an invalid device IP address');
  }
  return trimmed;
}

function localClient(host: string): AxiosInstance {
  return axios.create({
    baseURL: `http://${normaliseHost(host)}`,
    // React Native Axios exposes one request timeout. Keep Flutter's longer
    // send budget for writes; GET readiness uses its explicit 2-second budget.
    timeout: LOCAL_SEND_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function normaliseLocalDeviceError(error: unknown, fallback: LocalDeviceError['code'] = 'unreachable'): LocalDeviceError {
  if (error instanceof LocalDeviceError) return error;
  if (!axios.isAxiosError(error)) return new LocalDeviceError(fallback, error instanceof Error ? error.message : 'Unable to reach device');
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new LocalDeviceError('timeout', 'Timed out connecting to the device');
  }
  const body = error.response?.data;
  const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : undefined;
  if (error.response !== undefined) return new LocalDeviceError('configurationFailed', message ?? 'Device rejected local configuration', error.response.status);
  return new LocalDeviceError('unreachable', 'Unable to reach the device on the local network');
}

/** Local-only firmware API. It never reuses authenticated cloud HTTP configuration. */
export const localDeviceApi: LocalDeviceApi = {
  async getInfo(host) {
    try {
      const response = await localClient(host).get<unknown>('/api/info', { timeout: LOCAL_CONNECT_TIMEOUT_MS });
      return localDeviceInfoFromDto(response.data);
    } catch (error) {
      throw normaliseLocalDeviceError(error);
    }
  },

  async configure(host, request) {
    try {
      const response = await localClient(host).post<unknown>('/api/config', {
        device_id: request.deviceId.trim().toLowerCase(),
        secret_key: request.secretKey,
        ...(request.brokerUri?.trim() ? { broker_uri: request.brokerUri.trim() } : {}),
      });
      localConfigurationAcknowledged(response.data);
    } catch (error) {
      throw normaliseLocalDeviceError(error, 'configurationFailed');
    }
  },
};
