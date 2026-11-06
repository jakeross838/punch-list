// Common Tasks: the usual work for this kind of location, from the templates, to add with a tap.
// The kind comes from the location's name (a bathroom offers each template's tasks for Every
// Bathroom: Trim out toilet, Install mirror and so on) and can be switched with a tap. Tick the ones
// that apply and Add puts each on the list in this location, with its company, its usual time and
// the waits between them. What is already on the list here shows as added, so nothing doubles up.
// The tasks are kept in Templates, one place for them. The search finds any template's task, and
// any standard title.

import {
  commonPlaces,
  commonTasks,
  companyForTrade,
  duplicatesOf,
  placeHeading,
  placeLabel,
  placeOf,
  templatePlan,
  tidyItem,
  type StandardTitle,
  type TemplateItem,
  type TemplatePlace,
} from '@punch/core';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { itemsWord } from '@/data/clipboard';
import { Checkbox, Chip, EmptyState, haptic, matchRank, SearchField, Sheet, Text, Touchable, useFeedback } from '@/ui';
import { startDraft } from './ItemForm';

/** A task on the sheet: a template's, or a standard title found by searching. */
interface Entry {
  key: string;
  title: string;
  tradeId: string | null;
  hours: number | null;
  task?: TemplateItem;
  standard?: StandardTitle;
}

const fromTask = (t: TemplateItem): Entry => ({ key: `task:${t.id}`, title: t.title, tradeId: t.tradeId, hours: t.hours, task: t });
const fromTitle = (t: StandardTitle): Entry => ({ key: `title:${t.id}`, title: t.title, tradeId: t.tradeId, hours: t.hours, standard: t });
const titleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

