// Not ready: a box over the item asking who it is waiting on (tick one or several) and when it
// should be ready. Waiting On is always a who: a company, Ross Built, the owner, the design team;
// what it is waiting for goes in the description. Done keeps it; Cancel leaves the item as it was.

import { tidyTitle } from '@punch/core';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { Checkbox, DateField, haptic, Icon, Text, Touchable } from '@/ui';

export function NotReadyBox({
  visible,
  choices,
  waitingOn,
  readyBy,
  onDone,
  onCancel,
  onAddChoice,
}: {
  visible: boolean;
  /** The job's Waiting On choices: Ross Built, Owner, the design team and every company on the job. */
  choices: string[];
  waitingOn: string[];
  readyBy: string | null;
  onDone: (waitingOn: string[], readyBy: string | null) => void;
  onCancel: () => void;
  /** Keeps a new choice on the job's list. */
  onAddChoice: (label: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [picked, setPicked] = useState<string[]>(waitingOn);
  const [date, setDate] = useState<string | null>(readyBy);
  const [adding, setAdding] = useState(false);
  const [newChoice, setNewChoice] = useState('');
  const [opened, setOpened] = useState(false);

  // Start from the item's own answers each time the box opens.
  if (visible && !opened) {
    setOpened(true);
    setPicked(waitingOn);
    setDate(readyBy);
    setAdding(false);
    setNewChoice('');
  }
  if (!visible && opened) setOpened(false);

  const shown = [...choices, ...picked.filter((p) => !choices.some((c) => c.toLowerCase() === p.toLowerCase()))];
  const isPicked = (c: string) => picked.some((p) => p.toLowerCase() === c.toLowerCase());
  const toggle = (c: string) => {
    haptic.selection();
    setPicked((list) => (list.some((p) => p.toLowerCase() === c.toLowerCase()) ? list.filter((p) => p.toLowerCase() !== c.toLowerCase()) : [...list, c]));
  };
  function addChoice() {
    const label = tidyTitle(newChoice);
    if (label === '') return;
    if (!choices.some((c) => c.toLowerCase() === label.toLowerCase())) onAddChoice(label);
    if (!isPicked(label)) setPicked((list) => [...list, label]);
    setNewChoice('');
    setAdding(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.dim}>
        <View style={[styles.box, { width: Math.min(width - 40, 360), maxHeight: height - 120 }]} testID="not-ready-box">
          <Text variant="headline" align="center">
            Not Ready
          </Text>
          <Text variant="footnote" color={colors.secondary} align="center" style={styles.lead}>
            Who is it waiting on? Pick one or more.
          </Text>
          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
            {shown.map((c, i) => (
              <Touchable
                key={c}
                feedback="highlight"
                onPress={() => toggle(c)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isPicked(c) }}
                accessibilityLabel={c}
                testID={`waiting-${c}`}
                style={[styles.choice, i > 0 ? styles.rule : null]}
              >
                <Text numberOfLines={1} style={{ flex: 1 }}>
                  {c}
                </Text>
                <Checkbox checked={isPicked(c)} label={c} />
              </Touchable>
            ))}
            {adding ? (
              <View style={[styles.choice, styles.rule]}>
                <TextInput
                  value={newChoice}
                  onChangeText={setNewChoice}
                  onSubmitEditing={addChoice}
                  placeholder="Company or person"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.tint}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  accessibilityLabel="Someone else it is waiting on"
                  testID="waiting-new"
                  style={styles.input}
                />
                <Touchable feedback="opacity" onPress={addChoice} accessibilityRole="button" testID="waiting-add" style={styles.add}>
                  <Text weight="600" color={colors.tint}>
                    Add
                  </Text>
                </Touchable>
              </View>
            ) : (
              <Touchable feedback="highlight" onPress={() => setAdding(true)} accessibilityRole="button" testID="waiting-other" style={[styles.choice, styles.rule]}>
                <Icon name="plus" size={15} color={colors.tint} weight="semibold" />
                <Text color={colors.tint}>Someone Else</Text>
              </Touchable>
            )}
          </ScrollView>
          <View style={styles.date}>
            <Text style={{ flex: 1 }}>Ready By</Text>
            <DateField value={date} onChange={setDate} label="Ready By" testID="not-ready-by" />
          </View>
          <View style={styles.buttons}>
            <Touchable feedback="opacity" onPress={onCancel} accessibilityRole="button" testID="not-ready-cancel" style={styles.button}>
              <Text color={colors.tint}>Cancel</Text>
            </Touchable>
            <View style={styles.buttonRule} />
            <Touchable
              feedback="opacity"
              onPress={() => onDone(picked, date)}
              disabled={picked.length === 0}
              accessibilityRole="button"
              testID="not-ready-done"
              style={[styles.button, picked.length === 0 ? { opacity: 0.35 } : null]}
            >
              <Text weight="600" color={colors.tint}>
                Done
              </Text>
            </Touchable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.32)', alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: 20, backgroundColor: colors.cell, paddingTop: 20, overflow: 'hidden' },
  lead: { marginTop: 4, marginBottom: 12, paddingHorizontal: 20 },
  list: { maxHeight: 300, borderTopWidth: 1, borderTopColor: colors.separator },
  choice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding + 2 },
  rule: { borderTopWidth: 1, borderTopColor: colors.separator },
  input: { ...typeScale.body, flex: 1, height: 44, color: colors.label, outlineWidth: 0 },
  add: { height: 44, justifyContent: 'center' },
  date: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding + 2, borderTopWidth: 1, borderTopColor: colors.separator },
  buttons: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.separator },
  button: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  buttonRule: { width: 1, backgroundColor: colors.separator },
});
