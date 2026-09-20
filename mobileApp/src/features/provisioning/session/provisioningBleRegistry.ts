import type { SmartAirProvisioningConnectionService } from '../../../services/ble/provisioningConnection';
import type { WifiProvisioningProtocol } from '../../../services/ble/provisioningProtocol';
import type { SmartAirGattConnection } from '../../../services/ble/smartAirGatt';

/**
 * Runtime-only owner for the active BLE service objects. This intentionally is
 * not Zustand state: native BLE objects and handles must not be serialized.
 */
class ProvisioningBleRegistry {
  private connectionService: SmartAirProvisioningConnectionService | null = null;
  private protocol: WifiProvisioningProtocol | null = null;

  set(connectionService: SmartAirProvisioningConnectionService, protocol: WifiProvisioningProtocol): void {
    this.connectionService = connectionService;
    this.protocol = protocol;
  }

  get connection(): SmartAirGattConnection | null {
    return this.connectionService?.activeConnection ?? null;
  }

  get wifiProtocol(): WifiProvisioningProtocol | null {
    return this.protocol;
  }

  async clear(): Promise<void> {
    const activeService = this.connectionService;
    this.connectionService = null;
    this.protocol = null;
    await activeService?.disconnect();
  }
}

export const provisioningBleRegistry = new ProvisioningBleRegistry();
