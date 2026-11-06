// Square buttons, Site Office style. On the slate bar they are outlined in sand; on sand and white
// they are outlined in slate. The main one is filled: slate deep with sand words on light
// backgrounds, sand with slate words on the bar. Words are JetBrains Mono in capitals.

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface BarButtonProps {
  label: string;
  icon?: IconName;
  /** Show only the icon; the label is still read out by VoiceOver. */
  iconOnly?: boolean;
  /** Shown in place of the label. */
  text?: string;
  /** plain: outlined. tinted: outlined with gulf blue words. prominent: filled. */
  variant?: 'plain' | 'tinted' | 'prominent';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /** regular: 36 high, for bars and sheet heads. large: 48 high, for the buttons along the bottom. */
  size?: 'regular' | 'large';
  /** dark: on the slate bar. light: on sand or white. */
  tone?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  /** A small count in the corner, like how many filters are on. */
  badge?: number;
}

export function BarButtonView({
  label,
  icon,
  iconOnly,
  text,
  variant = 'plain',
  onPress,
  disabled,
  testID,
  size = 'regular',
  tone = 'light',
  style,
  badge,
}: BarButtonProps) {
  const filled = variant === 'prominent';
  const dark = tone === 'dark';
  const fg = filled ? (dark ? colors.bar : colors.onBar) : dark ? colors.onBar : variant === 'tinted' ? colors.tint : colors.label;
  const bg = filled ? (dark ? colors.onBar : colors.action) : 'transparent';
  const edge = filled ? bg : dark ? colors.onBarEdge : colors.borderStrong;
  const h = size === 'large' ? 48 : 36;
  const shown = iconOnly ? null : (text ?? label);
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      disabled={disabled}
      hitSlop={size === 'large' ? 0 : 4}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} on` : label}
      testID={testID}
      style={[
        styles.button,
        { height: h, minWidth: h, backgroundColor: bg, borderColor: edge },
        shown ? { paddingHorizontal: size === 'large' ? 16 : 12 } : { width: h },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'large' ? 17 : 18} color={fg} weight={shown ? 'medium' : 'regular'} /> : null}
      {shown ? (
        <Text variant="button" color={fg} numberOfLines={1}>
          {shown}
        </Text>
      ) : null}
      {badge ? (
        <Text variant="stamp" weight="600" color={dark ? colors.bar : colors.onBar} style={[styles.badge, { backgroundColor: dark ? colors.onBar : colors.action }]}>
          {badge}
        </Text>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1 },
  badge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    lineHeight: 17,
    textAlign: 'center',
    letterSpacing: 0.2,
    overflow: 'hidden',
  },
});
