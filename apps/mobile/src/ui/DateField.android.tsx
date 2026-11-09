// Android: the date in words; a tap opens the system's own calendar to pick another.

import { DatePickerDialog, Host } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { longDate, todayIso } from './dates';
import type { DateFieldProps } from './DateField';
import { Icon } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type { DateFieldProps } from './DateField';

const pad = (n: number) => String(n).padStart(2, '0');

export function DateField({ value, onChange, label, testID }: DateFieldProps) {
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.row}>
      <Touchable
        feedback="opacity"
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${longDate(value)}` : `Add ${label}`}
        testID={testID}
        style={[styles.pill, value ? null : styles.pillEmpty]}
      >
        <Text variant="callout" color={value ? colors.label : colors.tint} weight={value ? '400' : '500'}>
          {value ? longDate(value) : 'Add Date'}
        </Text>
      </Touchable>
      {value ? (
        <Touchable feedback="opacity" hitSlop={10} onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
          <Icon name="xmark" size={16} color={colors.quiet} />
        </Touchable>
      ) : null}
      {picking ? (
        <Host matchContents>
          <DatePickerDialog
            // The calendar keeps its days at midnight in UTC, so the date goes in and comes out that way.
            initialDate={value ?? todayIso()}
            confirmButtonLabel="Done"
            dismissButtonLabel="Cancel"
            onDateSelected={(date) => {
              setPicking(false);
              onChange(`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`);
            }}
            onDismissRequest={() => setPicking(false)}
          />
        </Host>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { height: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.cell },
  pillEmpty: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
});
