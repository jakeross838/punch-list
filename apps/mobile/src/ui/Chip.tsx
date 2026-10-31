// A small rounded label you tap: a filter to switch on or off, a quick choice like 30 minutes, or
// a filter that is on, shown above a list with an x to take it off. On is the accent color.

import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

export function Chip({
  label,
  on = false,
  onPress,
  icon,
  removable,
  testID,
  accessibilityLabel,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  icon?: IconName;
  /** A filter that is on: tinted, with an x to take it off. */
  removable?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const fg = on ? colors.white : removable ? colors.tint : colors.label;
  return (
    <Touchable
      feedback="scale"
      onPress={onPress}
      accessibilityRole={removable ? 'button' : 'checkbox'}
      aria-checked={removable ? undefined : on}
      accessibilityLabel={accessibilityLabel ?? (removable ? `Remove the filter ${label}` : label)}
      testID={testID}
      style={[styles.chip, on ? styles.on : removable ? styles.removable : null]}
    >
      {icon ? <Icon name={icon} size={13} color={fg} weight="semibold" /> : null}
      <Text variant="subheadline" weight={on || removable ? '600' : '500'} color={fg} numberOfLines={1}>
        {label}
      </Text>
      {removable ? (
        <View style={styles.x}>
          <Icon name="xmark" size={9} color={colors.tint} weight="bold" />
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: colors.chip,
  },
  on: { backgroundColor: colors.tint },
  removable: { backgroundColor: colors.chipOn, paddingRight: 8 },
  x: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
});
