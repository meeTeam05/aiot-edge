import { useSessionStore } from '../state/sessionStore';

export function useLogin() {
  const login = useSessionStore(state => state.login);
  const status = useSessionStore(state => state.status);
  const error = useSessionStore(state => state.error);

  return { login, error, isLoading: status === 'authenticating' };
}
