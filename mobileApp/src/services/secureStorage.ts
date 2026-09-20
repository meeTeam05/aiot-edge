import Keychain from 'react-native-keychain';

import type { User } from '../models/user';

const SESSION_SERVICE = 'com.smartair.mobile.session';
const SESSION_ACCOUNT = 'smart-air-session';

export interface PersistedSession {
  refreshToken: string;
  user: User;
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  const user = session.user;
  return typeof session.refreshToken === 'string'
    && session.refreshToken.length > 0
    && typeof user === 'object'
    && user !== null
    && !Array.isArray(user)
    && typeof (user as Record<string, unknown>).id === 'string'
    && typeof (user as Record<string, unknown>).email === 'string'
    && ((user as Record<string, unknown>).fullName === null
      || typeof (user as Record<string, unknown>).fullName === 'string');
}

/** Persists only the refresh token and user profile; access tokens stay in memory. */
export const secureStorage = {
  async saveSession(session: PersistedSession): Promise<void> {
    await Keychain.setGenericPassword(SESSION_ACCOUNT, JSON.stringify(session), {
      service: SESSION_SERVICE,
    });
  },

  async getSession(): Promise<PersistedSession | null> {
    const credentials = await Keychain.getGenericPassword({ service: SESSION_SERVICE });
    if (!credentials) return null;

    try {
      const parsed: unknown = JSON.parse(credentials.password);
      if (isPersistedSession(parsed)) return parsed;
    } catch {
      // Treat malformed data like Flutter's corrupt user_json: clear it.
    }

    await this.clear();
    return null;
  },

  async clear(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
  },
};
