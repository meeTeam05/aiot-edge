import { provisioningBleRegistry } from './provisioningBleRegistry';
import { useProvisioningSessionStore } from './provisioningSessionStore';

/** Explicit cancellation is the only path that tears down the active BLE runtime session. */
export async function cancelProvisioningSession(): Promise<void> {
  await provisioningBleRegistry.clear();
  useProvisioningSessionStore.getState().clear();
}

/** Cloud acknowledgement keeps serializable context available for naming and room assignment. */
export async function markProvisioningAnnounced(): Promise<void> {
  useProvisioningSessionStore.getState().setStatus('completed');
}

/**
 * Final user-acknowledged provisioning boundary. Earlier workflow stages retain
 * context so retryable errors never discard setup state.
 */
export async function completeProvisioningSession(): Promise<void> {
  useProvisioningSessionStore.getState().setStatus('completed');
  await provisioningBleRegistry.clear();
  useProvisioningSessionStore.getState().clear();
}
