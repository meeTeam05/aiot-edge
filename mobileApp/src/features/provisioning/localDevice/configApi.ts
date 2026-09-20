import { localDeviceApi } from './localDeviceApi';
import type { LocalDeviceConfigurationRequest } from './models/localDeviceModels';

export interface ConfigApi {
  configure(host: string, request: LocalDeviceConfigurationRequest): Promise<void>;
}

/** Dedicated local configuration boundary; it delegates to the non-authenticated firmware client only. */
export const configApi: ConfigApi = {
  configure: (host, request) => localDeviceApi.configure(host, request),
};
