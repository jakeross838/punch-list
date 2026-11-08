// Starred and Recent: the items you starred, on every job, and the items you opened last, newest
// first, each a tap away. Both are kept on this phone.

import type { Item } from '@punch/core';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { useRecent, useStarred } from '@/data/stars';
import { EmptyState, Icon, LedgerRow, Page, Panel, SectionLabel, Text } from '@/ui';

export default function RecentScreen() {
  const data = useData();
  const items = data.useAllItems();
  const jobs = data.useJobs();
  const locations = data.useAllLocations();
  const starred = useStarred();
  const recent = useRecent();
  const byId = new Map(items.map((i) => [i.id, i]));
  const jobName = new Map(jobs.map((j) => [j.id, j.name]));
  const place = new Map(locations.map((l) => [l.id, l.label]));
  const starredItems = starred.flatMap((id) => {
    const i = byId.get(id);
    return i && i.status !== 'removed' ? [i] : [];
  });
  const recentItems = recent.flatMap((o) => {
    const i = byId.get(o.itemId);
    return i && i.status !== 'removed' ? [i] : [];
  });

  const row = (i: Item, last: boolean, kind: string) => (
    <LedgerRow
      key={`${kind}-${i.id}`}
      last={last}
      lead={kind === 'star' ? <Icon name="star" size={16} color={colors.label} /> : undefined}
      onPress={() => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId: i.jobId, itemId: i.id } })}
      chevron
      testID={`${kind}-${i.id}`}
    >
      <Text numberOfLines={2} color={i.status === 'complete' ? colors.secondary : colors.label}>
        {i.title || i.description || 'No title yet'}
      </Text>
      <Text variant="footnote" color={colors.secondary} numberOfLines={1}>
        {[i.number !== null ? `Item ${i.number}` : null, place.get(i.locationId), jobName.get(i.jobId), i.status === 'complete' ? 'Complete' : null].filter(Boolean).join(' · ')}
      </Text>
    </LedgerRow>
  );

  return (
    <Page title="Starred and Recent" backLabel="Jobs" tab={{ active: 'jobs' }}>
      {starredItems.length === 0 && recentItems.length === 0 ? (
        <EmptyState icon="star" title="Nothing Here Yet" message="Star an item from its More menu to keep it at the top of its job. Items you open show here too." />
      ) : null}
      {starredItems.length > 0 ? (
        <>
          <SectionLabel label={`Starred ${starredItems.length}`} />
          <Panel style={styles.panel} testID="starred-list">
            {starredItems.map((i, k) => row(i, k === starredItems.length - 1, 'star'))}
          </Panel>
        </>
      ) : null}
      {recentItems.length > 0 ? (
        <>
          <SectionLabel label="Opened Lately" />
          <Panel style={styles.panel} testID="recent-list">
            {recentItems.map((i, k) => row(i, k === recentItems.length - 1, 'recent'))}
          </Panel>
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 6 },
});
