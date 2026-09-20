import { useSessionStore } from '../state/sessionStore';

export function useLogout() {
  return useSessionStore(state => state.logout);
}
