import { normalizeBleError, SmartAirBleError } from './bleErrors';
import { discoverSmartAirService, smartAirGatt, type SmartAirGattConnection } from './smartAirGatt';
import type { BleAdapter, BluetoothState } from './bleTypes';

export type ProvisioningConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'discovering'
  | 'ready'
  | 'connection_failed'
  | 'gatt_failed'
  | 'cancelled';

type ConnectionStateListener = (state: ProvisioningConnectionState) => void;

function availabilityError(state: BluetoothState): SmartAirBleError | null {
  if (state === 'unsupported') return new SmartAirBleError('unsupported', 'This phone does not support Bluetooth Low Energy.');
  if (state === 'poweredOff') return new SmartAirBleError('bluetoothOff', 'Bluetooth is off.');
  if (state === 'unauthorized') return new SmartAirBleError('permissionDenied', 'Bluetooth permission is required.');
  return null;
}

/** Owns the one active BLE provisioning connection; no Wi-Fi or backend work belongs here. */
export class SmartAirProvisioningConnectionService {
  private activeDeviceId: string | null = null;
  private connection: SmartAirGattConnection | null = null;
  private listeners = new Set<ConnectionStateListener>();
  private state: ProvisioningConnectionState = 'idle';

  constructor(private readonly adapter: BleAdapter) {}

  get activeConnection(): SmartAirGattConnection | null {
    return this.connection;
  }

  get currentState(): ProvisioningConnectionState {
    return this.state;
  }

  subscribe(listener: ConnectionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async connect(deviceId: string): Promise<SmartAirGattConnection> {
    await this.disconnect();
    this.transition('connecting');
    try {
      const unavailable = availabilityError(await this.adapter.getState());
      if (unavailable !== null) throw unavailable;

      await this.adapter.connect(deviceId, 10_000);
      this.activeDeviceId = deviceId;
      this.transition('connected');
      await this.requestMtu();
      this.transition('discovering');
      const connection = this.discoverSmartAirService(await this.adapter.discoverServices(deviceId), deviceId);
      this.connection = connection;
      this.transition('ready');
      return connection;
    } catch (error) {
      const normalized = normalizeBleError(error, 'connectionFailed');
      const gattFailure = this.activeDeviceId !== null && (this.state === 'discovering' || normalized.code === 'gattFailure');
      await this.disconnectActiveDevice();
      this.transition(gattFailure ? 'gatt_failed' : 'connection_failed');
      throw normalized;
    }
  }

  async requestMtu(): Promise<void> {
    if (this.activeDeviceId === null) throw new SmartAirBleError('deviceUnavailable', 'No active provisioning device.');
    await this.adapter.requestMtu(this.activeDeviceId, smartAirGatt.requestedMtu);
  }

  discoverSmartAirService(services: Parameters<typeof discoverSmartAirService>[1], deviceId = this.activeDeviceId): SmartAirGattConnection {
    if (deviceId === null) throw new SmartAirBleError('deviceUnavailable', 'No active provisioning device.');
    return discoverSmartAirService(deviceId, services);
  }

  async disconnect(): Promise<void> {
    await this.disconnectActiveDevice();
    if (this.state !== 'idle') this.transition('cancelled');
  }

  private async disconnectActiveDevice(): Promise<void> {
    const deviceId = this.activeDeviceId;
    this.activeDeviceId = null;
    this.connection = null;
    if (deviceId === null) return;
    try {
      await this.adapter.disconnect(deviceId);
    } catch {
      // Flutter deliberately ignores disconnect errors because the peripheral may already be gone.
    }
  }

  private transition(state: ProvisioningConnectionState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
