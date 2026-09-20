import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';
import { AppIcon } from './icons';

export function AppBar({ onBack, testID, title, trailing }: { onBack?: () => void; testID?: string; title: string; trailing?: React.ReactNode }) {
  const { theme } = useAppTheme();
  return <View style={[styles.bar, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border, paddingHorizontal: theme.spacing.xl }]}>{onBack ? <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.button} testID={testID}><AppIcon color={theme.colors.textPrimary} name="back" size={36} /></Pressable> : <View style={styles.button} />}<Text numberOfLines={1} style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text><View style={styles.button}>{trailing}</View></View>;
}

const styles = StyleSheet.create({ bar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 56 }, button: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, title: { flex: 1, fontFamily: 'PlusJakartaSans', fontSize: 17, fontWeight: '600', marginHorizontal: 4 } });
