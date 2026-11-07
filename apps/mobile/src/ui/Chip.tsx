// A rounded chip you tap, as in the filters of the App Store and Maps: a filter to switch on or
// off, a quick choice like 30 minutes, or a filter that is on, shown above a list with an x to take
// it off. Light gray when off, blue with white words when on.

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
  const fg = filled ? colors.white : colors.label;
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
      {icon ? <Icon name={icon} size={14} color={fg} weight="medium" /> : null}
      <Text variant="subheadline" weight={filled ? '600' : '500'} color={fg} numberOfLines={1}>
        {label}
      </Text>
      {removable ? (
        <View style={styles.x}>
          <Icon name="xmark" size={10} color={colors.white} weight="bold" />
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: colors.chip,
  },
  on: { backgroundColor: colors.action },
  x: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center', marginRight: -3 },
});
