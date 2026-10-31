// A job: its levels and locations, each with how much is open, how much is ready, what is past due
// and how long the open work takes, and each level with its own totals. Tap a location for its
// items. Drafts sit on their own at the top when there are any; anything past due shows as a red
// count on Schedule. View and Filter groups by trade, company or what items wait on, and narrows
// the list to exactly the work in question; the filters that are on show as chips under the title.
// The camera in the bottom bar starts a walk; Schedule is each company's visits; Send Lists makes
// each company's list to send.

import {
  byFloor,
  commentCounts,
  GROUP_LABELS,
  groupItems,
  isFiltered,
  NO_FILTERS,
  pastDue,
  totalText,
  totalTime,
  type GroupBy,
  type Item,
  type ItemGroup,
  type Location,
  type Photo,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useCanSuggest } from '@/ai/suggest';
import { BarTool, CAMERA_BAR_HEIGHT, CameraBar } from '@/components/CameraBar';
import { draftFill } from '@/components/draftFill';
import { FilterBar } from '@/components/FilterBar';
import { ItemRow } from '@/components/ItemRow';
import { useItemActions } from '@/components/useItemActions';
import { ViewSheet } from '@/components/ViewSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { useFilterContext, useHolds, useJobView } from '@/data/view';
import { Button, EmptyState, Icon, Page, Text, Touchable, type BarMenu, type IconName } from '@/ui';

