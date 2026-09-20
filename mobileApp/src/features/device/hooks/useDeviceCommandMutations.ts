import { useMutation } from '@tanstack/react-query';

import { deviceCommandApi, type DeviceMode } from '../api/deviceCommandApi';
import type { CommandPayload } from '../models/deviceModels';

export function useRelayCommandMutation(deviceId: string) {
  const mutation = useMutation({
    mutationFn: ({ channel, state }: { channel: number; state: boolean }) => deviceCommandApi.sendRelay(deviceId, channel, state),
  });
  return { ...mutation, commandId: mutation.data?.commandId ?? null };
}

export function useModeCommandMutation(deviceId: string) {
  const mutation = useMutation({ mutationFn: (mode: DeviceMode) => deviceCommandApi.sendMode(deviceId, mode) });
  return { ...mutation, commandId: mutation.data?.commandId ?? null };
}

export function useGenericCommandMutation(deviceId: string) {
  const mutation = useMutation({ mutationFn: (payload: CommandPayload) => deviceCommandApi.sendGeneric(deviceId, payload) });
  return { ...mutation, commandId: mutation.data?.commandId ?? null };
}
