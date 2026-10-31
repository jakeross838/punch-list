// Common Tasks: the usual work for this kind of room, to add with a tap. The kind comes from the
// location's name (a bathroom offers Trim out toilet, Install faucet, Install shower trim and so
// on) and can be switched with a tap. Tick the ones that apply and Add puts each on the list in
// this location, with its company and usual time from the standard titles. What is already on the
// list here shows as added, so nothing doubles up. The lists are set in Item Form.

import {
  companyForTrade,
  duplicatesOf,
  hoursText,
  roomKind,
  roomTasks,
  ROOM_KIND_LABELS,
  ROOM_KINDS,
  tidyItem,
  type RoomKind,
} from '@punch/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Checkbox, Chip, EmptyState, haptic, Sheet, Text, Touchable, useFeedback } from '@/ui';
import { startDraft } from './ItemForm';

export function CommonTasks({ jobId, locationId, visible, onClose, onAdded }: { jobId: string; locationId: string | null; visible: boolean; onClose: () => void; onAdded?: (text: string) => void }) {
  const data = useData();
  const feedback = useFeedback();
  const titles = data.useTitles();
  const items = data.useItems(jobId);
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const settings = data.useFormSettings();
  const location = data.useLocations(jobId).find((l) => l.id === locationId);
  const [kind, setKind] = useState<RoomKind | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each time it opens: the kind the name says, nothing ticked.
  const key = visible ? (locationId ?? '') : null;
  if (key !== opened) {
    setOpened(key);
    setKind(location ? roomKind(location.label) : null);
    setPicked([]);
  }

  const shown = kind ?? 'living';
  const tasks = roomTasks(shown, titles);
  const onList = (title: string) => !!locationId && duplicatesOf(title, locationId, items).length > 0;
  const companyName = (tradeId: string | null) => {
    const id = tradeId ? companyForTrade(tradeId, jobCompanies) : null;
    return id ? companies.find((c) => c.id === id)?.name : undefined;
  };

  function toggle(id: string) {
    haptic.selection();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function add() {
    if (!locationId || picked.length === 0 || saving) return;
    setSaving(true);
    try {
      const chosen = tasks.filter((t) => picked.includes(t.id) && !onList(t.title));
      for (const t of chosen) {
        const { locationId: at, ...start } = startDraft(locationId, settings);
        const companyId = t.tradeId ? companyForTrade(t.tradeId, jobCompanies) : null;
        // Without a company on the job for its trade, it waits as a draft for one.
        const { locationId: _at, ...fields } = tidyItem({ ...start, title: t.title, tradeId: t.tradeId, companyId, hours: t.hours, unfinished: true, locationId: at });
        await data.createItem({ ...fields, jobId, locationId: at, source: 'typed' });
      }
      haptic.success();
      const text = `Added ${chosen.length === 1 ? chosen[0]!.title : `${chosen.length} items`} to ${location?.label ?? 'the location'}`;
      onClose();
      if (onAdded) onAdded(text);
      else feedback.toast({ message: text });
    } finally {
      setSaving(false);
    }
  }

  const count = picked.length;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={location?.label ?? 'Common Tasks'}
      left={{ label: 'Cancel', onPress: onClose, testID: 'common-cancel' }}
      right={{ label: count > 0 ? `Add ${count}` : 'Add', variant: 'prominent', onPress: () => void add(), disabled: count === 0 || saving, testID: 'common-add' }}
      testID="common-tasks"
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="footnote" weight="600" color={colors.secondary} style={styles.label}>
          Common in
        </Text>
        <View style={styles.kinds}>
          {ROOM_KINDS.map((k) => (
            <Chip
              key={k}
              label={ROOM_KIND_LABELS[k]}
              on={shown === k}
              onPress={() => {
                haptic.selection();
                setKind(k);
                setPicked([]);
              }}
              testID={`common-kind-${k}`}
            />
          ))}
        </View>
        {tasks.length === 0 ? (
          <EmptyState icon="list.bullet" title="No Common Tasks Yet" message={`Pick the common tasks for ${ROOM_KIND_LABELS[shown].toLowerCase()} in Item Form.`} />
        ) : (
          <View style={styles.list}>
            {tasks.map((t, i) => {
              const there = onList(t.title);
              const on = there || picked.includes(t.id);
              const detail = there ? 'On the list here' : [companyName(t.tradeId) ?? 'No company on the job for it yet', t.hours !== null ? hoursText(t.hours) : null].filter(Boolean).join(' · ');
              return (
                <Touchable
                  key={t.id}
                  feedback="highlight"
                  disabled={there}
                  onPress={() => toggle(t.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: there }}
                  accessibilityLabel={`${t.title}, ${detail}`}
                  testID={`common-task-${t.title}`}
                  style={[styles.row, i > 0 ? styles.rule : null]}
                >
                  <Checkbox checked={on} label={t.title} />
                  <View style={{ flex: 1 }}>
                    <Text color={there ? colors.secondary : colors.label} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
                      {detail}
                    </Text>
                  </View>
                </Touchable>
              );
            })}
          </View>
        )}
        <Text variant="footnote" color={colors.secondary} style={styles.note}>
          Each one goes on the list here with its company and usual time. Change the lists in Item Form.
        </Text>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 48 },
  label: { marginHorizontal: layout.inset, marginBottom: 8, textTransform: 'none' },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: layout.margin, marginBottom: 16 },
  list: { marginHorizontal: layout.margin, borderRadius: layout.radius, backgroundColor: colors.cell, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
  rule: { borderTopWidth: layout.hairline, borderTopColor: colors.separator },
  note: { marginHorizontal: layout.inset, marginTop: 10 },
});
