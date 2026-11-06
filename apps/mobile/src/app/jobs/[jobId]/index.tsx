// A job, Site Office style: its counts (Open, Ready and Waiting, the last two a tap into their
// list), the big tiles for the walk and for sending the lists, the search with Filter beside it, and
// chips for how the list is grouped: by location, by company or by what items wait on. Drafts and
// copied items show as a note above the list. The levels follow, each location with how much is
// open, how much is ready and a bar for how much is done. Tap a location for its items. Capture in
// the bottom bar walks the job. Add From a Template puts a template's tasks in every location they
// fit; copied items paste here into a location picked from the job.

import {
  byFloor,
  commentCounts,
  pastePlan,
  GROUP_LABELS,
  groupItems,
  isFiltered,
  NO_FILTERS,
  type GroupBy,
  type Item,
  type ItemGroup,
  type Location,
  type Photo,
} from '@punch/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useCanSuggest } from '@/ai/suggest';
import { draftFill } from '@/components/draftFill';
import { FilterBar } from '@/components/FilterBar';
import { ItemRow } from '@/components/ItemRow';
import { useFormOptions } from '@/components/ItemForm';
import { AddTemplateSheet } from '@/components/TemplateSheets';
import { useItemActions } from '@/components/useItemActions';
import { ViewSheet } from '@/components/ViewSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { setCurrentJob } from '@/data/currentJob';
import { clipboard, itemsTitle, itemsWord, useClipboard } from '@/data/clipboard';
import { useFilterContext, useHolds, useJobView } from '@/data/view';
import {
  Button,
  ChipRow,
  EmptyState,
  Figures,
  haptic,
  Icon,
  MetaLine,
  OptionPicker,
  Page,
  ProgressBar,
  SectionLabel,
  Stamp,
  Text,
  Tiles,
  Touchable,
  useFeedback,
  type BarMenu,
  type IconName,
} from '@/ui';


interface Row {
  group: ItemGroup;
}

interface Section {
  key: string;
  title: string | null;
  /** The level's open items and their time, said at the right of its heading. */
  totals: string;
  data: Row[];
}

const openWords = (n: number) => `${n} open`;

