import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../design/ThemeProvider';
import { HomeScreen } from '../features/home/HomeScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { persistentTabNavigatorOptions } from './appTabConfig';
import type { AppTabParamList } from './types';
import type { AppStackParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppTabNavigator() {
  const { theme } = useAppTheme();
  const { colors, typography } = theme;
  return (
    <Tab.Navigator
      {...persistentTabNavigatorOptions}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: typography.pill,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen component={HomeTabScreen} name="Home" />
      <Tab.Screen component={NotificationsTabScreen} name="Notifications" />
      <Tab.Screen component={ProfileScreen} name="Profile" />
    </Tab.Navigator>
  );
}

function HomeTabScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const appNavigation = navigation.getParent<NativeStackNavigationProp<AppStackParamList>>();
  return (
    <HomeScreen
      onAddDevice={() => appNavigation?.navigate('AddDeviceDecision')}
      onCreateHome={() => appNavigation?.navigate('CreateHome')}
      onOpenDevice={deviceId => appNavigation?.navigate('DeviceDetail', { deviceId })}
      onOpenHomes={() => appNavigation?.navigate('Homes')}
      onProvisionHome={homeId => appNavigation?.navigate('Provision', { homeId })}
    />
  );
}

function NotificationsTabScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const appNavigation = navigation.getParent<NativeStackNavigationProp<AppStackParamList>>();
  return (
    <NotificationsScreen
      onOpenDevice={deviceId => appNavigation?.navigate('DeviceDetail', { deviceId })}
      onOpenDevices={() => navigation.navigate('Home')}
    />
  );
}
