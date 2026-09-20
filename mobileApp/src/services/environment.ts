import Config from 'react-native-config';

export interface EnvironmentConfig { apiBaseUrl: string; }

let environment: EnvironmentConfig | null = Config.API_BASE_URL
  ? normaliseEnvironment({ apiBaseUrl: Config.API_BASE_URL })
  : null;

/** Reads the build-time API_BASE_URL without allowing feature code to hard-code it. */
export function configureEnvironment(config: EnvironmentConfig): void {
  environment = normaliseEnvironment(config);
}

function normaliseEnvironment(config: EnvironmentConfig): EnvironmentConfig {
  const apiBaseUrl = config.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+(?:\/.*)?$/.test(apiBaseUrl)) {
    throw new Error('API_BASE_URL must be an absolute HTTP(S) URL');
  }
  return { apiBaseUrl };
}

export function getEnvironment(): EnvironmentConfig {
  if (environment === null) {
    throw new Error('API_BASE_URL is not configured; set it in the active environment file');
  }
  return environment;
}
