import type { User } from '../../../models/user';
import type { Home } from '../../home/models/homeModels';

export interface ProfileUserDisplay {
  email: string;
  fullName: string | null;
  initial: string;
}

export type ProfileHomesState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'data'; homes: Home[] };

interface HomesQuerySnapshot {
  data?: Home[];
  isError: boolean;
  isLoading: boolean;
}

/** Preserves Flutter's full-name-then-email initial selection without a profile API. */
export function profileUserDisplayFromUser(user: User | null): ProfileUserDisplay | null {
  if (user === null) return null;
  const fullName = user.fullName !== null && user.fullName.length > 0 ? user.fullName : null;
  const initialSource = fullName ?? user.email;
  return {
    email: user.email,
    fullName,
    initial: initialSource.length > 0 ? initialSource.charAt(0).toUpperCase() : '?',
  };
}

/** Maps the existing homes query to the Flutter Profile card's three visible states. */
export function profileHomesStateFromQuery(query: HomesQuerySnapshot): ProfileHomesState {
  if (query.isLoading && (query.data?.length ?? 0) === 0) return { kind: 'loading' };
  if (query.isError) return { kind: 'error' };
  return { kind: 'data', homes: query.data ?? [] };
}
