// A job, with only what helps act on it, laid out like Reminders: the search with Filter beside it,
// the count tiles (Open, Ready and Waiting, the last two a tap into their list) and a segmented
// control for how the list is grouped (by location, by company or by what items wait on), all once
// there are items. What to check, the drafts and copied items show as rows in a card above the
// list, as Mail lists its mailboxes. The levels follow, each location with how much is open and
// ready and a thin bar for how much is done. Tap a location for its items. Capture in the bottom bar
// carries on the walk at the next location not walked, and Send sends the lists. Add From a
// Template puts a template's tasks in every location they fit; copied items paste here into a
// location picked from the job.

import {
  inWalkOrder,
  assigneeKey,
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
import { useCanReadPlans } from '@/ai/readPlans';
import { useClaudeReady } from '@/ai/claude';
import { draftFill } from '@/components/draftFill';
import { FilterBar } from '@/components/FilterBar';
import { ItemRow } from '@/components/ItemRow';
import { backToJobs, useJobActions } from '@/components/JobActions';
import { useFormOptions } from '@/components/ItemForm';
import { StationSheet } from '@/components/StationSheet';
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
  EmptyState,
  Figures,
  haptic,
  Icon,
  IconTile,
  LedgerRow,
  MetaLine,
  OptionPicker,
  Page,
  Panel,
  ProgressBar,
  SectionLabel,
  Segmented,
  Text,
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
  const hay = [item.title, item.description, item.waitingOn.join(' '), item.poOrCo ?? '', String(item.number ?? ''), name(item.companyId), name(item.assignedTo), name(item.locationId)]
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
  const jobActions = useJobActions();
  const copied = useClipboard();
  const formOptions = useFormOptions(jobId, '');
  // Opened from a template's Add to a Job: its sheet comes up straight away.
  const [templateSheet, setTemplateSheet] = useState(!!templateParam);
  const [station, setStation] = useState(false);
  const [pasting, setPasting] = useState(false);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const people = data.usePeople();
  const jobCompanies = data.useJobCompanies(jobId);
  const titles = data.useTitles();
  const canFill = useClaudeReady(true);
  const canSay = useClaudeReady();
  const canReadPlans = useCanReadPlans();
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
    const keyOf = (i: Item) => (view.groupBy === 'company' ? (assigneeKey(i) ?? 'none') : i.locationId);
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
    for (const p of people) map.set(p.id, p.name);
    for (const l of locations) map.set(l.id, l.label);
    return (id: string | null) => (id ? (map.get(id) ?? '') : '');
  }, [companies, people, locations]);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const filters = view.filters;
  const narrowed = isFiltered(filters);
  // Each list keeps a trade's items together, in the trades' order.
  const lookups = useMemo(() => ({ locations, companies, people, trades }), [locations, companies, people, trades]);
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
  // What the companies say is done, from their pages: one tap to the list to check.
  const toCheck = items.filter((i) => i.status === 'open' && !i.unfinished && i.markedDoneAt).length;
  const openCheck = () => router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'state', key: 'check' } });
  // To Check and Drafts, as Mail lists its mailboxes: a name, a count and a chevron.
  const inbox = [
    toCheck > 0 ? { key: 'check', icon: 'checkmark.circle.fill' as IconName, label: 'To Check', count: toCheck, onPress: openCheck, said: `To Check, ${toCheck} marked done by the companies`, testID: 'open-to-check' } : null,
    drafts > 0 ? { key: 'drafts', icon: 'doc' as IconName, label: 'Drafts', count: drafts, onPress: openDrafts, said: `Drafts, ${drafts} to finish`, testID: 'open-unfinished' } : null,
  ].filter((r) => r !== null);
  const inboxCard =
    inbox.length > 0 && !q ? (
      <Panel style={styles.card}>
        {inbox.map((r, i) => (
          <LedgerRow
            key={r.key}
            last={i === inbox.length - 1}
            lead={<IconTile name={r.icon} />}
            trail={
              <Text color={colors.secondary} tabular>
                {r.count}
              </Text>
            }
            onPress={r.onPress}
            accessibilityLabel={r.said}
            testID={r.testID}
          >
            <Text>{r.label}</Text>
          </LedgerRow>
        ))}
      </Panel>
    ) : null;
  const openCamera = (roomId: string | null = null) => {
    capture.start({ jobId, roomId });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  };
  // The walk: how many locations are walked, and the next one not walked yet, in floor order.
  const inOrder = inWalkOrder(locations.filter((l) => l.active));
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
          ...(canSay ? [{ label: 'Say It', icon: 'mic' as IconName, onPress: () => router.push({ pathname: '/jobs/[jobId]/say', params: { jobId } }), testID: 'say-it' }] : []),
          { label: 'Activity', icon: 'clock', onPress: openActivity, testID: 'activity' },
          { label: 'Find Duplicates', icon: 'copy', onPress: () => router.push({ pathname: '/jobs/[jobId]/duplicates', params: { jobId } }), testID: 'find-duplicates' },
          { label: 'Make a List', icon: 'doc', onPress: () => router.push({ pathname: '/jobs/[jobId]/send', params: { jobId, start: 'list' } }), testID: 'make-list' },
          { label: 'Job Station', icon: 'tv', onPress: () => setStation(true), testID: 'job-station' },
          ...(walked > 0 ? [{ label: 'Start a New Walk', icon: 'rooms' as IconName, onPress: newWalk, testID: 'new-walk' }] : []),
          { label: 'Add From a Template', icon: 'templates', onPress: () => setTemplateSheet(true), testID: 'add-template' },
          { label: 'Job Setup', icon: 'slider', onPress: openSetup, testID: 'job-setup' },
          { label: 'Item Form', icon: 'list.bullet', onPress: () => router.push('/settings/item-form'), testID: 'item-form' },
        ],
      },
      ...(jobActions.admin && job
        ? [
            {
              title: 'This Job',
              actions: [
                { label: 'Edit the Name and Address', icon: 'pencil.tip' as IconName, onPress: () => jobActions.edit(job), testID: 'edit-job' },
                job.closed
                  ? { label: 'Open the Job Again', icon: 'undo' as IconName, onPress: () => jobActions.reopen(job), testID: 'reopen-job' }
                  : { label: 'Close the Job', icon: 'archive' as IconName, onPress: () => jobActions.close(job, backToJobs), testID: 'close-job' },
                {
                  label: 'Delete the Job',
                  icon: 'trash' as IconName,
                  destructive: true,
                  onPress: () =>
                    jobActions.remove(job, { items: items.filter((i) => i.status !== 'removed').length, photos: photos.filter((p) => !p.removed).length }, backToJobs),
                  testID: 'delete-job',
                },
              ],
            },
          ]
        : []),
    ],
  };

  const empty =
    locations.length === 0 ? (
      <EmptyState icon="camera" title="Start the Walk" message="A photo of each thing left to do.">
        <View style={{ marginTop: 14, gap: 10, alignSelf: 'stretch' }}>
          <Button label="Start the Walk" icon="camera" onPress={() => openCamera(null)} testID="empty-walk" />
          {canReadPlans && jobActions.admin ? (
            <Button label="Read the Plans" icon="map" variant="tinted" onPress={() => router.push({ pathname: '/jobs/[jobId]/read-plans', params: { jobId } })} testID="empty-read-plans" />
          ) : null}
          <Button label="Set Up the Locations" variant="tinted" onPress={openSetup} testID="empty-setup" />
        </View>
      </EmptyState>
    ) : narrowed ? (
      <EmptyState icon="filter" title="Nothing Matches the Filters">
        <View style={{ marginTop: 14 }}>
          <Button label="Clear the Filters" variant="tinted" onPress={() => setView({ ...view, filters: NO_FILTERS })} />
        </View>
      </EmptyState>
    ) : items.every((i) => i.status === 'removed') ? (
      <EmptyState icon="templates" title="Nothing on the List Yet">
        <View style={{ marginTop: 14 }}>
          <Button label="Add From a Template" variant="tinted" onPress={() => setTemplateSheet(true)} testID="empty-template" />
        </View>
      </EmptyState>
    ) : (
      <EmptyState icon="checkmark.circle.fill" title="Everything Is Complete" />
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
      <Panel style={styles.card} testID="job-paste-banner">
        <LedgerRow
          last
          lead={<IconTile name="clipboard" />}
          trail={
            <>
              <Touchable feedback="opacity" onPress={() => setPasting(true)} accessibilityRole="button" testID="job-paste" hitSlop={8}>
                <Text weight="600" color={colors.tint}>
                  Paste
                </Text>
              </Touchable>
              <Touchable feedback="opacity" onPress={() => clipboard.clear()} accessibilityRole="button" accessibilityLabel="Forget what was copied" hitSlop={10}>
                <Icon name="xmark.circle.fill" size={20} color={colors.circle} />
              </Touchable>
            </>
          }
        >
          <Text numberOfLines={2}>
            {itemsWord(copied.items.length)} copied{copied.jobId === jobId ? '' : ` from ${jobs.find((j) => j.id === copied.jobId)?.name ?? 'another job'}`}
          </Text>
        </LedgerRow>
      </Panel>
    ) : null;
  // The filters that are on, as chips that take them off.
  const filterBar = <FilterBar jobId={jobId} filters={filters} onChange={(next) => setView({ ...view, filters: next })} style={styles.filterBar} />;
  const filterCount = Object.values(filters).reduce((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);
  const groupChips = (
    <Segmented<GroupBy>
      style={styles.groups}
      options={(['room', 'company', 'waiting'] as GroupBy[]).map((g) => [g, GROUP_LABELS[g]] as const)}
      value={view.groupBy}
      onChange={(groupBy) => setView({ ...view, groupBy })}
      testID="group-by"
    />
  );
  // The figures count what the list below shows: the whole job, or what the filters leave.
  const readyCount = allOpen.filter((i) => i.ready && !i.unfinished).length;
  const waitingCount = allOpen.filter((i) => !i.ready && !i.unfinished).length;
  const openState = (state: 'ready' | 'waiting') =>
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'state', key: state } });
  // The counts, once there is something to count.
  const hasItems = allOpen.length > 0 || items.some((i) => i.status !== 'removed');
  const top = hasItems ? (
    <Figures
      columns={3}
      cells={[
        { label: 'Open', value: String(total), icon: 'list.bullet', color: colors.tint, testID: 'count-open' },
        { label: 'Ready', value: String(readyCount), icon: 'checkmark', color: colors.okFill, onPress: () => openState('ready'), testID: 'count-ready' },
        { label: 'Waiting', value: String(waitingCount), icon: 'hourglass', color: colors.waiting, onPress: () => openState('waiting'), testID: 'count-waiting' },
      ]}
    />
  ) : undefined;

  return (
    <>
      <Page
        title={job?.name ?? 'Job'}
        eyebrow={job?.closed ? 'Closed' : undefined}
        marker={job?.closed ? colors.quiet : undefined}
        subtitle={job?.address || undefined}
        backLabel="Jobs"
        right={[{ kind: 'button', label: 'New Item', icon: 'plus', iconOnly: true, onPress: newItem, testID: 'new-item' }, menu]}
        search={
          hasItems
            ? {
                value: query,
                onChange: setQuery,
                placeholder: 'Search items',
                filter: { onPress: () => setSheet(true), count: filterCount + (view.showCompleted ? 1 : 0) || undefined },
              }
            : undefined
        }
        // Capture carries on the walk: the next location not walked yet, in floor order.
        tab={{ active: 'jobs', jobId, onCapture: () => openCamera(nextToWalk?.id ?? null) }}
        summary={top}
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
              renderSectionHeader={({ section }) => <SectionLabel label={section.title} right={String(section.data.length)} />}
              renderItem={({ item, index, section }) => (
                <ItemRow
                  item={item}
                  photo={firstPhoto.get(item.id)}
                  comments={commentsOn.get(item.id)}
                  holds={holds}
                  assignee={names(item.companyId) || names(item.assignedTo) || undefined}
                  first={index === 0}
                  last={index === section.data.length - 1}
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
                  {hasItems ? groupChips : null}
                  {filterBar}
                  {pasteRow}
                  {inboxCard}
                </View>
              }
              ListEmptyComponent={empty}
              renderSectionHeader={({ section }) =>
                section.title ? (
                  <SectionLabel prominent label={section.title} right={section.totals || undefined} testID={`floor-totals-${section.key}`} />
                ) : (
                  <View style={{ height: 16 }} />
                )
              }
              renderItem={({ item: row, index, section }) => (
                <GroupRow
                  row={row}
                  by={view.groupBy}
                  location={locationById.get(row.group.key)}
                  share={doneShare.get(row.group.key)}
                  first={index === 0}
                  last={index === section.data.length - 1}
                  sayReady={view.groupBy !== 'waiting' && !(filters.states.length === 1 && (filters.states[0] === 'ready' || filters.states[0] === 'not_ready'))}
                  onPress={() => openGroup(row.group.key)}
                />
              )}
            />
          )
        }
      />
      <AddTemplateSheet jobId={jobId} templateId={templateParam ?? null} visible={templateSheet} onClose={() => setTemplateSheet(false)} />
      <StationSheet jobId={jobId} visible={station} onClose={() => setStation(false)} />
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
      {jobActions.sheet}
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
    <LedgerRow card={{ first, last }} onPress={onPress} accessibilityLabel={said} testID={`group-${group.key}`}>
      <Text numberOfLines={1}>{label}</Text>
      <MetaLine
        testID={`group-meta-${group.key}`}
        facts={count === 0 ? [{ text: 'Nothing open', color: colors.ok }] : [`${count} open`, sayReady && group.ready > 0 ? { text: `${group.ready} ready`, color: colors.ok } : null]}
      />
      {/* How much is done, once some is and some is not: nothing done and all done say themselves. */}
      {pct > 0 && pct < 1 ? (
        <View style={styles.bar}>
          <ProgressBar value={pct} />
        </View>
      ) : null}
    </LedgerRow>
  );
}

const styles = StyleSheet.create({
  groups: { marginHorizontal: layout.margin, marginTop: 6, marginBottom: 4 },
  filterBar: { marginTop: 8, marginBottom: 2 },
  card: { marginTop: 16 },
  bar: { marginTop: 6, marginBottom: 1 },
});
