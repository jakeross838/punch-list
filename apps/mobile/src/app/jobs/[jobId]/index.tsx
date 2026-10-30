// The Completion List for one job, built like Reminders: count tiles, search, items grouped by
// room (or trade, or company) under sticky headers, a circle to check each one off, swipe for
// Ready and Remove, and the "…" menu for Group By, Show Completed and Job Setup.

import { complete, groupItems, remove, reopen, restore, RuleError, tidyItem, type GroupBy, type Item, type ItemFields } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, SectionList, StyleSheet, View } from 'react-native';
import { ItemRow, type Names } from '@/components/ItemRow';
import { fieldsOf } from '@/components/ItemForm';
import { SummaryTiles, TILE_LABELS, type TileCounts, type TileFilter } from '@/components/SummaryTiles';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Button, EmptyState, haptic, Icon, Page, Text, Touchable, useFeedback, type BarMenu } from '@/ui';

const CHECK_DELAY = 650;

interface Section {
  key: string;
  title: string;
  open: number;
  ready: number;
  data: Item[];
}

function matchesQuery(item: Item, q: string, names: Names): boolean {
  const hay = [item.title, item.description, item.waitingOn ?? '', item.poOrCo ?? '', String(item.number ?? ''), names.of(item.companyId), names.of(item.tradeId), names.of(item.locationId)]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export default function CompletionListScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const me = data.useMe();

  const [by, setBy] = useState<GroupBy>('room');
  const [filter, setFilter] = useState<TileFilter>('open');
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const names = useMemo<Names>(() => {
    const map = new Map<string, string>();
    for (const t of trades) map.set(t.id, t.name);
    for (const c of companies) map.set(c.id, c.name);
    for (const l of locations) map.set(l.id, l.label);
    return {
      of: (id) => (id ? (map.get(id) ?? '') : ''),
      person: (id) => (me && id === me.id ? me.name : 'Ross Built'),
    };
  }, [trades, companies, locations, me]);

  const counts = useMemo<TileCounts>(() => {
    const open = items.filter((i) => i.status === 'open');
    return {
      open: open.length,
      ready: open.filter((i) => i.ready).length,
      not_ready: open.filter((i) => !i.ready).length,
      added_scope: open.filter((i) => i.kind === 'added_scope').length,
    };
  }, [items]);

  const q = query.trim();
  const sections = useMemo<Section[]>(() => {
    const found = q ? items.filter((i) => matchesQuery(i, q, names)) : items;
    const showEmptyRooms = by === 'room' && filter === 'open' && !q;
    return groupItems(found, by, filter, { locations, trades, companies }, { showCompleted })
      .filter((g) => g.items.length > 0 || showEmptyRooms)
      .map((g) => ({ key: g.key, title: g.label, open: g.open, ready: g.ready, data: g.items }));
  }, [items, q, names, by, filter, showCompleted, locations, trades, companies]);
  const shownCount = sections.reduce((n, s) => n + s.data.length, 0);

  const apply = useCallback(
    async (item: Item, change: (f: ItemFields) => ItemFields) => {
      try {
        const next = change(fieldsOf(item));
        await data.updateItem(item.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt });
      } catch (e) {
        haptic.warning();
        feedback.toast({ message: e instanceof RuleError ? e.message : 'That did not save. Try again.' });
      }
    },
    [data, feedback],
  );

  const onCheck = useCallback(
    (item: Item) => {
      if (item.status === 'complete') {
        haptic.tap();
        void apply(item, reopen);
        return;
      }
      const pending = timers.current.get(item.id);
      if (pending) {
        // A second tap before it leaves the list takes the check back.
        clearTimeout(pending);
        timers.current.delete(item.id);
        setChecking((s) => new Set([...s].filter((id) => id !== item.id)));
        return;
      }
      haptic.success();
      setChecking((s) => new Set(s).add(item.id));
      timers.current.set(
        item.id,
        setTimeout(() => {
          timers.current.delete(item.id);
          void apply(item, (f) => {
            if (!me) throw new RuleError('Sign in to mark items complete');
            return complete(f, me);
          }).finally(() => setChecking((s) => new Set([...s].filter((id) => id !== item.id))));
        }, CHECK_DELAY),
      );
    },
    [apply, me],
  );

  const onReady = useCallback(
    (item: Item) => {
      haptic.tap();
      const next = tidyItem({ ...fieldsOf(item), ready: true });
      void data.updateItem(item.id, { ready: next.ready, waitingOn: next.waitingOn, readyBy: next.readyBy });
    },
    [data],
  );

  const onRemove = useCallback(
    (item: Item) => {
      haptic.heavy();
      void apply(item, remove);
      feedback.toast({
        message: `Removed ${item.title}`,
        action: { label: 'Undo', onPress: () => void data.updateItem(item.id, restore({ ...fieldsOf(item), status: 'removed' })) },
      });
    },
    [apply, data, feedback],
  );

  const onOpen = useCallback(
    (item: Item) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: item.id } }),
    [jobId],
  );
  const addItem = (locationId?: string) =>
    router.push({ pathname: '/jobs/[jobId]/items/new', params: locationId ? { jobId, locationId } : { jobId } });
  const openSetup = () => router.push({ pathname: '/jobs/[jobId]/setup', params: { jobId } });

  const menu: BarMenu = {
    kind: 'menu',
    label: 'More',
    icon: 'ellipsis',
    testID: 'more',
    groups: [
      {
        title: 'Group By',
        actions: [
          { label: 'Room', icon: 'door', checked: by === 'room', onPress: () => setBy('room'), testID: 'group-room' },
          { label: 'Trade', icon: 'wrench', checked: by === 'trade', onPress: () => setBy('trade'), testID: 'group-trade' },
          { label: 'Company', icon: 'person.2.fill', checked: by === 'company', onPress: () => setBy('company'), testID: 'group-company' },
        ],
      },
      {
        actions: [
          {
            label: showCompleted ? 'Hide Completed' : 'Show Completed',
            icon: showCompleted ? 'eye.slash' : 'eye',
            onPress: () => setShowCompleted((v) => !v),
            testID: 'toggle-completed',
          },
          { label: 'Job Setup', icon: 'slider', onPress: openSetup, testID: 'job-setup' },
        ],
      },
    ],
  };

  const noRooms = locations.length === 0;
  const empty = noRooms ? (
    <EmptyState icon="door" title="No Rooms Yet" message="Paste the room list from the plans to start this job's list.">
      <View style={{ marginTop: 14 }}>
        <Button label="Set Up the Job" variant="tinted" onPress={openSetup} />
      </View>
    </EmptyState>
  ) : q ? (
    <EmptyState icon="magnifyingglass" title="No Results" message={`No items match “${q}”.`} />
  ) : (
    <EmptyState icon="checkmark.circle.fill" title="Nothing Here" message={`No ${TILE_LABELS[filter].toLowerCase()} items right now.`} />
  );

  return (
    <Page
      title={job?.name ?? 'Completion List'}
      large
      subtitle={job?.address}
      right={[menu]}
      bottom={[{ kind: 'button', label: 'New Item', icon: 'plus.circle.fill', onPress: () => addItem(), testID: 'new-item' }]}
      search={{ value: query, onChange: setQuery, placeholder: 'Search Items' }}
      list={(scroll) => (
        <SectionList
          {...scroll.props}
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          initialNumToRender={24}
          windowSize={12}
          contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
          ListHeaderComponent={
            <View>
              {scroll.header}
              <SummaryTiles counts={counts} value={filter} onChange={setFilter} />
              {showCompleted ? (
                <Text variant="footnote" color={colors.secondary} style={styles.note}>
                  Showing completed items too.
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={empty}
          ListFooterComponent={
            shownCount > 0 ? (
              <Text variant="footnote" color={colors.secondary} align="center" style={styles.footer}>
                {shownCount} {shownCount === 1 ? 'item' : 'items'}
              </Text>
            ) : undefined
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.header}>
              <Text variant="title3" weight="700" numberOfLines={2} color={section.data.length === 0 ? colors.secondary : colors.label} style={{ flex: 1 }}>
                {section.title}
              </Text>
              {section.open > 0 ? (
                <Text variant="subheadline" color={colors.secondary} tabular>
                  {section.open} open{section.ready > 0 ? `, ${section.ready} ready` : ''}
                </Text>
              ) : null}
              {by === 'room' ? (
                <Touchable
                  feedback="scale"
                  hitSlop={10}
                  onPress={() => addItem(section.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add an item to ${section.title}`}
                  style={styles.add}
                >
                  <Icon name="plus" size={15} color={colors.tint} weight="bold" />
                </Touchable>
              ) : null}
            </View>
          )}
          renderSectionFooter={() => <View style={{ height: 6 }} />}
          renderItem={({ item, index, section }) => (
            <ItemRow
              item={item}
              by={by}
              names={names}
              first={index === 0}
              last={index === section.data.length - 1}
              checking={checking.has(item.id)}
              onOpen={onOpen}
              onCheck={onCheck}
              onReady={onReady}
              onRemove={onRemove}
            />
          )}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: layout.margin + 4,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'rgba(242, 242, 247, 0.97)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px) saturate(180%)' } : null),
  },
  add: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tintSoft },
  note: { marginHorizontal: layout.margin + 4, marginTop: 6 },
  footer: { marginTop: 18 },
});
