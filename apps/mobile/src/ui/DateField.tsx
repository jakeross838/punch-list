// iPhone: the system's compact date picker. Tap the date and the calendar pops up.

import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, labelsHidden } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { dateFromIso, isoFromDate, todayIso } from './dates';
import { Icon } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface DateFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Read out with the controls: "Ready By". */
  label: string;
  testID?: string;
}

export function DateField({ value, onChange, label, testID }: DateFieldProps) {
  if (!value) {
    return (
      <Touchable feedback="opacity" onPress={() => onChange(todayIso())} accessibilityRole="button" accessibilityLabel={`Add ${label}`} testID={testID}>
        <Text color={colors.tint}>Add Date</Text>
      </Touchable>
    );
  }
  return (
    <View style={styles.row}>
      <Host matchContents>
        <DatePicker
          title={label}
          selection={dateFromIso(value)}
          displayedComponents={['date']}
          onDateChange={(date) => onChange(isoFromDate(date))}
          modifiers={[datePickerStyle('compact'), labelsHidden()]}
        />
      </Host>
      <Touchable feedback="opacity" hitSlop={10} onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
        <Icon name="xmark.circle.fill" size={20} color={colors.chevron} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
