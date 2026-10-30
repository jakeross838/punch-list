// Preview page: the date shows in a gray capsule like the iPhone's compact picker. An invisible
// date input lies over it, so a tap opens the phone's own date wheel.

import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { longDate } from './dates';
import type { DateFieldProps } from './DateField';
import { Icon } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type { DateFieldProps } from './DateField';

export function DateField({ value, onChange, label, testID }: DateFieldProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.pill, value ? null : styles.pillEmpty]}>
        <Text variant="callout" color={value ? colors.label : colors.tint} weight={value ? '400' : '500'}>
          {value ? longDate(value) : 'Add Date'}
        </Text>
        <input
          type="date"
          className="pl-date"
          aria-label={label}
          data-testid={testID}
          value={value ?? ''}
          onChange={(e) => onChange(e.currentTarget.value === '' ? null : e.currentTarget.value)}
        />
      </View>
      {value ? (
        <Touchable feedback="opacity" hitSlop={10} onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
          <Icon name="xmark.circle.fill" size={20} color={colors.gray3} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    position: 'relative',
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: colors.fill3,
    overflow: 'hidden',
  },
  pillEmpty: { backgroundColor: colors.tintSoft },
});