const GROUP_ICONS: Record<GroupBy, IconName> = { room: 'rooms', trade: 'wrench', company: 'person.2.fill', waiting: 'hourglass' };

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
  const hay = [item.title, item.description, item.waitingOn.join(' '), item.poOrCo ?? '', String(item.number ?? ''), name(item.companyId), name(item.tradeId), name(item.locationId)]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export default function JobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const visits = data.useVisits(jobId);
  const titles = data.useTitles();
  const canFill = useCanSuggest();
  const saved = data.useViewSettings();
  const context = useFilterContext(jobId);
  const today = context.today;
  const [view, setView] = useJobView(jobId, saved);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const actions = useItemActions(jobId);
  const commentsOn = commentCounts(data.useComments(jobId));
  const holds = useHolds(jobId);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trades) map.set(t.id, t.name);
    for (const c of companies) map.set(c.id, c.name);
    for (const l of locations) map.set(l.id, l.label);
    return (id: string | null) => (id ? (map.get(id) ?? '') : '');
  }, [trades, companies, locations]);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const filters = view.filters;
  const narrowed = isFiltered(filters);
  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const groups = useMemo(() => groupItems(items, view.groupBy, lookups, { filters, context }), [items, view.groupBy, lookups, filters, context]);
  const draftItems = items.filter((i) => i.unfinished && i.status === 'open');
  const drafts = draftItems.length;
  const late = useMemo(() => pastDue(items, visits, today).length, [items, visits, today]);
  const rows: Row[] = groups.map((group) => ({ group })).filter((r) => r.group.open > 0 || (view.groupBy === 'room' && !narrowed));

  // An item waiting on two things shows under both, but counts once.
  const openItems = (list: Row[]) => {
    const seen = new Map<string, Item>();
    for (const r of list) for (const i of r.group.items) if (i.status === 'open') seen.set(i.id, i);
    return [...seen.values()];
  };
  const allOpen = openItems(rows);
  const total = allOpen.length;
  const totalTimeText = totalText(totalTime(allOpen));

  const sections = useMemo<Section[]>(() => {
    const totalsOf = (list: Row[]) => {
      const open = list.flatMap((r) => r.group.items.filter((i) => i.status === 'open'));
      if (open.length === 0) return '';
      return [openWords(open.length), totalText(totalTime(open))].filter(Boolean).join(' · ');
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

  const subtitle = [openWords(total), totalTimeText].filter(Boolean).join(' · ');

  const openGroup = (key: string) =>
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: view.groupBy, key } });
  const openSetup = () => router.push({ pathname: '/jobs/[jobId]/setup', params: { jobId } });
  const openSend = () => router.push({ pathname: '/jobs/[jobId]/send', params: { jobId } });
  const openSchedule = () => router.push({ pathname: '/jobs/[jobId]/schedule', params: { jobId } });
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
        accessibilityLabel={`Drafts, ${drafts}`}
        testID="open-unfinished"
        style={styles.drafts}
      >
        <Icon name="pencil.tip" size={20} color={colors.tint} weight="semibold" />
        <Text weight="600" style={{ flex: 1 }}>
          Drafts
        </Text>
        <Text color={colors.secondary} tabular>
          {drafts}
        </Text>
        <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" />
      </Touchable>
    ) : null;
  const openCamera = () => {
    capture.start({ jobId, roomId: null });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
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
    icon: 'ellipsis.circle',
    testID: 'more',
    groups: [
      {
        actions: [
          { label: 'Activity', icon: 'clock', onPress: openActivity, testID: 'activity' },
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
    ) : (
      <EmptyState icon="checkmark.circle.fill" title="Nothing Open" message="Every item on this job is complete." />
    );
  const filterBar = <FilterBar jobId={jobId} filters={filters} onChange={(next) => setView({ ...view, filters: next })} onOpen={() => setSheet(true)} />;

  return (
    <>
      <Page
        title={job?.name ?? 'Job'}
        large
        subtitle={subtitle}
        backLabel="Jobs"
        background="plain"
        right={[
          { kind: 'button', label: 'New Item', icon: 'plus', iconOnly: true, onPress: newItem, testID: 'new-item' },
          { kind: 'button', label: 'Send Lists', icon: 'share', iconOnly: true, onPress: openSend, testID: 'send' },
          menu,
        ]}
        search={{ value: query, onChange: setQuery, placeholder: 'Search Items', collapsed: true }}
        footerHeight={CAMERA_BAR_HEIGHT}
        footer={
          <CameraBar
            onCamera={openCamera}
            left={<BarTool icon="calendar" label="Schedule" badge={late} badgeLabel="past due" onPress={openSchedule} testID="schedule" />}
            right={
              <BarTool
                icon={narrowed || view.showCompleted ? 'filter' : GROUP_ICONS[view.groupBy]}
                label={`By ${GROUP_LABELS[view.groupBy]}${narrowed || view.showCompleted ? ', Filtered' : ''}`}
                onPress={() => setSheet(true)}
                testID="filter"
              />
            }
          />
        }
        list={(scroll) =>
          q ? (
            <SectionList
              {...scroll.props}
              key="search"
              sections={found}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled
              contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
              ListHeaderComponent={
                <View>
                  {scroll.header}
                  {filterBar}
                </View>
              }
              ListEmptyComponent={<EmptyState icon="magnifyingglass" title="No Results" message={`No items${narrowed ? ' that fit the filters' : ''} match “${q}”.`} />}
              renderSectionHeader={({ section }) => (
                <View style={styles.header}>
                  <Text variant="subheadline" weight="600" color={colors.secondary}>
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({ item, index, section }) => (
                <ItemRow
                  item={item}
                  photo={firstPhoto.get(item.id)}
                  comments={commentsOn.get(item.id)}
                  holds={holds}
                  company={names(item.companyId) || undefined}
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
                  {filterBar}
                  {draftsRow}
                </View>
              }
              ListEmptyComponent={empty}
              renderSectionHeader={({ section }) =>
                section.title ? (
                  <View style={styles.header}>
                    <Text variant="subheadline" weight="600" color={colors.secondary} style={{ flex: 1 }} numberOfLines={1}>
                      {section.title}
                    </Text>
                    {section.totals ? (
                      <Text variant="footnote" color={colors.secondary} tabular testID={`floor-totals-${section.key}`}>
                        {section.totals}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ height: 4 }} />
                )
              }
              renderSectionFooter={() => <View style={{ height: 10 }} />}
              renderItem={({ item: row, index, section }) => (
                <GroupRow
                  row={row}
                  by={view.groupBy}
                  location={locationById.get(row.group.key)}
                  last={index === section.data.length - 1}
                  sayReady={view.groupBy !== 'waiting' && !(filters.states.length === 1 && (filters.states[0] === 'ready' || filters.states[0] === 'not_ready'))}
                  onPress={() => openGroup(row.group.key)}
                />
              )}
            />
          )
        }
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
  last,
  sayReady,
  onPress,
}: {
  row: Row;
  by: GroupBy;
  location?: Location;
  last: boolean;
  /** How many are ready, unless the grouping or the filters say it already. */
  sayReady: boolean;
  onPress: () => void;
}) {
  const { group } = row;
  const count = group.open;
  const label = by === 'room' && location ? location.label : group.label;
  const time = totalText(group.time);
  const ready = !sayReady || count === 0 ? '' : group.ready === count ? 'All ready' : group.ready === 0 ? 'None ready' : `${group.ready} ready`;
  const meta = [ready, time].filter(Boolean).join(' · ');
  const lateDays = group.late > 0 ? `${group.late} ${group.late === 1 ? 'day' : 'days'} past due` : '';
  const lateCount = !lateDays && group.pastDue > 0 ? `${group.pastDue} past due` : '';
  const red = lateDays || lateCount;
  const said = [label, count === 0 ? 'nothing open' : `${count} open`, meta, red].filter(Boolean).join(', ');
  return (
    <View style={styles.rowWrap}>
      <Touchable
        feedback="highlight"
        pressDelay={40}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={said}
        testID={`group-${group.key}`}
        style={styles.row}
      >
        <View style={[styles.rowBody, last ? null : styles.divider]}>
          <View style={styles.rowText}>
            <Text numberOfLines={1} weight="500">
              {label}
            </Text>
            {meta || red ? (
              <Text variant="subheadline" color={colors.secondary} numberOfLines={1} testID={`group-meta-${group.key}`}>
                {meta}
                {meta && red ? ' · ' : ''}
                {red ? (
                  <Text variant="subheadline" weight="600" color={colors.destructive}>
                    {red}
                  </Text>
                ) : null}
              </Text>
            ) : null}
          </View>
          {count === 0 ? (
            <Icon name="checkmark" size={15} color={colors.circle} weight="semibold" />
          ) : (
            <Text color={colors.secondary} tabular weight="500">
              {count}
            </Text>
          )}
          <Icon name="chevron.right" size={12} color={colors.chevron} weight="bold" />
        </View>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  drafts: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: layout.margin,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: layout.radius,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingHorizontal: layout.inset, paddingTop: 16, paddingBottom: 4, backgroundColor: colors.background },
  rowWrap: { backgroundColor: colors.background },
  row: { paddingLeft: layout.inset, backgroundColor: colors.background },
  rowBody: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingRight: layout.inset },
  rowText: { flex: 1, gap: 1 },
  divider: { borderBottomWidth: layout.hairline, borderBottomColor: colors.separator },
});
