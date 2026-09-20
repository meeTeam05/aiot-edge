import { deviceCommandApi } from '../../api/deviceCommandApi';
import { deviceDashboardApi } from '../../api/deviceDashboardApi';
import type { Command, CommandSubmission } from '../../models/deviceModels';
import { calibrationPayload, type CalibrationType } from '../models/calibrationModels';

/** Reuses the authenticated generic-command and command-history APIs; no calibration endpoint exists. */
export const calibrationApi = {
  async start(deviceId: string, type: CalibrationType): Promise<CommandSubmission> {
    return deviceCommandApi.sendGeneric(deviceId, calibrationPayload(type));
  },

  startCo(deviceId: string): Promise<CommandSubmission> {
    return this.start(deviceId, 'co');
  },

  startNo2(deviceId: string): Promise<CommandSubmission> {
    return this.start(deviceId, 'no2');
  },

  /** Flutter waitForCommandCompletion requests up to 100 command records per poll. */
  getCommandHistory(deviceId: string): Promise<Command[]> {
    return deviceDashboardApi.listCommands(deviceId, { limit: 100, offset: 0 });
  },
};
