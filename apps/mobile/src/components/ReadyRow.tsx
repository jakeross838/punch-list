// Ready, as a checkbox. Checked: it can be done now. Unchecking opens the Not Ready box to say what
// it is waiting on and when; tap the line under it to change that later.

import { waitingOnText } from '@punch/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { Checkbox, haptic, isBeforeToday, shortDate, Text, Touchable } from '@/ui';
import { NotReadyBox } from './NotReadyBox';

export interface ReadyState {
  ready: boolean;
  waitingOn: string[];
  readyBy: string | null;
}

export function ReadyRow({
  value,
  onChange,
  choices,
  onAddChoice,
}: {
  value: ReadyState;
  onChange: (next: ReadyState) => void;
  choices: string[];
  onAddChoice: (label: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const late = !value.ready && value.readyBy !== null && isBeforeToday(value.readyBy);
  const summary = value.ready
    ? 'It can be done now.'
    : `Waiting on ${waitingOnText(value.waitingOn) || 'something'}${value.readyBy ? `, ready by ${shortDate(value.readyBy)}${late ? ', past due' : ''}` : ''}`;

  function tapBox() {
    if (value.ready) {
      setAsking(true);
      return;
    }
    haptic.tap();
    onChange({ ready: true, waitingOn: [], readyBy: null });
  }

  return (
    <View style={styles.row}>
      <Checkbox checked={value.ready} onPress={tapBox} label="Ready" testID="ready-check" />
      <Touchable
        feedback="opacity"
        onPress={() => (value.ready ? tapBox() : setAsking(true))}
        accessibilityRole="button"
        accessibilityLabel={value.ready ? 'Ready. It can be done now.' : `Not ready. ${summary}. Change`}
        testID="ready-summary"
        style={styles.text}
      >
        <Text>Ready</Text>
        <Text variant="subheadline" color={value.ready ? colors.secondary : late ? colors.destructive : colors.label} numberOfLines={3}>
          {summary}
        </Text>
      </Touchable>
      <NotReadyBox
        visible={asking}
        choices={choices}
        waitingOn={value.waitingOn}
        readyBy={value.readyBy}
        onAddChoice={onAddChoice}
        onCancel={() => setAsking(false)}
        onDone={(waitingOn, readyBy) => {
          setAsking(false);
          haptic.tap();
          onChange({ ready: false, waitingOn, readyBy });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: layout.rowPadding, paddingVertical: 10, backgroundColor: colors.cell },
  text: { flex: 1, gap: 1 },
});
