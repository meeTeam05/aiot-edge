import type { Command, CommandStatus, DeviceShadow } from '../models/deviceModels';

export const commandPendingUiTimeoutMs = 5_000;

export type ExpectedReportedState =
  | { kind: 'mode'; mode: 'on' | 'off' }
  | { channel: 1 | 2 | 3; kind: 'relay'; state: boolean };

export type CommandResolution =
  | { state: 'pending' | 'sent'; commandId: string }
  | { state: 'awaiting-reported-state'; commandId: string }
  | { state: 'confirmed'; commandId: string }
  | { state: 'failed'; commandId: string; errorMessage: string | null }
  | { state: 'queued'; commandId: string };

/**
 * Mirrors Flutter's command/shadow contract. It returns presentation state only;
 * it never changes a reported shadow or a TanStack Query cache.
 */
export function reconcileCommand({
  command,
  expected,
  reportedShadow,
  submittedAt,
  now = new Date(),
}: {
  command: Pick<Command, 'id' | 'status' | 'errorMessage'> | null;
  expected: ExpectedReportedState;
  reportedShadow: DeviceShadow | null;
  submittedAt: Date;
  now?: Date;
}): CommandResolution {
  const commandId = command?.id ?? '';
  if (command === null) {
    return isPendingUiTimedOut(submittedAt, now)
      ? { state: 'queued', commandId }
      : { state: 'pending', commandId };
  }

  if (command.status === 'pending' || command.status === 'sent') {
    if (isPendingUiTimedOut(submittedAt, now)) return { state: 'queued', commandId: command.id };
    return { state: command.status, commandId: command.id };
  }
  if (command.status === 'timeout') return { state: 'queued', commandId: command.id };
  if (command.status === 'error') return { state: 'failed', commandId: command.id, errorMessage: command.errorMessage };

  return matchesReportedShadow(reportedShadow, expected)
    ? { state: 'confirmed', commandId: command.id }
    : { state: 'awaiting-reported-state', commandId: command.id };
}

export function isPendingUiTimedOut(submittedAt: Date, now = new Date()): boolean {
  return now.getTime() - submittedAt.getTime() >= commandPendingUiTimeoutMs;
}

export function matchesReportedShadow(shadow: DeviceShadow | null, expected: ExpectedReportedState): boolean {
  if (shadow === null) return false;
  if (expected.kind === 'mode') return typeof shadow.reported.mode === 'string' && shadow.reported.mode.toLowerCase() === expected.mode;
  return shadow.reported[`relay_${expected.channel}`] === expected.state;
}

export function isTerminalCommandStatus(status: CommandStatus): boolean {
  return status === 'done' || status === 'error' || status === 'timeout';
}
