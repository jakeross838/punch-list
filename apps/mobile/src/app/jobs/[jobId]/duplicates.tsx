// Find Duplicates: the same work written twice on the job. Items in one location that name the same
// thing are paired at once, with no signal; Claude then says which pairs really are the same work.
// Merge keeps one (the one already on the lists, then the one assigned, then the older) and moves
// the other's photos and comments onto it; the other is removed. Not the Same puts a pair away on
// this phone, so it is not asked about again.

import { assigneeName, closePairs, itemNumberLabel, keeperOf, pairKey, readDuplicates, type Item } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { colors, layout } from '@/constants/theme';
import { addApart, readApart } from '@/data/apart';
import { useData } from '@/data/api';
import { Banner, Button, EmptyState, haptic, ListRow, ListSection, Page, Text, useFeedback } from '@/ui';

/** The most pairs Claude is asked about at once. */
const MOST_PAIRS = 60;

/** Claude's answer for each pair, as it was worded when asked: whether it is the same work. */
const answers = new Map<string, boolean>();
/** Pairs asked about, the answer not back yet. */
const asking = new Set<string>();

/** A pair as Claude was asked about it: the items and their titles then. */
const askedKey = (p: { a: Item; b: Item }) => `${pairKey(p.a.id, p.b.id)}:${p.a.title}|${p.b.title}`;

