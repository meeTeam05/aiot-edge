import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../theme/useColors';
import { AppIcons } from '../../theme/icons';
import { AppColors } from '../../theme/appColors';
import { DotLogo } from '../atoms/DotLogo';

type AtmosphereAppBarProps =
  | { variant: 'brand'; actions?: ReactNode }
  | { variant: 'back'; title: string; actions?: ReactNode; onBack?: () => void }
  | { variant: 'minimal'; title?: string };

export function AtmosphereAppBar(props: AtmosphereAppBarProps) {
  const c = useColors();
  const router = useRouter();

  if (props.variant === 'brand') {
    return (
      <View style={[styles.bar, { backgroundColor: c.bg }]}>
        <View style={styles.row}>
          <DotLogo size={24} color={AppColors.primary} />
          <Text style={[styles.brandTitle, { color: c.textPrimary }]}>Atmosphere</Text>
        </View>
        <View style={styles.row}>{props.actions}</View>
      </View>
    );
  }

  if (props.variant === 'back') {
    return (
      <View style={[styles.bar, { backgroundColor: c.bg }]}>
        <View style={styles.row}>
          <Pressable
            onPress={props.onBack ?? (() => router.back())}
            hitSlop={8}
            style={styles.backButton}
          >
            <AppIcons.back size={22} color={c.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
            {props.title}
          </Text>
        </View>
        <View style={styles.row}>{props.actions}</View>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: c.bg }]}>
      {props.title ? (
        <Text style={[styles.title, { color: c.textPrimary }]}>{props.title}</Text>
      ) : (
        <View />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    marginRight: 4,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
});
