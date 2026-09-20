import { calibrationApi } from '../api/calibrationApi';
import {
  calibrationConfirmationTimeoutMs,
  calibrationPollIntervalMs,
  type CalibrationPollingResult,
  type CalibrationPollingStatus,
} from '../models/calibrationModels';
import type { Command } from '../../models/deviceModels';

export interface CalibrationPollingOptions {
  deviceId: string;
  commandId: string;
  getCommandHistory?: (deviceId: string) => Promise<Command[]>;
  maxDurationMs?: number;
  now?: () => number;
  onStateChange?: (result: CalibrationPollingResult) => void;
  signal?: AbortSignal;
  wait?: (durationMs: number) => Promise<void>;
}

export class CalibrationPollingCancelledError extends Error {
  constructor() {
    super('Calibration polling cancelled');
    this.name = 'CalibrationPollingCancelledError';
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs));
}

function terminalResult(command: Command): CalibrationPollingResult | null {
  if (command.status === 'done' || command.status === 'error' || command.status === 'timeout') {
    return { command, status: command.status };
  }
  return null;
}

function pendingResult(command: Command | undefined): CalibrationPollingResult {
  return { command: command ?? null, status: command?.status === 'sent' ? 'sent' : 'pending' };
}

function ensureNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CalibrationPollingCancelledError();
}

/** Mirrors Flutter waitForCommandCompletion for the calibration-specific seven-minute window. */
export async function pollCalibrationCommand({
  commandId,
  deviceId,
  getCommandHistory = calibrationApi.getCommandHistory,
  maxDurationMs = calibrationConfirmationTimeoutMs,
  now = Date.now,
  onStateChange,
  signal,
  wait = delay,
}: CalibrationPollingOptions): Promise<CalibrationPollingResult> {
  const deadline = now() + maxDurationMs;
  let latest: Command | undefined;

  while (now() < deadline) {
    ensureNotCancelled(signal);
    const commands = await getCommandHistory(deviceId);
    ensureNotCancelled(signal);
    latest = commands.find(command => command.id === commandId);
    if (latest !== undefined) {
      const terminal = terminalResult(latest);
      if (terminal !== null) return terminal;
    }
    onStateChange?.(pendingResult(latest));
    await wait(calibrationPollIntervalMs);
  }

  return { command: latest ?? null, status: 'timeout' };
}

export function isSuccessfulCalibration(result: CalibrationPollingResult): boolean {
  return result.status === 'done';
}

export function calibrationPollingStatus(command: Command | null): CalibrationPollingStatus {
  return command?.status ?? 'pending';
}
