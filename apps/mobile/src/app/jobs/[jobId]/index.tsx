// A job: its levels and locations with how many items are open in each, calm and quick to scan.
// Tap a location for its items. Drafts sit on their own at the top when there are any; anything past
// due shows as a red count on Schedule. View and Filter switches to trades, companies, what items wait on or status and
// narrows what counts; the camera in the bottom bar starts a walk; Schedule is each company's
// visits; Send Lists makes each company's list to send.

import {
  byFloor,
  dayOfDate,
  GROUP_LABELS,
  groupItems,
  pastDue,
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
import { ItemRow } from '@/components/ItemRow';
import { useItemActions } from '@/components/useItemActions';
import { SHOW_WORDS, ViewSheet } from '@/components/ViewSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { useJobView } from '@/data/view';
import { Button, EmptyState, Icon, Page, Text, Touchable, type BarMenu, type IconName } from '@/ui';

const GROUP_ICONS: Record<GroupBy, IconName> = { room: 'rooms', trade: 'wrench', company: 'person.2.fill', waiting: 'hourglass' };

interface Row {
  group: ItemGroup;
  /** Items that count under the filter, not counting completed ones. */
  count: number;
}

interface Section {
  key: string;
  title: string | null;
  data: Row[];
}

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
  const today = dayOfDate(new Date());
  const [view, setView] = useJobView(jobId, saved);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const actions = useItemActions(jobId);

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

  const narrowed = view.filter !== 'open' || !!view.tradeId || !!view.companyId;
  const groups = useMemo(
    () => groupItems(items, view.groupBy, view.filter, { locations, trades, companies }, { tradeId: view.tradeId, companyId: view.companyId, today }),
    [items, view.groupBy, view.filter, view.tradeId, view.companyId, locations, trades, companies, today],
  );
  const draftItems = items.filter((i) => i.unfinished && i.status === 'open');
  const drafts = draftItems.length;
  const late = useMemo(() => pastDue(items, visits, today).length, [items, visits, today]);
  const rows: Row[] = groups
    .map((group) => ({ group, count: group.items.filter((i) => i.status !== 'complete').length }))
    .filter((r) => r.count > 0 || (view.groupBy === 'room' && !narrowed));
  // An item waiting on two things shows under both, but counts once.
  const total = new Set(rows.flatMap((r) => r.group.items.filter((i) => i.status !== 'complete').map((i) => i.id))).size;

  const sections = useMemo<Section[]>(() => {
    if (view.groupBy !== 'room') return [{ key: 'all', title: null, data: rows }];
    return byFloor(rows, (r) => locationById.get(r.group.key)).map((f) => ({ key: f.floor, title: f.floor, data: f.rows }));
  }, [rows, view.groupBy, locationById]);

  const q = query.trim();
  const found = useMemo(() => {
    if (!q) return [];
    const hits = items.filter((i) => i.status !== 'removed' && matchesQuery(i, q, names));
    return groupItems(hits, 'room', 'all', { locations, trades, companies }, { tradeId: view.tradeId, companyId: view.companyId })
      .filter((g) => g.items.length > 0)
      .map((g) => ({ key: g.key, title: g.label, data: g.items }));
  }, [q, items, names, locations, trades, companies, view.tradeId, view.companyId]);

  const scopeName = [names(view.tradeId), names(view.companyId)].filter(Boolean).join(', ');
  const subtitle = `${total} ${SHOW_WORDS[view.filter]}${scopeName ? `, ${scopeName}` : ''}`;
  const jobTrades = trades.filter((t) => jobCompanies.some((jc) => jc.tradeId === t.id));
  const jobCompanyList = companies.filter((c) => jobCompanies.some((jc) => jc.companyId === c.id)).sort((a, b) => a.name.localeCompare(b.name));

  const openGroup = (key: string) =>
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: view.groupBy, key } });
  const openSetup = () => router.push({ pathname: '/jobs/[jobId]/setup', params: { jobId } });
  const openSend = () => router.push({ pathname: '/jobs/[jobId]/send', params: { jobId } });
  const openSchedule = () => router.push({ pathname: '/jobs/[jobId]/schedule', params: { jobId } });
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

  const menu: BarMenu = {
    kind: 'menu',
    label: 'More',
    icon: 'ellipsis.circle',
    testID: 'more',
    groups: [
      {
        actions: [
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
    ) : (
      <EmptyState icon="checkmark.circle.fill" title="Nothing Here" message={`No ${SHOW_WORDS[view.filter]} items${scopeName ? ` for ${scopeName}` : ''} right now.`} />
    );

  return (
    <>
      <Page
        title={job?.name ?? 'Job'}
        large
        subtitle={subtitle}
        backLabel="Jobs"
        background="plain"
        right={[{ kind: 'button', label: 'Send Lists', icon: 'share', iconOnly: true, onPress: openSend, testID: 'send' }, menu]}
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
              ListHeaderComponent={<View>{scroll.header}</View>}
              ListEmptyComponent={<EmptyState icon="magnifyingglass" title="No Results" message={`No items match “${q}”.`} />}
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
                  last={index === section.data.length - 1}
                  checking={actions.checking.has(item.id)}
                  onOpen={actions.onOpen}
                  onCheck={actions.onCheck}
                  onReady={actions.onReady}
                  onRemove={actions.onRemove}
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
                  {draftsRow}
                </View>
              }
              ListEmptyComponent={empty}
              renderSectionHeader={({ section }) =>
                section.title ? (
                  <View style={styles.header}>
                    <Text variant="subheadline" weight="600" color={colors.secondary}>
                      {section.title}
                    </Text>
                  </View>
                ) : (
                  <View style={{ height: 8 }} />
                )
              }
              renderSectionFooter={() => <View style={{ height: 14 }} />}
              renderItem={({ item: row, index, section }) => (
                <GroupRow
                  row={row}
                  by={view.groupBy}
                  location={locationById.get(row.group.key)}
                  last={index === section.data.length - 1}
                  onPress={() => openGroup(row.group.key)}
                />
              )}
            />
          )
        }
      />
      <ViewSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        view={view}
        onChange={setView}
        saved={saved}
        onSaveDefault={() => void data.setViewSettings(view)}
        trades={jobTrades}
        companies={jobCompanyList}
      />
    </>
  );
}

