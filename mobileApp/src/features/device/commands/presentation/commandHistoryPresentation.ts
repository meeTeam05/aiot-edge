import type { CommandPayload } from '../../models/deviceModels';

/** Mirrors Flutter's command-history relative date display. */
export function formatCommandTimestamp(createdAt: Date, now = new Date()): string {
  const differenceMs = now.getTime() - createdAt.getTime();
  const seconds = Math.trunc(differenceMs / 1_000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.trunc(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.trunc(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${createdAt.getDate()}/${createdAt.getMonth() + 1} ${createdAt.getHours()}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
}

/** Produces Flutter-equivalent selectable payload lines for the future detail sheet. */
export function formatCommandPayload(payload: CommandPayload): string {
  return Object.entries(payload).map(([key, value]) => `${key}: ${formatPayloadValue(value)}`).join('\n');
}

function formatPayloadValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
