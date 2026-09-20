import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DeviceDetailScreen } from '../features/device/DeviceDetailScreen';
import { DeviceSettingsScreen } from '../features/device/settings/DeviceSettingsScreen';
import { OtaScreen } from '../features/device/ota/OtaScreen';
import { CalibrationWizardScreen } from '../features/device/calibration/CalibrationWizardScreen';
import { CommandHistoryScreen } from '../features/device/commands/CommandHistoryScreen';
import { AddDeviceDecisionScreen } from '../features/provision/AddDeviceDecisionScreen';
import { CreateHomeScreen } from '../features/home/CreateHomeScreen';
import { ProvisionScreen } from '../features/provision/ProvisionScreen';
import { BleScanScreen } from '../features/provision/BleScanScreen';
import { WifiProvisionScreen } from '../features/provision/WifiProvisionScreen';
import { cancelProvisioningSession } from '../features/provisioning/session';
import { LocalDeviceConfigService, LocalDeviceService } from '../features/provisioning/localDevice';
import { ProvisioningRegistrationService } from '../features/provisioning/registration';
import { CloudAnnounceService } from '../features/provisioning/announce';
import { DeviceNameScreen } from '../features/devices/name/DeviceNameScreen';
import { RoomAssignmentScreen } from '../features/devices/room/RoomAssignmentScreen';
import { ProvisionCompleteScreen } from '../features/devices/completion/ProvisionCompleteScreen';
import { HomeListScreen } from '../features/home/HomeListScreen';
import { HomeDetailScreen } from '../features/home/HomeDetailScreen';
import { RoomFormScreen } from '../features/home/room/RoomFormScreen';
import { MemberInviteScreen } from '../features/home/member/MemberInviteScreen';
import { useMemo } from 'react';
import { AppTabNavigator } from './AppTabNavigator';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen component={AppTabNavigator} name="Tabs" />
      <Stack.Screen component={HomesRoute} name="Homes" />
      <Stack.Screen component={HomeDetailScreen} name="HomeDetail" />
      <Stack.Screen component={RoomFormScreen} name="RoomForm" />
      <Stack.Screen component={MemberInviteScreen} name="MemberInvite" />
      <Stack.Screen component={DeviceDetailScreen} name="DeviceDetail" />
      <Stack.Screen component={DeviceSettingsScreen} name="DeviceSettings" />
      <Stack.Screen component={OtaScreen} name="DeviceOta" />
      <Stack.Screen component={CalibrationWizardScreen} name="DeviceCalibration" />
      <Stack.Screen component={CommandHistoryScreen} name="CommandHistory" />
      <Stack.Screen component={AddDeviceDecisionScreen} name="AddDeviceDecision" />
      <Stack.Screen component={CreateHomeScreen} name="CreateHome" />
      <Stack.Screen component={ProvisionScreen} name="Provision" />
      <Stack.Screen component={BleScanScreen} name="ProvisionScan" />
      <Stack.Screen component={WifiProvisionRoute} name="WifiProvision" />
      <Stack.Screen component={DeviceNameScreen} name="DeviceName" />
      <Stack.Screen component={RoomAssignmentScreen} name="RoomAssignment" />
      <Stack.Screen component={ProvisionCompleteScreen} name="ProvisionComplete" />
    </Stack.Navigator>
  );
}

function HomesRoute({ navigation }: import('@react-navigation/native-stack').NativeStackScreenProps<AppStackParamList, 'Homes'>) {
  return <HomeListScreen onCreateHome={() => navigation.navigate('CreateHome')} onOpenHome={homeId => navigation.navigate('HomeDetail', { homeId })} onOpenProfile={() => navigation.navigate('Tabs', { screen: 'Profile' })} />;
}

function WifiProvisionRoute({ navigation }: import('@react-navigation/native-stack').NativeStackScreenProps<AppStackParamList, 'WifiProvision'>) {
  const localDeviceService = useMemo(() => new LocalDeviceService(), []);
  const configService = useMemo(() => new LocalDeviceConfigService(), []);
  const registrationService = useMemo(() => new ProvisioningRegistrationService(), []);
  const announceService = useMemo(() => new CloudAnnounceService(), []);
  const cancel = () => {
    cancelProvisioningSession()
      .catch(() => undefined)
      .finally(() => undefined);
    navigation.goBack();
  };
  return <WifiProvisionScreen announceService={announceService} configService={configService} localDeviceService={localDeviceService} registrationService={registrationService} onBack={() => navigation.goBack()} onCancel={cancel} onContinue={result => navigation.replace('DeviceName', { deviceId: result.deviceId })} />;
}
