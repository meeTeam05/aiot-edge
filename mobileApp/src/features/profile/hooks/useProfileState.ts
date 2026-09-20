import { useMemo } from 'react';

import { useLogout } from '../../../hooks/useLogout';
import { useSessionStore } from '../../../state/sessionStore';
import { useHomesQuery } from '../../home/hooks/useHomeQueries';
import { profileHomesStateFromQuery, profileUserDisplayFromUser } from '../models/profileModels';
import { useThemePreferenceStore } from '../services/themePreference';

/** Composes existing session/home server state into Flutter Profile presentation state. */
export function useProfileState() {
  const user = useSessionStore(state => state.user);
  const homesQuery = useHomesQuery();
  const userDisplay = useMemo(() => profileUserDisplayFromUser(user), [user]);
  const homesState = profileHomesStateFromQuery(homesQuery);
  const themePreference = useThemePreferenceStore(state => state.preference);
  const setThemePreference = useThemePreferenceStore(state => state.setPreference);

  return { homesState, setThemePreference, themePreference, userDisplay };
}

/** Re-exports the established logout action; Profile owns no authentication state. */
export function useProfileLogout() {
  return useLogout();
}
