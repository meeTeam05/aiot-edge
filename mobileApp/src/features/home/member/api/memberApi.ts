import { ApiError, httpClient } from '../../../../api/httpClient';
import type { InviteMemberRequest } from '../models/memberModels';

/** Existing invite-only household contract. The API has no member-list/removal endpoint. */
export const memberApi = {
  async invite(homeId: string, request: InviteMemberRequest): Promise<void> {
    const response = await httpClient.post<unknown>(`/homes/${encodeURIComponent(homeId)}/invite`, { email: request.email, role: request.role ?? 'member' });
    if (typeof response.data !== 'object' || response.data === null || !('success' in response.data) || response.data.success !== true) throw new ApiError('Unexpected server response', 0);
  },
};