export function CommonTasks({ jobId, locationId, visible, onClose, onAdded }: { jobId: string; locationId: string | null; visible: boolean; onClose: () => void; onAdded?: (text: string) => void }) {
  const data = useData();
  const feedback = useFeedback();
  const titles = data.useTitles();
  const templates = data.useTemplates();
  const tasks = data.useTemplateItems();
  const items = data.useItems(jobId);
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const settings = data.useFormSettings();
  const locations = data.useLocations(jobId);
  const location = locations.find((l) => l.id === locationId);
  const trades = data.useTrades();
  const [place, setPlace] = useState<TemplatePlace | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  // Each time it opens: the place the name says, nothing ticked.
  const key = visible ? (locationId ?? '') : null;
  if (key !== opened) {
    setOpened(key);
    setPlace(location ? placeOf(location) : null);
    setPicked([]);
    setQuery('');
  }

  const places = commonPlaces(location);
  const shown: TemplatePlace = place ?? places[0] ?? 'living';
  const searching = query.trim() !== '';
  const trade = (id: string | null) => trades.find((x) => x.id === id)?.name;

  // Searching: every template's task, each title once, then the standard titles no template has.
  const found: Entry[] = (() => {
    if (!searching) return [];
    const live = new Set(templates.filter((t) => t.active).map((t) => t.id));
    const seen = new Set<string>();
    const fromTasks = tasks
      .filter((t) => t.active && live.has(t.templateId))
      .map((t) => ({ t, rank: matchRank({ value: t.id, label: t.title, hint: placeLabel(t.place) }, query) }))
      .filter((x): x is { t: TemplateItem; rank: number } => x.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.t.sortOrder - b.t.sortOrder)
      .filter((x) => {
        const k = titleKey(x.t.title);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((x) => fromTask(x.t));
    const fromTitles = titles
      .filter((t) => t.approved && !seen.has(titleKey(t.title)))
      .map((t, i) => ({ t, i, rank: matchRank({ value: t.id, label: t.title, hint: trade(t.tradeId) }, query) }))
      .filter((x): x is { t: StandardTitle; i: number; rank: number } => x.rank !== null)
      .sort((a, b) => a.rank - b.rank || b.t.uses - a.t.uses || a.i - b.i)
      .map((x) => fromTitle(x.t));
    return [...fromTasks, ...fromTitles];
  })();
  const groups = searching ? [{ name: 'Found', entries: found }] : commonTasks(shown, templates, tasks).map((g) => ({ name: g.template.name, entries: g.tasks.map(fromTask) }));
  const count = picked.length;

  const onList = (title: string) => !!locationId && duplicatesOf(title, locationId, items).length > 0;
  const companyName = (tradeId: string | null) => {
    const id = tradeId ? companyForTrade(tradeId, jobCompanies) : null;
    return id ? companies.find((c) => c.id === id)?.name : undefined;
  };
  const byKey = new Map([...groups.flatMap((g) => g.entries), ...found].map((e) => [e.key, e]));

  function toggle(k: string) {
    haptic.selection();
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function add() {
    if (!locationId || count === 0 || saving) return;
    setSaving(true);
    try {
      const chosen = picked.map((k) => byKey.get(k)).filter((e): e is Entry => !!e && !onList(e.title));
      // The templates' tasks, all in this location, keeping the waits between the ones picked.
      const taskIds = chosen.flatMap((e) => (e.task ? [e.task.id] : []));
      const plan = taskIds.length > 0 ? templatePlan(tasks, { jobId, locations, items, jobCompanies }, randomUUID, { intoLocationId: locationId, taskIds }) : null;
      const made = plan ? await data.addItems(plan.items) : [];
      // A standard title found by searching, with its company and usual time.
      for (const e of chosen.filter((x) => x.standard)) {
        const { locationId: at, ...start } = startDraft(locationId, settings);
        const companyId = e.tradeId ? companyForTrade(e.tradeId, jobCompanies) : null;
        // Without a company on the job for its trade, it waits as a draft for one.
        const { locationId: _at, ...fields } = tidyItem({ ...start, title: e.title, tradeId: e.tradeId, companyId, hours: e.hours, unfinished: true, locationId: at });
        made.push(await data.createItem({ ...fields, jobId, locationId: at, source: 'typed' }));
      }
      if (made.length === 0) {
        onClose();
        return;
      }
      haptic.success();
      const text = `Added ${made.length === 1 ? (chosen[0]?.title ?? '1 item') : itemsWord(made.length)} to ${location?.label ?? 'the location'}`;
      onClose();
      if (onAdded) onAdded(text);
      else feedback.toast({ message: text, action: { label: 'Undo', onPress: () => void data.updateItems(made.map((id) => ({ id, patch: { status: 'removed' } }))) } });
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  const row = (e: Entry, i: number) => {
    const there = onList(e.title);
    const on = there || picked.includes(e.key);
    const waits = e.task && e.task.waitsOn.length > 0 ? `After ${e.task.waitsOn.map((w) => tasks.find((t) => t.id === w)?.title ?? 'another task').join(', ')}` : null;
    const detail = there
      ? 'On the list here'
      : [companyName(e.tradeId) ?? 'No company on the job for it yet', waits].filter(Boolean).join(' · ');
    return (
      <Touchable
        key={e.key}
        feedback="highlight"
        disabled={there}
        onPress={() => toggle(e.key)}
        accessibilityRole="checkbox"
        aria-checked={on} aria-disabled={there}
        accessibilityLabel={`${e.title}, ${detail}`}
        testID={`common-task-${e.title}`}
        style={[styles.row, i > 0 ? styles.rule : null]}
      >
        <Checkbox checked={on} label={e.title} />
        <View style={{ flex: 1 }}>
          <Text color={there ? colors.secondary : colors.label} numberOfLines={1}>
            {e.title}
          </Text>
          <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </Touchable>
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={location?.label ?? 'Common Tasks'}
      left={{ label: 'Cancel', onPress: onClose, testID: 'common-cancel' }}
      right={{ label: count > 0 ? `Add ${count}` : 'Add', variant: 'prominent', onPress: () => void add(), disabled: count === 0 || saving, testID: 'common-add' }}
      testID="common-tasks"
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search Every Task" testID="common-search" />
        </View>
        {searching ? null : (
          <Text variant="label" color={colors.secondary} style={styles.label}>
            Common in
          </Text>
        )}
        <View style={[styles.kinds, searching ? styles.hidden : null]}>
          {places.map((p) => (
            <Chip
              key={p}
              label={placeHeading(p)}
              on={shown === p}
              onPress={() => {
                haptic.selection();
                setPlace(p);
              }}
              testID={`common-kind-${p}`}
            />
          ))}
        </View>
        {groups.every((g) => g.entries.length === 0) ? (
          searching ? (
            <EmptyState icon="magnifyingglass" title="No Results" message={`No task or standard title matches “${query.trim()}”. Type it on New Item instead.`} />
          ) : (
            <EmptyState icon="templates" title="No Common Tasks Here Yet" message={`Add tasks for ${placeLabel(shown)} to a template, in Templates from the gear on Jobs.`} />
          )
        ) : (
          groups
            .filter((g) => g.entries.length > 0)
            .map((g) => (
              <View key={g.name} style={styles.group}>
                {searching ? null : (
                  <Text variant="footnote" color={colors.secondary} style={styles.groupName}>
                    {g.name}
                  </Text>
                )}
                <View style={styles.list}>{g.entries.map(row)}</View>
              </View>
            ))
        )}
        <Text variant="footnote" color={colors.secondary} style={styles.note}>
          Each one goes on the list here with its company, its usual time and what it waits on. The tasks come from Templates.
        </Text>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 48 },
  search: { marginHorizontal: layout.margin, marginBottom: 14 },
  hidden: { display: 'none' },
  label: { marginHorizontal: layout.inset, marginBottom: 8, textTransform: 'none' },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: layout.margin, marginBottom: 16 },
  group: { marginBottom: 16 },
  groupName: { marginHorizontal: layout.inset, marginBottom: 7 },
  list: { marginHorizontal: layout.margin, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.cell, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
  rule: { borderTopWidth: layout.hairline, borderTopColor: colors.separator },
  note: { marginHorizontal: layout.inset, marginTop: 4 },
});
