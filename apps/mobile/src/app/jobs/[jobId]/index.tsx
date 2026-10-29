import { FILTER_LABELS, groupItems, itemNumberLabel, type GroupBy, type Item, type ItemFilter } from '@punch/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Chip, PreviewBanner, Row, Segmented } from '@/components/ui';
import { colors, space, type } from '@/constants/theme';
import { useData } from '@/data/api';

const FILTERS: ItemFilter[] = ['open', 'ready', 'not_ready', 'added_scope', 'all'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-02" reads as "November 2" in the list. The field itself keeps the full date. */
function dayLabel(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  const name = month ? MONTHS[month - 1] : undefined;
  return name && day ? `${name} ${day}` : iso;
}

export default function CompletionListScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const [by, setBy] = useState<GroupBy>('room');
  const [filter, setFilter] = useState<ItemFilter>('open');

  const groups = useMemo(
    () => groupItems(items, by, filter, { locations, trades, companies }),
    [items, by, filter, locations, trades, companies],
  );
  const sections = groups
    .filter((g) => by === 'room' || g.items.length > 0)
    .map((g) => ({ key: g.key, title: g.label, open: g.open, ready: g.ready, data: g.items }));
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const t of trades) names.set(t.id, t.name);
    for (const c of companies) names.set(c.id, c.name);
    for (const l of locations) names.set(l.id, l.label);
    return (id: string | null) => (id ? names.get(id) ?? '' : '');
  }, [trades, companies, locations]);

  const openItem = (item: Item) =>
    router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: item.id } });
  const addItem = (locationId?: string) =>
    router.push({ pathname: '/jobs/[jobId]/items/new', params: locationId ? { jobId, locationId } : { jobId } });

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
      <Stack.Screen
        options={{
          title: job?.name ?? 'Completion List',
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/jobs/[jobId]/setup', params: { jobId } })} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.headerLink}>Setup</Text>
            </Pressable>
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: space(12) }}
        ListHeaderComponent={
          <View style={styles.controls}>
            <PreviewBanner />
            <Segmented<GroupBy>
              options={[
                ['room', 'By room'],
                ['trade', 'By trade'],
                ['company', 'By company'],
              ]}
              value={by}
              onChange={setBy}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(1) }}>
              {FILTERS.map((f) => (
                <Chip key={f} label={FILTER_LABELS[f]} selected={filter === f} onPress={() => setFilter(f)} />
              ))}
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCounts}>
                {section.open} open, {section.ready} ready
              </Text>
            </View>
            {by === 'room' ? (
              <Pressable onPress={() => addItem(section.key)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.headerLink}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        renderItem={({ item, index }) => {
          const company = nameOf(item.companyId);
          const trade = nameOf(item.tradeId);
          const where = by === 'room' ? '' : `${nameOf(item.locationId)} · `;
          const status = item.ready ? '' : `\nWaiting on ${item.waitingOn ?? 'something'}${item.readyBy ? `, ready by ${dayLabel(item.readyBy)}` : ''}`;
          const scope = item.kind === 'added_scope' ? ' · Added scope' : '';
          return (
            <Row
              title={`${itemNumberLabel(item)}  ${item.title}`}
              subtitle={`${where}${company} · ${trade}${scope}${status}`}
              stripe={index % 2 === 1}
              muted={item.status !== 'open'}
              right={
                item.status === 'complete' ? (
                  <Badge label="Complete" tone="muted" />
                ) : item.ready ? (
                  <Badge label="Ready" tone="good" />
                ) : (
                  <Badge label="Not ready" tone="warn" />
                )
              }
              onPress={() => openItem(item)}
            />
          );
        }}
      />
      <View style={styles.footer}>
        <Button label="Add an item" onPress={() => addItem()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  controls: { padding: space(2), gap: space(1.5) },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    backgroundColor: colors.hairline,
  },
  sectionTitle: { fontSize: type.body, fontWeight: '700', color: colors.ink },
  sectionCounts: { fontSize: type.small, color: colors.ink },
  headerLink: { fontSize: type.body, fontWeight: '700', color: colors.blue },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space(2),
    backgroundColor: colors.page,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
