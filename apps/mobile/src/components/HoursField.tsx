// How long the work takes, on the item: the usual times one tap away (15 minutes up to a full day),
// any other from the list, and a tap on the chosen one clears it. The company can fill it in from
// its page too; the note under it says who did.

import { hoursText, PICK_HOURS, QUICK_HOURS } from '@punch/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Chip, haptic, ListSection, OptionPicker, type Option } from '@/ui';

const NONE = 'none';

export function HoursField({ value, onChange, note }: { value: number | null; onChange: (hours: number | null) => void; note?: string }) {
  const [picking, setPicking] = useState(false);
  const other = value !== null && !QUICK_HOURS.includes(value);
  const options: Option[] = [{ value: NONE, label: 'Not Known Yet' }, ...PICK_HOURS.map((h) => ({ value: String(h), label: hoursText(h) }))];
  const pick = (hours: number | null) => {
    haptic.selection();
    onChange(hours);
  };
  return (
    <>
      <ListSection header="How Long It Takes" footer={note ?? 'About how long the work takes once they are on site. The company can fill it in from its list.'}>
        <View style={styles.chips} testID="hours">
          {QUICK_HOURS.map((h) => (
            <Chip key={h} label={hoursText(h)} on={value === h} onPress={() => pick(value === h ? null : h)} testID={`hours-${h}`} />
          ))}
          {other ? <Chip label={hoursText(value)} on onPress={() => pick(null)} testID="hours-other-value" /> : null}
          <Chip label="Other" icon="timer" onPress={() => setPicking(true)} accessibilityLabel="Another length of time" testID="hours-other" />
        </View>
      </ListSection>
      <OptionPicker
        visible={picking}
        title="How Long It Takes"
        options={options}
        value={value === null ? NONE : String(value)}
        onSelect={(v) => onChange(v === NONE ? null : Number(v))}
        onClose={() => setPicking(false)}
        typeFirst={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, backgroundColor: colors.cell },
});
