import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useAppTheme } from '../design/ThemeProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { RealtimeProvider } from '../services/realtime/RealtimeProvider';

const queryClient = new QueryClient();

/** Root owns safe areas and the Flutter-equivalent bootstrap/auth/app gate. */
export function RootApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><RootAppContent /></ThemeProvider>
    </QueryClientProvider>
  );
}

function RootAppContent() {
  const { theme } = useAppTheme();
  return <RealtimeProvider><SafeAreaProvider><StatusBar barStyle={theme.statusBarStyle} /><View style={[styles.root, { backgroundColor: theme.colors.background }]}><NavigationContainer><RootNavigator /></NavigationContainer></View></SafeAreaProvider></RealtimeProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
