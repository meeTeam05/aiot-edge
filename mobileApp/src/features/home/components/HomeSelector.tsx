import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AtmosphereTheme } from '../../../design/theme';
import type { Home } from '../models/homeModels';

interface HomeSelectorProps {
  homes: Home[];
  onDismiss: () => void;
  onSelect: (homeId: string) => void;
  theme: AtmosphereTheme;
  visible: boolean;
}

/** Equivalent of Flutter's multi-home Add Device bottom-sheet selector. */
export function HomeSelector({ homes, onDismiss, onSelect, theme, visible }: HomeSelectorProps) {
  const { colors, spacing, typography } = theme;
  return (
    <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={visible}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: colors.surface, borderTopLeftRadius: theme.radius.card, borderTopRightRadius: theme.radius.card }]}>
          <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.md, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl }]}>Choose a home</Text>
          <ScrollView>
            {homes.map(home => (
              <Pressable key={home.id} onPress={() => onSelect(home.id)} style={({ pressed }) => [styles.homeRow, { opacity: pressed ? 0.75 : 1, paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg }]}>
                <View style={styles.homeCopy}>
                  <Text style={[typography.body, { color: colors.textPrimary }]}>{home.name}</Text>
                  {home.address ? <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>{home.address}</Text> : null}
                </View>
                <Text accessibilityLabel="Choose home" style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.35)', flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', paddingBottom: 24 },
  homeRow: { alignItems: 'center', flexDirection: 'row' },
  homeCopy: { flex: 1 },
  chevron: { fontSize: 30, lineHeight: 30 },
});
