// A square chip you tap: a filter to switch on or off, a quick choice like 30 minutes, or a filter
// that is on, shown above a list with an x to take it off. On is filled slate deep. JetBrains Mono
// in capitals.

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
  /** A filter that is on: filled, with an x to take it off. */
  removable?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const filled = on || removable;
  const fg = filled ? colors.onBar : colors.label;
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      accessibilityRole={removable ? 'button' : 'checkbox'}
      aria-checked={removable ? undefined : on}
      accessibilityLabel={accessibilityLabel ?? (removable ? `Remove the filter ${label}` : label)}
      testID={testID}
      style={[styles.chip, filled ? styles.on : null]}
    >
      {icon ? <Icon name={icon} size={13} color={fg} weight="medium" /> : null}
      <Text variant="label" weight={filled ? '600' : '500'} color={fg} numberOfLines={1}>
        {label}
      </Text>
      {removable ? (
        <View style={styles.x}>
          <Icon name="xmark" size={10} color={colors.onBar} weight="bold" />
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
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
  },
  on: { backgroundColor: colors.action, borderColor: colors.action },
  x: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center', marginRight: -2 },
});
