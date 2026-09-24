import { config } from './config.js';

// Redis TTLs (seconds)
export const REDIS_TTL_ANNOUNCE = 300;   // device online announcement (5 min)
export const REDIS_TTL_OTA = 600;    // OTA progress cache (10 min)
export const REDIS_TTL_SHADOW = 3600;   // device shadow cache (1 hr)

// Auth
export const BCRYPT_ROUNDS = 12;
export const REFRESH_COOKIE_PATH = '/api/auth/refresh';
export const SECONDS_PER_DAY = 86_400;

// CORS
export const ALLOWED_ORIGINS = config.corsOrigins;

// Rate limits
export const RATE_LIMIT_COMMAND = { max: 30, timeWindow: '1 minute' };
export const RATE_LIMIT_DEVICE = { max: 20, timeWindow: '1 minute' };

// Telemetry aggregation whitelist
export const AGG_ALLOWED = new Set(['1m', '5m', '15m', '30m', '1h', '6h', '1d']);

// Query limits
export const COMMANDS_MAX_LIMIT = 200;
export const TELEMETRY_DEFAULT_LIMIT = 1000;
export const TELEMETRY_MAX_LIMIT = 5000;
export const MS_PER_DAY = 86_400_000;

// Per-user resource caps
export const MAX_HOMES_PER_USER = 10;
export const MAX_DEVICES_PER_HOME = 50;
export const MAX_ROOMS_PER_HOME = 30;

// Command type whitelist
export const COMMAND_TYPES = Object.freeze([
    'relay_set',
    'device_mode',
    'calibrate_co',
    'calibrate_no2',
    'set_time',
    'ai_set',
]);
