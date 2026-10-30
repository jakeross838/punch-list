// Bar buttons in the iOS 26 style: a light glass capsule for plain buttons ("Cancel", the back
// chevron, the "…" menu), a tinted capsule for the main one ("Done", "Add"). Used in the sheet
// headers on both platforms and in every bar on the preview page.

import { Platform, StyleSheet } from 'react-native';
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
  /** plain: glass, black label. tinted: glass, blue label. prominent: filled blue. */
  variant?: 'plain' | 'tinted' | 'prominent';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  size?: 'regular' | 'large';
}

export function BarButtonView({ label, icon, iconOnly, variant = 'plain', onPress, disabled, testID, size = 'regular' }: BarButtonProps) {
  const prominent = variant === 'prominent';
  const fg = prominent ? colors.white : variant === 'tinted' ? colors.tint : colors.label;
  const h = size === 'large' ? 48 : 40;
  return (
    <Touchable
      feedback="scale"
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.base,
        { height: h, borderRadius: h / 2 },
        iconOnly ? { width: h, paddingHorizontal: 0 } : null,
        prominent ? styles.prominent : styles.glass,
      ]}
    >
      {icon ? <Icon name={icon} size={iconOnly ? 19 : 20} color={fg} weight="semibold" /> : null}
      {iconOnly ? null : (
        <Text variant="headline" weight={variant === 'plain' ? '500' : '600'} color={fg} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    boxShadow: '0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.05), 0 6px 18px -6px rgba(0, 0, 0, 0.14)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px) saturate(180%)' } : null),
  },
  prominent: {
    backgroundColor: colors.tint,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08), 0 6px 16px -6px rgba(62, 102, 118, 0.55)',
  },
});
