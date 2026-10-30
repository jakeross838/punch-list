// Bar buttons. Plain ones are the accent color with no background ("Cancel", the back chevron,
// the "…" menu); the main one is a filled accent pill ("Done", "Add", "New Item").

import { StyleSheet } from 'react-native';
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
  /** Shown beside the icon in place of the label, like "Jobs" after the back chevron. */
  text?: string;
  /** plain: accent text or icon. prominent: a filled accent pill. */
  variant?: 'plain' | 'tinted' | 'prominent';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  size?: 'regular' | 'large';
}

export function BarButtonView({ label, icon, iconOnly, text, variant = 'plain', onPress, disabled, testID, size = 'regular' }: BarButtonProps) {
  const pill = variant === 'prominent';
  const fg = pill ? colors.white : colors.tint;
  const shown = iconOnly ? null : (text ?? label);
  if (pill) {
    const h = size === 'large' ? 46 : 34;
    return (
      <Touchable
        feedback="scale"
        onPress={onPress}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        style={[styles.pill, { height: h, borderRadius: h / 2, paddingHorizontal: size === 'large' ? 26 : 16 }]}
      >
        {icon ? <Icon name={icon} size={size === 'large' ? 18 : 15} color={fg} weight="bold" /> : null}
        {shown ? (
          <Text variant={size === 'large' ? 'headline' : 'subheadline'} weight="600" color={fg} numberOfLines={1}>
            {shown}
          </Text>
        ) : null}
      </Touchable>
    );
  }
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={[styles.plain, iconOnly ? styles.iconOnly : null]}
    >
      {icon ? <Icon name={icon} size={iconOnly ? 23 : 21} color={fg} weight={icon === 'chevron.left' ? 'semibold' : 'regular'} /> : null}
      {shown ? (
        <Text color={fg} numberOfLines={1}>
          {shown}
        </Text>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.tint },
  plain: { height: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  iconOnly: { justifyContent: 'center', paddingHorizontal: 0 },
});
