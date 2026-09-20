import {
  AlertTriangle,
  ArrowLeft,
  Bluetooth,
  Check,
  ChevronRight,
  Info,
  Radio,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/** Flutter's AppIcons equivalent. Features reference names, never icon-library exports. */
export type AppIconName = 'back' | 'bluetooth' | 'check' | 'chevronRight' | 'close' | 'device' | 'info' | 'settings' | 'warning';

const iconComponents: Record<AppIconName, LucideIcon> = {
  back: ArrowLeft, bluetooth: Bluetooth, check: Check, chevronRight: ChevronRight, close: X, device: Radio, info: Info, settings: Settings, warning: AlertTriangle,
};

const iconLabels: Record<AppIconName, string> = {
  back: 'Back', bluetooth: 'Bluetooth', check: 'Selected', chevronRight: 'Open', close: 'Close', device: 'Device', info: 'Information', settings: 'Settings', warning: 'Warning',
};

export function AppIcon({ color, name, size = 20, style }: { color: string; name: AppIconName; size?: number; style?: StyleProp<ViewStyle> }) {
  const Icon = iconComponents[name];
  return <Icon accessibilityLabel={iconLabels[name]} accessibilityRole="image" color={color} size={size} style={style} strokeWidth={2} />;
}

/** Retained registry lookup for callers/tests while exposing the vector component instead of text. */
export function iconForName(name: AppIconName): LucideIcon { return iconComponents[name]; }

export const appIconRegistry = iconComponents;