function matchesQuery(item: Item, q: string, name: (id: string | null) => string): boolean {
  const hay = [item.title, item.description, item.waitingOn.join(' '), item.poOrCo ?? '', String(item.number ?? ''), name(item.companyId), name(item.locationId)]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export default function JobScreen() {
  const { jobId, template: templateParam } = useLocalSearchParams<{ jobId: string; template?: string }>();
  const data = useData();
  const feedback = useFeedback();
  const jobs = data.useJobs();
  const job = jobs.find((j) => j.id === jobId);
  const copied = useClipboard();
  const formOptions = useFormOptions(jobId, '');
  // Opened from a template's Add to a Job: its sheet comes up straight away.
  const [templateSheet, setTemplateSheet] = useState(!!templateParam);
  const [pasting, setPasting] = useState(false);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const titles = data.useTitles();
  const canFill = useCanSuggest();
  const saved = data.useViewSettings();
  const context = useFilterContext(jobId);
  const [view, setView] = useJobView(jobId, saved);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const actions = useItemActions(jobId);
  const commentsOn = commentCounts(data.useComments(jobId));
  const holds = useHolds(jobId);
  // The bottom bar's Capture and Send work on the job you were in last.
  useEffect(() => {
    if (job) setCurrentJob(job.id);
  }, [job]);
  // How much of each location (or company) is done, for its bar.
  const doneShare = useMemo(() => {
    const counts = new Map<string, { done: number; all: number }>();
    const keyOf = (i: Item) => (view.groupBy === 'company' ? (i.companyId ?? '') : i.locationId);
    for (const i of items) {
      if (i.status === 'removed' || i.unfinished) continue;
      const c = counts.get(keyOf(i)) ?? { done: 0, all: 0 };
      c.all += 1;
      if (i.status === 'complete') c.done += 1;
      counts.set(keyOf(i), c);
    }
    return counts;
  }, [items, view.groupBy]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) map.set(c.id, c.name);
    for (const l of locations) map.set(l.id, l.label);
    return (id: string | null) => (id ? (map.get(id) ?? '') : '');
  }, [companies, locations]);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const filters = view.filters;
  const narrowed = isFiltered(filters);
  // Each list keeps a trade's items together, in the trades' order.
  const lookups = useMemo(() => ({ locations, companies, trades }), [locations, companies, trades]);
  const groups = useMemo(() => groupItems(items, view.groupBy, lookups, { filters, context }), [items, view.groupBy, lookups, filters, context]);
  const draftItems = items.filter((i) => i.unfinished && i.status === 'open');
  const drafts = draftItems.length;
  const rows: Row[] = groups.map((group) => ({ group })).filter((r) => r.group.open > 0 || (view.groupBy === 'room' && !narrowed));

  // An item waiting on two things shows under both, but counts once.
  const openItems = (list: Row[]) => {
    const seen = new Map<string, Item>();
    for (const r of list) for (const i of r.group.items) if (i.status === 'open') seen.set(i.id, i);
    return [...seen.values()];
  };
  const allOpen = openItems(rows);
  const total = allOpen.length;

  const sections = useMemo<Section[]>(() => {
    const totalsOf = (list: Row[]) => {
      const open = list.flatMap((r) => r.group.items.filter((i) => i.status === 'open'));
      if (open.length === 0) return '';
      return openWords(open.length);
    };
    if (view.groupBy !== 'room') return [{ key: 'all', title: null, totals: '', data: rows }];
    return byFloor(rows, (r) => locationById.get(r.group.key)).map((f) => ({ key: f.floor, title: f.floor, totals: totalsOf(f.rows), data: f.rows }));
  }, [rows, view.groupBy, locationById]);

  const q = query.trim();
  const found = useMemo(() => {
    if (!q) return [];
    const hits = items.filter((i) => i.status !== 'removed' && matchesQuery(i, q, names));
    return groupItems(hits, 'room', lookups, { filters, context, showCompleted: true })
      .filter((g) => g.items.length > 0)
      .map((g) => ({ key: g.key, title: g.label, data: g.items }));
  }, [q, items, names, lookups, filters, context]);


  const openGroup = (key: string) =>
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: view.groupBy, key } });
  const openSetup = () => router.push({ pathname: '/jobs/[jobId]/setup', params: { jobId } });
  const openSend = () => router.push({ pathname: '/jobs/[jobId]/send', params: { jobId } });
  const openActivity = () => router.push({ pathname: '/jobs/[jobId]/activity', params: { jobId } });
  const openDrafts = () => {
    // Any draft the walk could not fill in (no signal, say) gets filled in now.
    if (canFill) {
      const tasks = draftItems.flatMap((item) => {
        const photo = firstPhoto.get(item.id);
        return photo ? [{ item, photo }] : [];
      });
      draftFill.add(tasks, { data, titles, trades, companies, jobCompanies, locations });
    }
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'drafts', key: 'all' } });
  };
  const draftsRow =
    drafts > 0 ? (
      <Touchable
        feedback="highlight"
        onPress={openDrafts}
        accessibilityRole="button"
        accessibilityLabel={`${drafts} ${drafts === 1 ? 'draft' : 'drafts'} to finish`}
        testID="open-unfinished"
        style={styles.note}
      >
        <Stamp color={colors.tint} size={8} />
        <Text variant="label" weight="600" style={{ flex: 1 }}>
          {drafts} {drafts === 1 ? 'draft' : 'drafts'} to finish
        </Text>
        <Text variant="label" color={colors.tint}>
          Finish
        </Text>
        <Icon name="chevron.right" size={11} color={colors.tint} weight="semibold" />
      </Touchable>
    ) : null;
  const openCamera = (roomId: string | null = null) => {
    capture.start({ jobId, roomId });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  };
  // The walk: how many locations are walked, and the next one not walked yet, in floor order.
  const inOrder = [...locations].filter((l) => l.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const walked = inOrder.filter((l) => l.walkedAt).length;
  const nextToWalk = inOrder.find((l) => !l.walkedAt);
  const newWalk = () => {
    const ids = inOrder.filter((l) => l.walkedAt).map((l) => l.id);
    void data.setWalked(ids, false);
    feedback.toast({ message: 'A new walk: no location walked yet', action: { label: 'Undo', onPress: () => void data.setWalked(ids, true) } });
  };
  /** Starting with the words: the form, with no camera, in the last location used. */
  const newItem = () => {
    capture.start({ jobId, roomId: null });
    capture.discardItem();
    router.push({ pathname: '/jobs/[jobId]/items/new', params: { jobId, typed: '1' } });
  };
  /** The photo for an item typed in earlier: the camera, straight onto it. */
  const addPhoto = (item: Item) => {
    capture.start({ jobId, roomId: item.locationId, itemId: item.id });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  };

  const menu: BarMenu = {
    kind: 'menu',
    label: 'More',
    icon: 'ellipsis',
    testID: 'more',
    groups: [
      {
        actions: [
          { label: 'Activity', icon: 'clock', onPress: openActivity, testID: 'activity' },
          { label: 'Make a List', icon: 'doc', onPress: () => router.push({ pathname: '/jobs/[jobId]/send', params: { jobId, start: 'list' } }), testID: 'make-list' },
          ...(walked > 0 ? [{ label: 'Start a New Walk', icon: 'rooms' as IconName, onPress: newWalk, testID: 'new-walk' }] : []),
          { label: 'Add From a Template', icon: 'templates', onPress: () => setTemplateSheet(true), testID: 'add-template' },
          { label: 'Job Setup', icon: 'slider', onPress: openSetup, testID: 'job-setup' },
          { label: 'Item Form', icon: 'list.bullet', onPress: () => router.push('/settings/item-form'), testID: 'item-form' },
        ],
      },
    ],
  };

  const empty =
    locations.length === 0 ? (
      <EmptyState icon="door" title="No Locations Yet" message="Paste the locations from the plans to start this job's list.">
        <View style={{ marginTop: 14 }}>
          <Button label="Set Up the Job" variant="tinted" onPress={openSetup} />
        </View>
      </EmptyState>
    ) : narrowed ? (
      <EmptyState icon="filter" title="Nothing Matches" message="No open items match the filters.">
        <View style={{ marginTop: 14 }}>
          <Button label="Clear the Filters" variant="tinted" onPress={() => setView({ ...view, filters: NO_FILTERS })} />
        </View>
      </EmptyState>
    ) : items.every((i) => i.status === 'removed') ? (
      <EmptyState icon="templates" title="Nothing on the List Yet" message="Walk it with the camera, or start from a template of what always needs doing.">
        <View style={{ marginTop: 14 }}>
          <Button label="Add From a Template" variant="tinted" onPress={() => setTemplateSheet(true)} testID="empty-template" />
        </View>
      </EmptyState>
    ) : (
      <EmptyState icon="checkmark.circle.fill" title="Nothing Open" message="Every item on this job is complete." />
    );
  /** Copied items into a location picked from this job. */
  async function pasteInto(locationId: string) {
    setPasting(false);
    if (!copied) return;
    const plan = pastePlan(copied.items, { jobId, locationId }, items, randomUUID);
    const where = locations.find((l) => l.id === locationId)?.label ?? 'there';
    if (plan.items.length === 0) {
      feedback.toast({ message: `Already on the list in ${where}.` });
      return;
    }
    const ids = await data.addItems(plan.items);
    haptic.success();
    feedback.toast({
      message: `Pasted ${itemsWord(ids.length)} in ${where}${plan.skipped.length > 0 ? `. ${plan.skipped.length} already there` : ''}`,
      action: { label: 'Undo', onPress: () => void data.updateItems(ids.map((id) => ({ id, patch: { status: 'removed' } }))) },
    });
  }
  const pasteRow =
    copied && locations.length > 0 && !q ? (
      <View style={[styles.note, styles.pasteNote]} testID="job-paste-banner">
        <Icon name="clipboard" size={17} color={colors.onBar} />
        <Text variant="subheadline" color={colors.onBar} style={{ flex: 1 }} numberOfLines={2}>
          {itemsWord(copied.items.length)} copied{copied.jobId === jobId ? '' : ` from ${jobs.find((j) => j.id === copied.jobId)?.name ?? 'another job'}`}
        </Text>
        <Touchable feedback="opacity" onPress={() => setPasting(true)} accessibilityRole="button" testID="job-paste" hitSlop={8}>
          <Text variant="label" weight="600" color={colors.onBar}>
            Paste
          </Text>
        </Touchable>
        <Touchable feedback="opacity" onPress={() => clipboard.clear()} accessibilityRole="button" accessibilityLabel="Forget what was copied" hitSlop={10}>
          <Icon name="xmark" size={16} color={colors.onBarQuiet} />
        </Touchable>
      </View>
    ) : null;
  // The filters that are on, as chips that take them off.
  const filterBar = <FilterBar jobId={jobId} filters={filters} onChange={(next) => setView({ ...view, filters: next })} style={styles.filterBar} />;
  const filterCount = Object.values(filters).reduce((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);
  const groupChips = (
    <ChipRow
      style={styles.groups}
      chips={(['room', 'company', 'waiting'] as GroupBy[]).map((g) => ({
        key: g,
        label: g === 'waiting' ? 'Waiting On' : `By ${GROUP_LABELS[g]}`,
        on: view.groupBy === g,
        onPress: () => {
          haptic.selection();
          setView({ ...view, groupBy: g });
        },
        testID: `group-by-${g}`,
      }))}
    />
  );
  // The figures count what the list below shows: the whole job, or what the filters leave.
  const readyCount = allOpen.filter((i) => i.ready && !i.unfinished).length;
  const waitingCount = allOpen.filter((i) => !i.ready && !i.unfinished).length;
  const openState = (state: 'ready' | 'waiting') =>
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'state', key: state } });
  const top = (
    <View>
      <Figures
        columns={3}
        cells={[
          { label: 'Open', value: String(total), testID: 'count-open' },
          { label: 'Ready', value: String(readyCount), color: colors.ok, onPress: () => openState('ready'), testID: 'count-ready' },
          { label: 'Waiting', value: String(waitingCount), onPress: () => openState('waiting'), testID: 'count-waiting' },
        ]}
      />
      <Tiles
        style={styles.tiles}
        tiles={[
          {
            icon: 'camera',
            label: 'Walk',
            primary: true,
            badge: walked > 0 ? `${walked} of ${inOrder.length}` : undefined,
            onPress: () => (walked > 0 && !nextToWalk ? newWalk() : openCamera(nextToWalk?.id ?? null)),
            testID: 'walk',
          },
          { icon: 'send', label: 'Send Lists', onPress: openSend, testID: 'send' },
        ]}
      />
    </View>
  );

  return (
    <>
      <Page
        title={job?.name ?? 'Job'}
        eyebrow={job?.closed ? 'Closed' : `Active · ${inOrder.length} ${inOrder.length === 1 ? 'location' : 'locations'}`}
        marker={job?.closed ? colors.quiet : colors.okFill}
        subtitle={job?.address || undefined}
        crumb={['Jobs', job?.name ?? 'Job']}
        backLabel="Jobs"
        right={[{ kind: 'button', label: 'New Item', icon: 'plus', iconOnly: true, onPress: newItem, testID: 'new-item' }, menu]}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: `Search ${total} ${total === 1 ? 'item' : 'items'}`,
          filter: { onPress: () => setSheet(true), count: filterCount + (view.showCompleted ? 1 : 0) || undefined },
        }}
        tab={{ active: 'jobs', jobId }}
        beforeSearch={top}
        list={(scroll) =>
          q ? (
            <SectionList
              {...scroll.props}
              key="search"
              sections={found}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
              ListHeaderComponent={
                <View>
                  {scroll.header}
                  {filterBar}
                </View>
              }
              ListEmptyComponent={<EmptyState icon="magnifyingglass" title="No Results" message={`No items${narrowed ? ' that fit the filters' : ''} match “${q}”.`} />}
              renderSectionHeader={({ section }) => <SectionLabel label={section.title} right={String(section.data.length)} style={styles.sectionLabel} />}
              renderItem={({ item, index, section }) => (
                <ItemRow
                  item={item}
                  photo={firstPhoto.get(item.id)}
                  comments={commentsOn.get(item.id)}
                  holds={holds}
                  company={names(item.companyId) || undefined}
                  first={index === 0}
                  last={index === section.data.length - 1}
                  stripe={index % 2 === 1}
                  checking={actions.checking.has(item.id)}
                  onOpen={actions.onOpen}
                  onCheck={actions.onCheck}
                  onReady={actions.onReady}
                  onRemove={actions.onRemove}
                  onAddPhoto={addPhoto}
                />
              )}
            />
          ) : (
            <SectionList
              {...scroll.props}
              key="groups"
              sections={sections}
              keyExtractor={(row) => row.group.key}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
              ListHeaderComponent={
                <View>
                  {scroll.header}
                  {groupChips}
                  {filterBar}
                  {pasteRow}
                  {draftsRow}
                </View>
              }
              ListEmptyComponent={empty}
              renderSectionHeader={({ section }) =>
                section.title ? (
                  <SectionLabel label={section.title} right={section.totals || undefined} style={styles.sectionLabel} testID={`floor-totals-${section.key}`} />
                ) : (
                  <View style={{ height: 14 }} />
                )
              }
              renderSectionFooter={() => <View style={{ height: 2 }} />}
              renderItem={({ item: row, index, section }) => (
                <GroupRow
                  row={row}
                  by={view.groupBy}
                  location={locationById.get(row.group.key)}
                  share={doneShare.get(row.group.key)}
                  first={index === 0}
                  last={index === section.data.length - 1}
                  stripe={index % 2 === 1}
                  sayReady={view.groupBy !== 'waiting' && !(filters.states.length === 1 && (filters.states[0] === 'ready' || filters.states[0] === 'not_ready'))}
                  onPress={() => openGroup(row.group.key)}
                />
              )}
            />
          )
        }
      />
      <AddTemplateSheet jobId={jobId} templateId={templateParam ?? null} visible={templateSheet} onClose={() => setTemplateSheet(false)} />
      <OptionPicker
        visible={pasting}
        title={copied ? `Paste ${itemsTitle(copied.items.length)} In` : 'Paste In'}
        options={formOptions.roomOptions}
        value={null}
        onSelect={(locationId) => void pasteInto(locationId)}
        onClose={() => setPasting(false)}
      />
      <ViewSheet
        jobId={jobId}
        visible={sheet}
        onClose={() => setSheet(false)}
        view={view}
        onChange={setView}
        saved={saved}
        onSaveDefault={() => void data.setViewSettings(view)}
        matching={total}
      />
    </>
  );
}

