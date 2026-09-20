import { useMutation } from '@tanstack/react-query';
import type { InviteMemberRequest } from '../models/memberModels';
import { memberService } from '../services/memberService';
export function useMemberMutations(homeId: string) {
  const inviteMutation = useMutation({ mutationFn: (request: InviteMemberRequest) => memberService.invite(homeId, request) });
  return { inviteMember: (request: InviteMemberRequest) => inviteMutation.mutateAsync(request), isInviting: inviteMutation.isPending };
}
