import { ApiError, httpClient } from '../../../api/httpClient';
import type { CommandPayload, CommandSubmission } from '../models/deviceModels';

export type DeviceMode = 'on' | 'off';

function normaliseDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

function commandSubmissionFromResponse(value: unknown): CommandSubmission {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('Unexpected server response', 0);
  }
  const commandId = (value as Record<string, unknown>).command_id;
  if (typeof commandId !== 'string' || commandId.length === 0) {
    throw new ApiError('Unexpected server response', 0);
  }
  return { commandId, status: 'pending', submittedAt: new Date() };
}

/** Command submission only. A returned ID does not represent reported device state. */
export const deviceCommandApi = {
  async sendRelay(deviceId: string, channel: number, state: boolean): Promise<CommandSubmission> {
    if (!Number.isInteger(channel) || channel < 1 || channel > 3) {
      throw new RangeError('channel must be between 1 and 3');
    }
    const response = await httpClient.post<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/relay/${channel}`,
      { state },
    );
    return commandSubmissionFromResponse(response.data);
  },

  async sendMode(deviceId: string, mode: DeviceMode): Promise<CommandSubmission> {
    if (mode !== 'on' && mode !== 'off') throw new RangeError('mode must be on or off');
    const response = await httpClient.post<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/mode`,
      { mode },
    );
    return commandSubmissionFromResponse(response.data);
  },

  async sendGeneric(deviceId: string, payload: CommandPayload): Promise<CommandSubmission> {
    const response = await httpClient.post<unknown>(
      `/devices/${encodeURIComponent(normaliseDeviceId(deviceId))}/command`,
      { payload },
    );
    return commandSubmissionFromResponse(response.data);
  },
};
