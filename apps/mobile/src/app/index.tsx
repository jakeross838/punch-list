// Jobs: the first screen. Each job is a card with how many items are open and how much of the
// list is complete.

import type { Job } from '@punch/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { EmptyState, Icon, Page, Text, Touchable } from '@/ui';

const newJob = () => router.push('/jobs/new');

export default function JobsScreen() {
  const data = useData();
  const jobs = data.useJobs();
  const me = data.useMe();
  return (
    <Page
      title="Jobs"
      large
      eyebrow="Ross Built"
      back={false}
      background="plain"
      right={[{ kind: 'button', label: 'New Job', icon: 'plus', iconOnly: true, onPress: newJob, testID: 'new-job' }]}
    >
      {jobs.length === 0 ? (
        <EmptyState icon="house.fill" title="No Jobs Yet" message="Set up the first job to start its list." />
      ) : (
        <View style={styles.cards}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </View>
      )}
      <View style={styles.actions}>
        <Touchable feedback="opacity" onPress={newJob} accessibilityRole="button" accessibilityLabel="Set Up a New Job" style={styles.textButton}>
          <Text color={colors.tint}>Set Up a New Job</Text>
        </Touchable>
      </View>
      <View style={styles.footer}>
        {me ? (
          <Text variant="footnote" color={colors.secondary} align="center">
            Signed in as {me.name}
          </Text>
        ) : null}
        {data.mode === 'preview' ? (
          <Text variant="footnote" color={colors.secondary} align="center">
            Preview with sample data. Changes reset when you reload the page.
          </Text>
        ) : null}
      </View>
    </Page>
  );
}

function JobCard({ job }: { job: Job }) {
  const items = useData()
    .useItems(job.id)
    .filter((i) => i.status !== 'removed');
  const open = items.filter((i) => i.status === 'open');
  const done = items.filter((i) => i.status === 'complete').length;
  const share = items.length > 0 ? Math.max(done / items.length, done > 0 ? 0.02 : 0) : 0;
  return (
    <Touchable
      feedback="scale"
      onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${job.name}, ${open.length} open`}
      testID={`job-${job.id}`}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitle}>
          <Text variant="title2">{job.name}</Text>
          {job.address ? (
            <Text variant="subheadline" color={colors.secondary}>
              {job.address}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron.right" size={14} color="#86868B" weight="bold" style={styles.chevron} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
      <Text variant="subheadline" color={colors.secondary} tabular>
        {open.length} open
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  cards: { gap: 12, paddingHorizontal: layout.margin, paddingTop: 6 },
  card: { borderRadius: layout.radius, backgroundColor: colors.surface, paddingTop: 20, paddingBottom: 18, paddingLeft: 20, paddingRight: 18, gap: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: { flex: 1, gap: 2 },
  chevron: { marginTop: 7 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.tint },
  actions: { flexDirection: 'row', paddingHorizontal: layout.inset, paddingTop: 10 },
  textButton: { height: 44, justifyContent: 'center' },
  footer: { gap: 4, paddingHorizontal: 32, paddingTop: 40 },
});