function GroupRow({ row, by, location, last, onPress }: { row: Row; by: GroupBy; location?: Location; last: boolean; onPress: () => void }) {
  const { group, count } = row;
  const nothingOpen = group.open === 0;
  const label = by === 'room' && location ? location.label : group.label;
  return (
    <View style={styles.rowWrap}>
      <Touchable
        feedback="highlight"
        pressDelay={40}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${nothingOpen ? 'nothing open' : `${count}`}`}
        testID={`group-${group.key}`}
        style={styles.row}
      >
        <View style={[styles.rowBody, last ? null : styles.divider]}>
          <Text numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </Text>
          {group.late > 0 ? (
            <Text variant="footnote" weight="600" color={colors.destructive} tabular>
              {group.late} {group.late === 1 ? 'day' : 'days'} past due
            </Text>
          ) : null}
          {nothingOpen ? (
            <Icon name="checkmark" size={17} color={colors.circle} weight="semibold" />
          ) : count > 0 ? (
            <Text color={colors.secondary} tabular>
              {count}
            </Text>
          ) : null}
          <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" />
        </View>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  drafts: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: layout.margin,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: layout.radius,
    backgroundColor: colors.surface,
  },
  header: { paddingHorizontal: layout.inset, paddingTop: 18, paddingBottom: 6, backgroundColor: colors.background },
  rowWrap: { backgroundColor: colors.background },
  row: { paddingLeft: layout.inset, backgroundColor: colors.background },
  rowBody: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: layout.inset },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.separator },
});
