// Buttons the way the iPhone draws them. In a bar or a sheet's head they are blue words or a blue
// icon with no box, and the main one (Done, Save) is in bold. Along the bottom of a screen they are
// large and rounded: the main one filled blue with white words, the others light gray with blue
// words.

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout } from '@/constants/theme';
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
  /** plain: blue words. tinted: the same. prominent: bold in a bar, filled along the bottom. */
  variant?: 'plain' | 'tinted' | 'prominent';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /** regular: words or an icon, for bars and sheet heads. large: a rounded button along the bottom. */
  size?: 'regular' | 'large';
  /** dark: on something dark (the camera). light: everywhere else. */
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
  const prominent = variant === 'prominent';
  const large = size === 'large';
  const dark = tone === 'dark';
  const fg = large ? (prominent ? colors.white : colors.tint) : dark ? colors.onDark : colors.tint;
  const bg = large ? (prominent ? colors.action : colors.chip) : 'transparent';
  const shown = iconOnly ? null : (text ?? label);
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      disabled={disabled}
      hitSlop={large ? 0 : 8}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} on` : label}
      testID={testID}
      style={[
        styles.button,
        large ? styles.large : styles.regular,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1 },
        !shown && !large ? styles.iconOnly : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={large ? 18 : 22} color={fg} weight={shown ? 'medium' : 'regular'} /> : null}
      {shown ? (
        <Text variant="button" weight={prominent ? '600' : '400'} color={fg} numberOfLines={1}>
          {shown}
        </Text>
      ) : null}
      {badge ? (
        <Text variant="stamp" color={colors.white} style={styles.badge}>
          {badge}
        </Text>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  regular: { height: 36, minWidth: 36, paddingHorizontal: 4 },
  iconOnly: { width: 36, paddingHorizontal: 0 },
  large: { height: 50, minWidth: 50, paddingHorizontal: 16, borderRadius: layout.buttonRadius },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    lineHeight: 17,
    borderRadius: 8.5,
    textAlign: 'center',
    overflow: 'hidden',
    backgroundColor: colors.destructive,
  },
});
