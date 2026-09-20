import { create } from 'zustand';

import type { WifiProvisioningResult } from '../../../services/ble/provisioningProtocol';
import type { LocalDeviceConfigurationResult } from '../localDevice/models/localDeviceModels';

export type ProvisioningStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'wifi_provisioning'
  | 'device_online_check'
  | 'registering'
  | 'completed_registration'
  | 'configuring_device'
  | 'device_configured'
  | 'waiting_cloud_announce'
  | 'completed'
  | 'failed';

/**
 * Serializable workflow data only. Native BLE devices, GATT connections, and
 * adapter handles deliberately remain in the BLE service boundary.
 */
export interface ProvisioningSession {
  bleDeviceId: string;
  deviceMac?: string;
  homeId?: string;
  wifiResult?: Record<string, unknown>;
  ipAddress?: string;
  localConfigurationResult?: LocalDeviceConfigurationResult;
  registeredDeviceId?: string;
  /** One-time backend credential for future local /api/config only. Never persist or render. */
  registrationSecret?: string;
  status: ProvisioningStatus;
}

interface ProvisioningSessionState {
  /** Null until a Smart Air device has successfully connected and passed GATT validation. */
  session: ProvisioningSession | null;
  /** Tracks the scan/connection stages before a device identity is available. */
  workflowStatus: ProvisioningStatus;
  beginScan: () => void;
  beginConnection: () => void;
  setConnected: (input: { bleDeviceId: string; homeId?: string }) => void;
  setStatus: (status: ProvisioningStatus) => void;
  setWifiResult: (result: WifiProvisioningResult) => void;
  setLocalConfigurationResult: (result: LocalDeviceConfigurationResult) => void;
  setRegistrationResult: (result: { registeredDeviceId: string; registrationSecret: string }) => void;
  setDeviceConfigured: (result: LocalDeviceConfigurationResult) => void;
  setFailed: () => void;
  clear: () => void;
}

const initialState = {
  session: null,
  workflowStatus: 'idle' as ProvisioningStatus,
};

/** Flutter-equivalent in-memory provisioning workflow state; it must never persist Wi-Fi secrets. */
export const useProvisioningSessionStore = create<ProvisioningSessionState>((set, get) => ({
  ...initialState,

  beginScan() {
    // A session cannot exist until BLE supplies a stable device identity.
    // The selected home remains in the typed scan route until setConnected().
    set({ workflowStatus: 'scanning' });
  },

  beginConnection() {
    set({ workflowStatus: 'connecting' });
  },

  setConnected({ bleDeviceId, homeId }) {
    const session: ProvisioningSession = {
      bleDeviceId,
      ...(homeId === undefined ? {} : { homeId }),
      status: 'connected',
    };
    set({ session, workflowStatus: 'connected' });
  },

  setStatus(status) {
    const { session } = get();
    set({
      workflowStatus: status,
      ...(session === null ? {} : { session: { ...session, status } }),
    });
  },

  setWifiResult(result) {
    const { session } = get();
    if (session === null) return;
    set({
      session: {
        ...session,
        deviceMac: result.deviceId,
        ipAddress: result.ip,
        wifiResult: { deviceId: result.deviceId, ip: result.ip },
        // Local configuration/cloud announce remains a later phase.
        status: 'wifi_provisioning',
      },
      workflowStatus: 'wifi_provisioning',
    });
  },

  setLocalConfigurationResult(result) {
    const { session } = get();
    if (session === null) return;
    set({
      session: { ...session, localConfigurationResult: result, status: 'completed' },
      workflowStatus: 'completed',
    });
  },

  setRegistrationResult(result) {
    const { session } = get();
    if (session === null) return;
    set({
      session: { ...session, ...result, status: 'completed_registration' },
      workflowStatus: 'completed_registration',
    });
  },

  setDeviceConfigured(result) {
    const { session } = get();
    if (session === null) return;
    const withoutSecret = { ...session };
    delete withoutSecret.registrationSecret;
    set({
      session: { ...withoutSecret, localConfigurationResult: result, status: 'device_configured' },
      workflowStatus: 'device_configured',
    });
  },

  setFailed() {
    get().setStatus('failed');
  },

  clear() {
    set(initialState);
  },
}));
