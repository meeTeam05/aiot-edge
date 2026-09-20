import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { httpClient } from '../src/api/httpClient';
import { calibrationApi } from '../src/features/device/calibration/api/calibrationApi';
import { calibrationPayload } from '../src/features/device/calibration/models/calibrationModels';
import { CalibrationPollingCancelledError, pollCalibrationCommand } from '../src/features/device/calibration/services/calibrationPolling';

const originalAdapter = httpClient.defaults.adapter;
let requestBodies: unknown[];

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} };
}

function command(status: 'pending' | 'sent' | 'done' | 'error' | 'timeout') {
  return { id: 'calibration-1', payload: { type: 'calibrate_co' }, status, createdAt: new Date('2026-09-20T02:00:00.000Z'), executedAt: null, errorMessage: null };
}

beforeEach(() => {
  requestBodies = [];
  httpClient.defaults.adapter = async config => {
    if (config.method === 'post' && config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/command') {
      requestBodies.push(typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
      return response(config, { command_id: 'calibration-1' }, 201);
    }
    if (config.method === 'get' && config.url === '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/commands') {
      return response(config, [{ id: 'calibration-1', payload: { type: 'calibrate_co' }, status: 'pending', created_at: '2026-09-20T02:00:00.000Z', executed_at: null }]);
    }
    throw new AxiosError('Unexpected request', undefined, config);
  };
});

afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe('Calibration data foundation', () => {
  it('maps the only two backend-approved calibration payloads', () => {
    expect(calibrationPayload('co')).toEqual({ type: 'calibrate_co' });
    expect(calibrationPayload('no2')).toEqual({ type: 'calibrate_no2' });
  });

  it('reuses the generic authenticated command API for CO and NO₂ calibration', async () => {
    await expect(calibrationApi.startCo('AA:BB:CC:DD:EE:FF')).resolves.toMatchObject({ commandId: 'calibration-1', status: 'pending' });
    await expect(calibrationApi.startNo2('AA:BB:CC:DD:EE:FF')).resolves.toMatchObject({ commandId: 'calibration-1', status: 'pending' });
    expect(requestBodies).toEqual([
      { payload: { type: 'calibrate_co' } },
      { payload: { type: 'calibrate_no2' } },
    ]);
  });

  it('polls every two seconds until only done confirms calibration', async () => {
    let polls = 0;
    const waits: number[] = [];
    const result = await pollCalibrationCommand({
      commandId: 'calibration-1',
      deviceId: 'device-1',
      getCommandHistory: async () => (++polls === 1 ? [command('sent')] : [command('done')]),
      wait: async duration => { waits.push(duration); },
    });
    expect(result).toEqual({ command: command('done'), status: 'done' });
    expect(waits).toEqual([2_000]);
  });

  it('returns command error as a failed polling result', async () => {
    await expect(pollCalibrationCommand({
      commandId: 'calibration-1', deviceId: 'device-1', getCommandHistory: async () => [command('error')],
    })).resolves.toEqual({ command: command('error'), status: 'error' });
  });

  it('returns timeout after the Flutter seven-minute confirmation window', async () => {
    let now = 0;
    const waits: number[] = [];
    const result = await pollCalibrationCommand({
      commandId: 'calibration-1',
      deviceId: 'device-1',
      getCommandHistory: async () => [command('pending')],
      now: () => now,
      wait: async duration => { waits.push(duration); now = 7 * 60 * 1_000; },
    });
    expect(result).toEqual({ command: command('pending'), status: 'timeout' });
    expect(waits).toEqual([2_000]);
  });

  it('cancels polling cleanly when the calibration route is left', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(pollCalibrationCommand({
      commandId: 'calibration-1', deviceId: 'device-1', signal: controller.signal,
    })).rejects.toBeInstanceOf(CalibrationPollingCancelledError);
  });
});
