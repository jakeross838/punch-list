// Ready, as a checkbox. Checked: it can be done now. Unchecking opens Not Ready to say what has to
// be done first (usually one task) and when; tap the line under it to change that later.

import { dayOfDate, daysBetween, holdText, pastDueText, readyByOf } from '@punch/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useHolds } from '@/data/view';
import { Checkbox, haptic, isBeforeToday, shortDate, Text, Touchable } from '@/ui';
import { NotReadyBox } from './NotReadyBox';

export interface ReadyState {
  ready: boolean;
  waitingOn: string[];
  waitingOnItems: string[];
  readyBy: string | null;
}

export function ReadyRow({
  jobId,
  itemId,
  locationId,
  value,
  onChange,
  extras,
  onAddChoice,
}: {
  jobId: string;
  /** The item itself; none for a new item. */
  itemId?: string;
  locationId: string;
  value: ReadyState;
  onChange: (next: ReadyState) => void;
  /** Who things can wait on that is not a task: Ross Built, Owner, the design team. */
  extras: string[];
  onAddChoice: (label: string) => void;
}) {
  const holds = useHolds(jobId);
  const [asking, setAsking] = useState(false);
  const own = value.readyBy;
  const late = !value.ready && own !== null && isBeforeToday(own);
  const lateText = late && own ? `, ${pastDueText(daysBetween(own, dayOfDate(new Date())))}` : '';
  const by = value.ready ? null : readyByOf({ ...value }, holds);
  const on = holdText({ ...value, locationId }, holds);
  const summary = value.ready ? 'It can be done now.' : `Waiting on ${on || 'something'}${by ? `, ready by ${shortDate(by)}${lateText}` : ''}`;

  function tapBox() {
    if (value.ready) {
      setAsking(true);
      return;
    }
    haptic.tap();
    onChange({ ready: true, waitingOn: [], waitingOnItems: [], readyBy: null });
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
        jobId={jobId}
        itemId={itemId}
        locationId={locationId}
        value={value}
        holds={holds}
        extras={extras}
        onAddChoice={onAddChoice}
        onCancel={() => setAsking(false)}
        onDone={(next) => {
          setAsking(false);
          haptic.tap();
          onChange({ ready: false, ...next });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: layout.rowPadding, paddingVertical: 10, backgroundColor: colors.cell },
  text: { flex: 1, gap: 1 },
});
