import type { Command, CommandStatus, CommandSubmission } from '../../models/deviceModels';

export type CalibrationType = 'co' | 'no2';
export type CalibrationCommandType = 'calibrate_co' | 'calibrate_no2';
export type CalibrationPollingStatus = Extract<CommandStatus, 'pending' | 'sent' | 'done' | 'error' | 'timeout'>;

export interface CalibrationCommandPayload extends Record<string, unknown> {
  type: CalibrationCommandType;
}

export interface CalibrationCommandStart {
  calibrationType: CalibrationType;
  submission: CommandSubmission;
}

export interface CalibrationPollingResult {
  command: Command | null;
  status: CalibrationPollingStatus;
}

export const calibrationPollIntervalMs = 2_000;
export const calibrationConfirmationTimeoutMs = 7 * 60 * 1_000;

/** The backend permits exactly this single key for either calibration command. */
export function calibrationPayload(type: CalibrationType): CalibrationCommandPayload {
  return { type: type === 'co' ? 'calibrate_co' : 'calibrate_no2' };
}
