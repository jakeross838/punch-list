// Schedule a company's visit, or change one: the first day, how many working days, whether the
// company confirmed it (otherwise it is our best guess), and which of its items it covers.

import { visitEnd, type ListLine, type Visit } from '@punch/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Checkbox, DateField, haptic, Icon, ListRow, ListSection, ListSwitchRow, Sheet, Text, Touchable, useFeedback, weekdayDate } from '@/ui';

/** Confirmed, or our best guess: said in words, with a small mark. */
export function VisitStatus({ confirmed }: { confirmed: boolean }) {
  return (
    <View style={styles.status}>
      <Icon name={confirmed ? 'checkmark.circle.fill' : 'hourglass'} size={14} color={confirmed ? colors.tint : colors.quiet} weight="semibold" />
      <Text variant="footnote" weight={confirmed ? '600' : '400'} color={confirmed ? colors.tint : colors.secondary}>
        {confirmed ? 'Confirmed' : 'Best guess'}
      </Text>
    </View>
  );
}

export interface VisitDraft {
  /** The visit being changed, or null for a new one. */
  visit: Visit | null;
  companyId: string;
  start: string;
  days: number;
  confirmed: boolean;
  itemIds: string[];
}

export function VisitSheet({
  jobId,
  company,
  draft,
  lines,
  onClose,
}: {
  jobId: string;
  company: string;
  /** What the sheet opens with; null keeps it closed. */
  draft: VisitDraft | null;
  /** Every item the visit can cover: its own and the company's work not on another visit. */
  lines: ListLine[];
  onClose: () => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const [value, setValue] = useState<VisitDraft | null>(draft);
  const [opened, setOpened] = useState<VisitDraft | null>(draft);

  // Start from what the sheet was opened with, each time it opens.
  if (draft !== opened) {
    setOpened(draft);
    setValue(draft);
  }

  const v = value;
  const end = v ? visitEnd(v) : null;
  const picked = new Set(v?.itemIds ?? []);
  const set = (patch: Partial<VisitDraft>) => setValue((cur) => (cur ? { ...cur, ...patch } : cur));

  async function save() {
    if (!v) return;
    if (v.itemIds.length === 0) {
      haptic.warning();
      feedback.toast({ message: 'Pick at least one item for the visit.' });
      return;
    }
    haptic.success();
    if (v.visit) {
      await data.updateVisit(v.visit.id, { start: v.start, days: v.days, confirmed: v.confirmed }, v.itemIds);
    } else {
      await data.addVisit({ jobId, companyId: v.companyId, start: v.start, days: v.days, confirmed: v.confirmed, itemIds: v.itemIds });
    }
    onClose();
  }

  function removeVisit() {
    const visit = v?.visit;
    if (!visit) return;
    feedback.actionSheet({
      message: 'Its items go back to Not Scheduled.',
      actions: [
        {
          label: 'Remove Visit',
          destructive: true,
          onPress: () => {
            haptic.heavy();
            void data.removeVisit(visit.id);
            onClose();
          },
        },
      ],
    });
  }

  return (
    <Sheet
      visible={!!draft}
      onClose={onClose}
      title={v?.visit ? 'Visit' : 'New Visit'}
      left={{ label: 'Cancel', onPress: onClose, testID: 'visit-cancel' }}
      right={{ label: 'Save', variant: 'prominent', onPress: () => void save(), testID: 'visit-save' }}
      testID="visit-sheet"
    >
      {v ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="subheadline" color={colors.secondary} style={styles.lead}>
            {company}
          </Text>
          <ListSection footer={end ? `Ends ${weekdayDate(end)}. Weekdays only.` : undefined}>
            <ListRow title="Starts" titleLines={1} right={<DateField value={v.start} onChange={(start) => start && set({ start })} label="Starts" testID="visit-start" />} />
            <ListRow
              title="Days"
              titleLines={1}
              right={
                <View style={styles.stepper}>
                  <Touchable
                    feedback="opacity"
                    onPress={() => set({ days: Math.max(1, v.days - 1) })}
                    disabled={v.days <= 1}
                    accessibilityRole="button"
                    accessibilityLabel="One day less"
                    testID="visit-days-less"
                    style={styles.step}
                  >
                    <Icon name="minus.circle.fill" size={26} color={v.days <= 1 ? colors.chevron : colors.tint} />
                  </Touchable>
                  <Text weight="600" tabular style={styles.days} testID="visit-days">
                    {v.days}
                  </Text>
                  <Touchable
                    feedback="opacity"
                    onPress={() => set({ days: Math.min(60, v.days + 1) })}
                    accessibilityRole="button"
                    accessibilityLabel="One day more"
                    testID="visit-days-more"
                    style={styles.step}
                  >
                    <Icon name="plus.circle.fill" size={26} color={colors.tint} />
                  </Touchable>
                </View>
              }
            />
          </ListSection>
          <ListSection footer={v.confirmed ? 'The company said yes to these dates.' : 'Best guess until the company says yes.'}>
            <ListSwitchRow title="Confirmed" value={v.confirmed} onValueChange={(confirmed) => set({ confirmed })} testID="visit-confirmed" />
          </ListSection>
          <ListSection header={`Items (${picked.size} of ${lines.length})`}>
            {lines.map((l, i) => (
              <Touchable
                key={l.item.id}
                feedback="highlight"
                onPress={() => {
                  haptic.selection();
                  set({ itemIds: picked.has(l.item.id) ? v.itemIds.filter((id) => id !== l.item.id) : [...v.itemIds, l.item.id] });
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: picked.has(l.item.id) }}
                accessibilityLabel={`${l.item.title}, ${l.room}`}
                testID={`visit-item-${l.item.id}`}
                style={[styles.itemRow, i > 0 ? styles.itemRule : null]}
              >
                <Checkbox checked={picked.has(l.item.id)} label={l.item.title} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{l.item.title}</Text>
                  <Text variant="footnote" color={colors.secondary} numberOfLines={1}>
                    {l.room}
                    {l.item.ready ? '' : ', not ready yet'}
                  </Text>
                </View>
              </Touchable>
            ))}
          </ListSection>
          {v.visit ? (
            <Touchable feedback="opacity" onPress={removeVisit} accessibilityRole="button" testID="visit-remove" style={styles.remove}>
              <Text color={colors.destructive}>Remove Visit</Text>
            </Touchable>
          ) : null}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  lead: { marginHorizontal: layout.inset, marginTop: 4, marginBottom: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  days: { minWidth: 28, textAlign: 'center', fontSize: 17 },
  itemRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding, backgroundColor: colors.cell },
  itemRule: { borderTopWidth: 1, borderTopColor: colors.separator },
  remove: { alignSelf: 'flex-start', height: 44, justifyContent: 'center', marginHorizontal: layout.inset },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
