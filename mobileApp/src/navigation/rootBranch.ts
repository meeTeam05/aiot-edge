import type { AuthenticationStatus } from '../state/sessionStore';

export type RootNavigatorBranch = 'loading' | 'auth' | 'app';

/** Flutter router equivalent: do not expose auth routes while bootstrap is unresolved. */
export function getRootNavigatorBranch(status: AuthenticationStatus): RootNavigatorBranch {
  if (status === 'bootstrapping') return 'loading';
  return status === 'authenticated' ? 'app' : 'auth';
}
