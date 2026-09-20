export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<AppTabParamList> | undefined;
  Homes: undefined;
  HomeDetail: { homeId: string };
  RoomForm: { homeId: string; roomId?: string; roomName?: string };
  MemberInvite: { homeId: string };
  DeviceDetail: { deviceId: string };
  DeviceSettings: { deviceId: string };
  DeviceOta: { deviceId: string };
  DeviceCalibration: { deviceId: string; sensor: 'co' | 'no2' };
  CommandHistory: { deviceId: string };
  AddDeviceDecision: undefined;
  CreateHome: undefined;
  Provision: { homeId: string };
  ProvisionScan: { homeId: string };
  WifiProvision: undefined;
  DeviceName: { deviceId: string };
  RoomAssignment: { deviceId: string; homeId: string };
  ProvisionComplete: { deviceId: string; deviceName?: string | null; roomName?: string | null; homeId?: string };
};

export type AppTabParamList = {
  Home: undefined;
  Notifications: undefined;
  Profile: undefined;
};
import type { NavigatorScreenParams } from '@react-navigation/native';