function GroupRow({
  row,
  by,
  location,
  share,
  first,
  last,
  stripe,
  sayReady,
  onPress,
}: {
  row: Row;
  by: GroupBy;
  location?: Location;
  /** How many of its items are complete, of all of them. */
  share?: { done: number; all: number };
  first: boolean;
  last: boolean;
  stripe: boolean;
  /** How many are ready, unless the grouping or the filters say it already. */
  sayReady: boolean;
  onPress: () => void;
}) {
  const { group } = row;
  const count = group.open;
  const label = by === 'room' && location ? location.label : group.label;
  const pct = share && share.all > 0 ? share.done / share.all : count === 0 ? 1 : 0;
  const said = [label, count === 0 ? 'nothing open' : `${count} open`, sayReady && count > 0 ? `${group.ready} ready` : '', `${Math.round(pct * 100)} percent complete`]
    .filter(Boolean)
    .join(', ');
  return (
    <Touchable
      feedback="highlight"
      pressDelay={40}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={said}
      testID={`group-${group.key}`}
      style={[styles.row, first ? styles.rowFirst : null, last ? styles.rowLast : styles.rowRule, stripe ? styles.rowStripe : null]}
    >
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} weight="500" style={{ flex: 1 }}>
            {label}
          </Text>
          {share && share.all > 0 ? (
            <Text variant="label" color={colors.secondary} tabular>
              {Math.round(pct * 100)}%
            </Text>
          ) : null}
        </View>
        <MetaLine
          facts={
            count === 0
              ? [{ text: 'Nothing open', color: colors.ok }]
              : [
                  { text: `${count} open`, color: colors.label },
                  sayReady ? { text: `${group.ready} ready`, color: colors.ok } : null,
                ]
          }
        />
        <View style={styles.bar} testID={`group-meta-${group.key}`}>
          <ProgressBar value={pct} />
        </View>
      </View>
      <Icon name="chevron.right" size={14} color={colors.quiet} weight="medium" />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  tiles: { marginTop: 10 },
  groups: { marginBottom: 6 },
  filterBar: { marginTop: 4, marginBottom: 4 },
  note: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: layout.margin,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.stripe,
  },
  pasteNote: { backgroundColor: colors.bar, borderColor: colors.bar },
  friday: { backgroundColor: colors.cell, borderColor: colors.borderStrong },
  sectionLabel: { marginTop: 16, marginBottom: 8 },
  row: {
    marginHorizontal: layout.margin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.rowPadding,
    paddingVertical: 11,
    backgroundColor: colors.cell,
    borderLeftWidth: layout.hairline,
    borderRightWidth: layout.hairline,
    borderColor: colors.border,
  },
  rowFirst: { borderTopWidth: layout.hairline },
  rowLast: { borderBottomWidth: layout.hairline },
  rowRule: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  rowStripe: { backgroundColor: '#F7F9F9' },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  bar: { marginTop: 4 },
});
