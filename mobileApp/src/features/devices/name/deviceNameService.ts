import type { Device } from '../../home/models/homeModels';
import { deviceNameApi, type DeviceNameApi } from './deviceNameApi';
import { validatedDeviceName } from './models/deviceNameModels';

export async function renameDevice(deviceId: string, value: string, api: DeviceNameApi = deviceNameApi): Promise<Device> {
  return api.update(deviceId, validatedDeviceName(value));
}
