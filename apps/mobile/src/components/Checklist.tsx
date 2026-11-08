// The steps inside an item, to tick off one at a time: the parts of a door to adjust, the fixtures
// in a bath. Tap a step to check it off; the x takes it off the list. Type a step and press Return
// to add it. Each change saves as it is made.

import type { ChecklistEntry } from '@punch/core';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fieldFont, layout } from '@/constants/theme';
import { Checkbox, haptic, Icon, SectionLabel, Text, Touchable } from '@/ui';

/** At most this many steps on one item. */
export const CHECKLIST_MAX = 50;

export function checklistText(list: ChecklistEntry[]): string {
  const done = list.filter((e) => e.done).length;
  return `${done} of ${list.length}`;
}

export function Checklist({ value, onChange, editable = true }: { value: ChecklistEntry[]; onChange: (next: ChecklistEntry[]) => void; editable?: boolean }) {
  const [typing, setTyping] = useState('');
  // What is typed, read when Return and leaving the field both fire, so a step is added once.
  const typed = useRef('');
  const type = (text: string) => {
    typed.current = text;
    setTyping(text);
  };
  const add = () => {
    const text = typed.current.trim().replace(/\s+/g, ' ').slice(0, 120);
    typed.current = '';
    if (!text || value.length >= CHECKLIST_MAX) return;
    haptic.tap();
    onChange([...value, { id: randomUUID(), text, done: false }]);
    setTyping('');
  };
  const toggle = (id: string) => {
    haptic.selection();
    onChange(value.map((e) => (e.id === id ? { ...e, done: !e.done } : e)));
  };
  const drop = (id: string) => {
    haptic.tap();
    onChange(value.filter((e) => e.id !== id));
  };
  return (
    <View testID="checklist">
      <SectionLabel label="Checklist" right={value.length > 0 ? checklistText(value) : undefined} rightColor={value.length > 0 && value.every((e) => e.done) ? colors.ok : colors.secondary} />
      <View style={styles.panel}>
        {value.map((e, i) => (
          <View key={e.id} style={[styles.row, i < value.length - 1 || (editable && value.length < CHECKLIST_MAX) ? styles.ruled : null]}>
            <Touchable
              feedback="highlight"
              onPress={() => toggle(e.id)}
              disabled={!editable}
              accessibilityRole="checkbox"
              aria-checked={e.done}
              accessibilityLabel={e.text}
              testID={`step-${i}`}
              style={styles.step}
            >
              <Checkbox checked={e.done} label={e.text} />
              <Text color={e.done ? colors.secondary : colors.label} style={[styles.text, e.done ? styles.crossed : null]}>
                {e.text}
              </Text>
            </Touchable>
            {editable ? (
              <Touchable feedback="opacity" onPress={() => drop(e.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Take off ${e.text}`} testID={`step-remove-${i}`} style={styles.remove}>
                <Icon name="xmark" size={14} color={colors.quiet} />
              </Touchable>
            ) : null}
          </View>
        ))}
        {editable && value.length < CHECKLIST_MAX ? (
          <View style={[styles.row, styles.addRow]}>
            <Icon name="plus" size={16} color={colors.tint} weight="medium" />
            <TextInput
              value={typing}
              onChangeText={type}
              onSubmitEditing={add}
              onBlur={add}
              placeholder={value.length === 0 ? 'Add the first step' : 'Add a step'}
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.tint}
              returnKeyType="done"
              submitBehavior="submit"
              autoCapitalize="sentences"
              accessibilityLabel="Add a step"
              testID="step-add"
              style={styles.input}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: layout.margin, marginTop: 8, backgroundColor: colors.cell, borderWidth: layout.hairline, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, backgroundColor: colors.cell },
  ruled: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding, paddingVertical: 11 },
  text: { flex: 1 },
  crossed: { textDecorationLine: 'line-through', textDecorationColor: colors.secondary },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { gap: 12, paddingLeft: layout.rowPadding + 3 },
  input: { ...fieldFont('body'), flex: 1, minHeight: 48, paddingVertical: 0, color: colors.label, outlineWidth: 0 },
});
