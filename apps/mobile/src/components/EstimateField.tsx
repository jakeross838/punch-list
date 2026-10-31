// Estimated time on the item form: the usual times one tap away (15 minutes up to a full day), any
// other from the list, and a tap on the chosen one clears it. The standard title or Claude may have
// filled it in; the note under it says so.

import { hoursText, PICK_HOURS, QUICK_HOURS } from '@punch/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Chip, haptic, ListSection, OptionPicker, type Option } from '@/ui';

const NONE = 'none';

export function EstimateField({ value, onChange, note }: { value: number | null; onChange: (hours: number | null) => void; note?: string }) {
  const [picking, setPicking] = useState(false);
  const other = value !== null && !QUICK_HOURS.includes(value);
  const options: Option[] = [{ value: NONE, label: 'No Estimate' }, ...PICK_HOURS.map((h) => ({ value: String(h), label: hoursText(h) }))];
  const pick = (hours: number | null) => {
    haptic.selection();
    onChange(hours);
  };
  return (
    <>
      <ListSection header="Estimated Time" footer={note ?? 'About how long the work takes once the company is on site. It adds up for each location, company and visit.'}>
        <View style={styles.chips} testID="estimate">
          {QUICK_HOURS.map((h) => (
            <Chip key={h} label={hoursText(h)} on={value === h} onPress={() => pick(value === h ? null : h)} testID={`estimate-${h}`} />
          ))}
          {other ? <Chip label={hoursText(value)} on onPress={() => pick(null)} testID="estimate-other-value" /> : null}
          <Chip label="Other" icon="timer" onPress={() => setPicking(true)} accessibilityLabel="Another time" testID="estimate-other" />
        </View>
      </ListSection>
      <OptionPicker
        visible={picking}
        title="Estimated Time"
        options={options}
        value={value === null ? NONE : String(value)}
        onSelect={(v) => onChange(v === NONE ? null : Number(v))}
        onClose={() => setPicking(false)}
        search={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, backgroundColor: colors.cell },
});
