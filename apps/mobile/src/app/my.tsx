// My Items: what is assigned to you, on every job you see, each job under its own heading with the
// open work in location order. Check items off here like anywhere else; tap one to open it.

import { assignedTo, commentCounts, sortItems, tradeRanks, type Item, type Job, type Photo } from '@punch/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ItemRow } from '@/components/ItemRow';
import { useItemActions } from '@/components/useItemActions';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useHolds } from '@/data/view';
import { EmptyState, Page, Text } from '@/ui';

export default function MyItemsScreen() {
  const data = useData();
  const me = data.useMe();
  const jobs = data.useJobs();
  const mine = assignedTo(data.useAssigned(me?.id ?? ''), me?.id ?? '');
  const byJob = jobs.map((job) => ({ job, items: mine.filter((i) => i.jobId === job.id) })).filter((g) => g.items.length > 0);
  return (
    <Page title="My Items" backLabel="Jobs" subtitle={`${mine.length} open`} tab={{ active: 'jobs' }}>
      {byJob.length === 0 ? (
        <EmptyState icon="person" title="Nothing Assigned to You" message="Items assigned to you on any job show here." />
      ) : (
        byJob.map(({ job, items }) => <JobBlock key={job.id} job={job} items={items} />)
      )}
    </Page>
  );
}

function JobBlock({ job, items }: { job: Job; items: Item[] }) {
  const data = useData();
  const locations = data.useLocations(job.id);
  const companies = data.useCompanies();
  const photos = data.usePhotos(job.id);
  const commentsOn = commentCounts(data.useComments(job.id));
  const holds = useHolds(job.id);
  const actions = useItemActions(job.id);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  // Location order, as the walk goes, then the list's own order within each location.
  const order = new Map(locations.map((l) => [l.id, l.sortOrder]));
  const rows = sortItems(items, tradeRanks(data.useTrades())).sort((a, b) => (order.get(a.locationId) ?? 0) - (order.get(b.locationId) ?? 0));
  return (
    <View style={styles.block} testID={`my-job-${job.id}`}>
      <View style={styles.header}>
        <Text variant="headline" style={{ flex: 1 }} numberOfLines={1}>
          {job.name}
        </Text>
        <Text variant="subheadline" color={colors.secondary} tabular>
          {`${rows.length} open`}
        </Text>
      </View>
      {rows.map((item, index) => (
        <ItemRow
          key={item.id}
          item={item}
          photo={firstPhoto.get(item.id)}
          comments={commentsOn.get(item.id)}
          holds={holds}
          location={locations.find((l) => l.id === item.locationId)?.label}
          assignee={companies.find((c) => c.id === item.companyId)?.name}
          last={index === rows.length - 1}
          checking={actions.checking.has(item.id)}
          onOpen={(i) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId: job.id, itemId: i.id } })}
          onCheck={actions.onCheck}
          onReady={actions.onReady}
          onRemove={actions.onRemove}
          onAddPhoto={() => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId: job.id, itemId: item.id } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 10 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingHorizontal: layout.inset, paddingTop: 14, paddingBottom: 4 },
});
