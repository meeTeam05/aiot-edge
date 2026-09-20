import { useCallback, useEffect, useRef, useState } from 'react';

import { useModeCommandMutation, useRelayCommandMutation } from './useDeviceCommandMutations';
import type { Command, CommandSubmission, DeviceShadow } from '../models/deviceModels';
import {
  commandPendingUiTimeoutMs,
  reconcileCommand,
  type ExpectedReportedState,
} from '../services/commandReconciliation';

export type DeviceControlState =
  | 'idle'
  | 'submitting'
  | 'pending'
  | 'sent'
  | 'waiting-for-device'
  | 'success'
  | 'failure'
  | 'queued';

interface PendingAction {
  commandId: string;
  expected: ExpectedReportedState;
  submittedAt: Date;
}

export interface DeviceControl {
  commandId: string | null;
  errorMessage: string | null;
  isPending: boolean;
  state: DeviceControlState;
}

export interface RelayDeviceControl extends DeviceControl {
  submit: (state: boolean) => Promise<void>;
}

export interface ModeDeviceControl extends DeviceControl {
  submit: (mode: 'on' | 'off') => Promise<void>;
}

interface ReconciliationOptions {
  commands: Command[];
  shadow: DeviceShadow | null;
  refetchShadow: () => Promise<unknown>;
}

/**
 * Holds local control presentation state only. The reported-shadow query remains
 * the sole source of displayed relay and mode values.
 */
function usePendingCommandReconciliation({ commands, shadow, refetchShadow }: ReconciliationOptions) {
  const [action, setAction] = useState<PendingAction | null>(null);
  const [state, setState] = useState<DeviceControlState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const commandsRef = useRef(commands);
  const actionRef = useRef<PendingAction | null>(null);
  const refreshedCommandIds = useRef(new Set<string>());

  useEffect(() => { commandsRef.current = commands; }, [commands]);
  useEffect(() => { actionRef.current = action; }, [action]);

  const begin = useCallback(() => {
    setErrorMessage(null);
    setState('submitting');
  }, []);

  const track = useCallback((submission: CommandSubmission, expected: ExpectedReportedState) => {
    refreshedCommandIds.current.delete(submission.commandId);
    setAction({ commandId: submission.commandId, expected, submittedAt: submission.submittedAt });
    setState('pending');
  }, []);

  const failSubmission = useCallback((error: unknown, fallback: string) => {
    setErrorMessage(error instanceof Error && error.message.length > 0 ? `${fallback} ${error.message}` : fallback);
    setState('failure');
  }, []);

  useEffect(() => {
    if (action === null) return undefined;
    const delay = Math.max(0, commandPendingUiTimeoutMs - (Date.now() - action.submittedAt.getTime()));
    const timer = setTimeout(() => {
      const current = actionRef.current;
      if (current?.commandId !== action.commandId) return;
      const command = commandsRef.current.find(item => item.id === action.commandId);
      // A completed command continues to wait for the reported shadow, matching Flutter.
      if (command?.status === 'done') return;
      setAction(null);
      setErrorMessage('Command queued. It will run when the device reconnects.');
      setState('queued');
    }, delay);
    return () => clearTimeout(timer);
  }, [action]);

  useEffect(() => {
    if (action === null) return;
    const command = commands.find(item => item.id === action.commandId) ?? null;
    const resolution = reconcileCommand({ command, expected: action.expected, reportedShadow: shadow, submittedAt: action.submittedAt });

    if (resolution.state === 'pending' || resolution.state === 'sent') {
      setState(resolution.state);
      return;
    }
    if (resolution.state === 'awaiting-reported-state') {
      setState('waiting-for-device');
      if (!refreshedCommandIds.current.has(action.commandId)) {
        refreshedCommandIds.current.add(action.commandId);
        const timer = setTimeout(() => { refetchShadow().catch(() => undefined); }, 1_000);
        return () => clearTimeout(timer);
      }
      return;
    }
    if (resolution.state === 'confirmed') {
      setAction(null);
      setErrorMessage(null);
      setState('success');
      return;
    }
    if (resolution.state === 'failed') {
      setAction(null);
      setErrorMessage(resolution.errorMessage ?? 'The device rejected this command.');
      setState('failure');
      return;
    }
    setAction(null);
    setErrorMessage('Command queued. It will run when the device reconnects.');
    setState('queued');
  }, [action, commands, refetchShadow, shadow]);

  return {
    begin,
    commandId: action?.commandId ?? null,
    errorMessage,
    failSubmission,
    isPending: state === 'submitting' || state === 'pending' || state === 'sent' || state === 'waiting-for-device',
    state,
    track,
  };
}

function useRelayDeviceControl(deviceId: string, channel: 1 | 2 | 3, options: ReconciliationOptions): RelayDeviceControl {
  const mutation = useRelayCommandMutation(deviceId);
  const reconciliation = usePendingCommandReconciliation(options);
  const submit = useCallback(async (state: boolean) => {
    if (reconciliation.isPending) return;
    reconciliation.begin();
    try {
      const submission = await mutation.mutateAsync({ channel, state });
      reconciliation.track(submission, { kind: 'relay', channel, state });
    } catch (error) {
      reconciliation.failSubmission(error, 'Failed to toggle relay.');
    }
  }, [channel, mutation, reconciliation]);
  return { commandId: reconciliation.commandId, errorMessage: reconciliation.errorMessage, isPending: reconciliation.isPending, state: reconciliation.state, submit };
}

function useModeDeviceControl(deviceId: string, options: ReconciliationOptions): ModeDeviceControl {
  const mutation = useModeCommandMutation(deviceId);
  const reconciliation = usePendingCommandReconciliation(options);
  const submit = useCallback(async (mode: 'on' | 'off') => {
    if (reconciliation.isPending) return;
    reconciliation.begin();
    try {
      const submission = await mutation.mutateAsync(mode);
      reconciliation.track(submission, { kind: 'mode', mode });
    } catch (error) {
      reconciliation.failSubmission(error, 'Failed to change mode.');
    }
  }, [mutation, reconciliation]);
  return { commandId: reconciliation.commandId, errorMessage: reconciliation.errorMessage, isPending: reconciliation.isPending, state: reconciliation.state, submit };
}

export function useDeviceControls({ commands, deviceId, refetchShadow, shadow }: ReconciliationOptions & { deviceId: string }) {
  // These are deliberately independent: Flutter disables only the submitted relay.
  const fan = useRelayDeviceControl(deviceId, 1, { commands, shadow, refetchShadow });
  const lamp = useRelayDeviceControl(deviceId, 2, { commands, shadow, refetchShadow });
  const filter = useRelayDeviceControl(deviceId, 3, { commands, shadow, refetchShadow });
  const mode = useModeDeviceControl(deviceId, { commands, shadow, refetchShadow });
  return { fan, filter, lamp, mode };
}
