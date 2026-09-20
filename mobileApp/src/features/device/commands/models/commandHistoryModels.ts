import type { Command } from '../../models/deviceModels';

export type CommandHistoryFilter = 'all' | 'done' | 'failed' | 'pending';

export const commandHistoryFilters: readonly CommandHistoryFilter[] = ['all', 'done', 'failed', 'pending'];

export type CommandStatusTone = 'accent' | 'brand' | 'danger' | 'online' | 'warn';

export interface CommandStatusPresentation {
  label: 'Done' | 'Error' | 'Pending' | 'Sent' | 'Timeout';
  tone: CommandStatusTone;
}

/** Flutter's history filter semantics, retaining the input's newest-first order. */
export function filterCommandHistory(commands: readonly Command[], filter: CommandHistoryFilter): Command[] {
  if (filter === 'all') return [...commands];
  if (filter === 'done') return commands.filter(command => command.status === 'done');
  if (filter === 'failed') return commands.filter(command => command.status === 'error' || command.status === 'timeout');
  return commands.filter(command => command.status === 'pending' || command.status === 'sent');
}

export function newestFirst(commands: readonly Command[]): Command[] {
  return [...commands].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export function commandStatusPresentation(status: Command['status']): CommandStatusPresentation {
  if (status === 'done') return { label: 'Done', tone: 'online' };
  if (status === 'sent') return { label: 'Sent', tone: 'brand' };
  if (status === 'error') return { label: 'Error', tone: 'danger' };
  if (status === 'timeout') return { label: 'Timeout', tone: 'warn' };
  return { label: 'Pending', tone: 'accent' };
}