export default function DuplicatesScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const ready = useClaudeReady();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const people = data.usePeople();
  const [apart, setApart] = useState(() => readApart(jobId));
  const [merging, setMerging] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [failed, setFailed] = useState(false);

  const pairs = useMemo(() => closePairs(items, apart).slice(0, MOST_PAIRS), [items, apart]);
  // Claude's answers so far, kept for the next visit too; only new pairs are asked about.
  const [known, setKnown] = useState<Record<string, boolean>>(() => Object.fromEntries(answers));
  const label = (id: string) => locations.find((l) => l.id === id)?.label ?? '';
  const unknown = useMemo(() => pairs.filter((p) => known[askedKey(p)] === undefined), [pairs, known]);

  useEffect(() => {
    const batch = unknown.filter((p) => !asking.has(askedKey(p)));
    if (!ready || batch.length === 0) return;
    for (const p of batch) asking.add(askedKey(p));
    const at = (id: string) => locations.find((l) => l.id === id)?.label ?? '';
    const asked = batch.map((p, i) => ({
      n: i + 1,
      a: { n: p.a.number ?? 0, title: p.a.title, description: p.a.description, location: at(p.a.locationId) },
      b: { n: p.b.number ?? 0, title: p.b.title, description: p.b.description, location: at(p.b.locationId) },
    }));
    askClaude('duplicates', { pairs: asked })
      .then((raw) => {
        const same = new Set(readDuplicates(raw, asked.map((p) => p.n)));
        const found: Record<string, boolean> = {};
        batch.forEach((p, i) => {
          answers.set(askedKey(p), same.has(i + 1));
          found[askedKey(p)] = same.has(i + 1);
        });
        setKnown((k) => ({ ...k, ...found }));
      })
      .catch(() => setFailed(true))
      .finally(() => {
        for (const p of batch) asking.delete(askedKey(p));
      });
  }, [unknown, ready, locations]);

  const checking = ready && unknown.length > 0 && !failed;
  const asked = ready && !failed;
  const sure = asked ? pairs.filter((p) => known[askedKey(p)] === true) : [];
  const unsure = asked ? pairs.filter((p) => known[askedKey(p)] === false) : [];
  // With no Claude to ask, every pair that looks alike is shown.
  const shown = asked ? sure : pairs;

  const names = useMemo(() => ({ companies: new Map(companies.map((c) => [c.id, c.name])), people: new Map(people.map((p) => [p.id, p.name])) }), [companies, people]);
  const detailOf = (i: Item) => [i.unfinished ? 'Draft' : null, assigneeName(i, names) ?? 'Not assigned', i.description || null].filter(Boolean).join(' · ');

  function notSame(a: Item, b: Item) {
    haptic.selection();
    addApart(jobId, pairKey(a.id, b.id));
    setApart(readApart(jobId));
  }

  async function merge(keep: Item, gone: Item) {
    if (merging) return;
    setMerging(true);
    try {
      const moved = await data.mergeItems(keep.id, gone.id);
      haptic.success();
      const along = [moved.photos > 0 ? `${moved.photos} ${moved.photos === 1 ? 'photo' : 'photos'}` : null, moved.comments > 0 ? `${moved.comments} ${moved.comments === 1 ? 'comment' : 'comments'}` : null].filter(Boolean);
      feedback.toast({ message: `Merged item ${itemNumberLabel(gone)} into item ${itemNumberLabel(keep)}.${along.length > 0 ? ` ${along.join(' and ')} came along.` : ''}` });
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not merge. Try again.' });
    } finally {
      setMerging(false);
    }
  }

  function askMerge(a: Item, b: Item) {
    const [keep, gone] = keeperOf(a, b);
    feedback.actionSheet({
      title: 'Merge These Two',
      message: `Item ${itemNumberLabel(keep)}, ${keep.title}, stays. Item ${itemNumberLabel(gone)}'s photos and comments go on it, and item ${itemNumberLabel(gone)} comes off the list.`,
      actions: [
        { label: `Keep Item ${itemNumberLabel(keep)}`, onPress: () => void merge(keep, gone) },
        { label: `Keep Item ${itemNumberLabel(gone)} Instead`, onPress: () => void merge(gone, keep) },
      ],
    });
  }

  const openItem = (i: Item) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: i.id } });

  const pairCard = (p: { a: Item; b: Item }, key: string) => {
    // By the items' numbers, smaller first, for finding a pair.
    const tag = [p.a, p.b].map((i) => i.number ?? 0).sort((x, y) => x - y).join('-');
    return (
      <ListSection key={key} variant="plain" header={label(p.a.locationId) || 'No Location'}>
        {[p.a, p.b].map((i) => (
          <ListRow key={i.id} title={`${itemNumberLabel(i)}  ${i.title}`} subtitle={detailOf(i)} accessory="chevron" onPress={() => openItem(i)} testID={`dup-item-${i.number ?? i.id}`} />
        ))}
        <View style={styles.actions}>
          <Button label="Merge" icon="move" variant="tinted" onPress={() => askMerge(p.a, p.b)} disabled={merging} testID={`dup-merge-${tag}`} />
          <Button label="Not the Same" variant="plain" onPress={() => notSame(p.a, p.b)} testID={`dup-apart-${tag}`} />
        </View>
      </ListSection>
    );
  };

  return (
    <Page title="Find Duplicates" backLabel={job?.name} tab={{ active: 'jobs', jobId }}>
      <View style={styles.intro}>
        <Text variant="subheadline" color={colors.secondary} testID="dup-summary">
          {pairs.length === 0
            ? 'Nothing on this job looks like the same work written twice.'
            : checking && sure.length === 0
              ? `Claude is checking ${unknown.length === 1 ? 'one pair that looks alike' : `${unknown.length} pairs that look alike`}.`
              : asked
                ? sure.length === 0
                  ? 'Claude says none of the items that look alike are the same work.'
                  : `Claude says ${sure.length === 1 ? 'one pair is' : `${sure.length} pairs are`} the same work written twice. Merge keeps one and moves the other's photos and comments onto it.`
                : `${pairs.length === 1 ? 'One pair looks' : `${pairs.length} pairs look`} like the same work written twice. Merge keeps one and moves the other's photos and comments onto it.`}
        </Text>
        {failed ? <Banner icon="info.circle">Claude could not check them, so every pair that looks alike is shown.</Banner> : null}
      </View>
      {checking ? (
        <View style={styles.checking}>
          <ActivityIndicator color={colors.secondary} />
        </View>
      ) : null}
      {pairs.length === 0 ? <EmptyState icon="copy" title="No Duplicates" message="Items in the same location that name the same thing show here." /> : null}
      {shown.map((p) => pairCard(p, pairKey(p.a.id, p.b.id)))}
      {asked && unsure.length > 0 ? (
        showClose ? (
          <>
            <View style={styles.intro}>
              <Text variant="subheadline" color={colors.secondary}>
                These look alike, but Claude says they are different work.
              </Text>
            </View>
            {unsure.map((p) => pairCard(p, pairKey(p.a.id, p.b.id)))}
          </>
        ) : (
          <ListSection variant="plain">
            <ListRow
              title={unsure.length === 1 ? 'Show the Other Pair That Looks Alike' : `Show ${unsure.length} Other Pairs That Look Alike`}
              tone="tint"
              onPress={() => setShowClose(true)}
              testID="dup-show-close"
            />
          </ListSection>
        )
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  intro: { marginHorizontal: layout.inset, marginTop: 4, marginBottom: 14, gap: 12 },
  checking: { paddingVertical: 32, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.cell },
});
