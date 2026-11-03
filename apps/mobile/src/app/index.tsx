// Jobs: the first screen. My Items at the top when anything is assigned to you, then each open job
// as a card with who runs it, how many items are open and how much of the list is complete. Closed
// jobs wait at the bottom, out of the way. Admins make jobs; the gear holds People, Companies,
// Templates, Item Form and your Account, where you sign out.

import { assignedTo, isAdmin, teamText, totalText, totalTime, type Job } from '@punch/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { EmptyState, Icon, ListRow, ListSection, Page, Text, Touchable, type BarItem, type MenuGroup } from '@/ui';

const newJob = () => router.push('/jobs/new');

export default function JobsScreen() {
  const data = useData();
  const jobs = data.useJobs();
  const me = data.useMe();
  const people = data.usePeople();
  const admin = isAdmin(me);
  const [showClosed, setShowClosed] = useState(false);
  const open = jobs.filter((j) => !j.closed);
  const closed = jobs.filter((j) => j.closed);

  const settings: MenuGroup[] = [
    {
      actions: [
        { label: 'People', icon: 'person.2.fill', onPress: () => router.push('/settings/people'), testID: 'people' },
        { label: 'Companies', icon: 'building', onPress: () => router.push('/settings/companies'), testID: 'companies' },
        { label: 'Templates', icon: 'templates', onPress: () => router.push('/settings/templates'), testID: 'templates' },
        { label: 'Item Form', icon: 'list.bullet', onPress: () => router.push('/settings/item-form'), testID: 'item-form' },
      ],
    },
    { actions: [{ label: 'Account', icon: 'person.circle', onPress: () => router.push('/settings/account'), testID: 'account' }] },
    // The preview can be seen as anyone, to check what each person sees and can change.
    ...(data.mode === 'preview' && data.previewAs
      ? [
          {
            title: 'See the Preview As',
            actions: people
              .filter((p) => p.active)
              .map((p) => ({ label: p.name, checked: p.id === me?.id, onPress: () => data.previewAs?.(p.id), testID: `preview-as-${p.id}` })),
          },
        ]
      : []),
  ];
  const right: BarItem[] = [
    { kind: 'menu', label: 'Settings', icon: 'gear', groups: settings, testID: 'settings' },
    ...(admin ? [{ kind: 'button' as const, label: 'New Job', icon: 'plus' as const, iconOnly: true, onPress: newJob, testID: 'new-job' }] : []),
  ];

  return (
    <Page title="Jobs" large eyebrow="Ross Built" back={false} background="plain" right={right}>
      {me ? <MyItemsRow personId={me.id} /> : null}
      {open.length === 0 ? (
        <EmptyState
          icon="house.fill"
          title="No Jobs Yet"
          message={admin ? 'Set up the first job to start its list.' : 'Jobs show here once you are on one.'}
        />
      ) : (
        <View style={styles.cards}>
          {open.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </View>
      )}
      {admin ? (
        <View style={styles.actions}>
          <Touchable feedback="opacity" onPress={newJob} accessibilityRole="button" accessibilityLabel="Set Up a New Job" style={styles.textButton}>
            <Text color={colors.tint}>Set Up a New Job</Text>
          </Touchable>
        </View>
      ) : null}
      {closed.length > 0 ? (
        <View style={styles.closed}>
          {showClosed ? (
            <ListSection header="Closed Jobs" variant="plain">
              {closed.map((job) => (
                <ListRow
                  key={job.id}
                  title={job.name}
                  subtitle={job.address || undefined}
                  icon="archive"
                  iconColor={colors.secondary}
                  accessory="chevron"
                  onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
                  testID={`job-${job.id}`}
                />
              ))}
            </ListSection>
          ) : (
            <Touchable feedback="opacity" onPress={() => setShowClosed(true)} accessibilityRole="button" testID="show-closed" style={styles.showClosed}>
              <Text variant="subheadline" color={colors.tint}>
                Show {closed.length} Closed {closed.length === 1 ? 'Job' : 'Jobs'}
              </Text>
            </Touchable>
          )}
        </View>
      ) : null}
      <View style={styles.footer}>
        {me ? (
          <Text variant="footnote" color={colors.secondary} align="center">
            Signed in as {me.name}
            {admin ? ', an admin' : ''}
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

/** What is assigned to you on every job, one tap away. Shows once something is. */
function MyItemsRow({ personId }: { personId: string }) {
  const mine = assignedTo(useData().useAssigned(personId), personId);
  if (mine.length === 0) return null;
  const time = totalText(totalTime(mine));
  return (
    <Touchable
      feedback="highlight"
      onPress={() => router.push('/my')}
      accessibilityRole="button"
      accessibilityLabel={`My Items, ${mine.length} open`}
      testID="my-items"
      style={styles.mine}
    >
      <Icon name="person" size={19} color={colors.tint} />
      <View style={{ flex: 1 }}>
        <Text weight="600">My Items</Text>
        <Text variant="subheadline" color={colors.secondary} tabular numberOfLines={1}>
          {[`${mine.length} open`, time].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" />
    </Touchable>
  );
}

function JobCard({ job }: { job: Job }) {
  const data = useData();
  const items = data.useItems(job.id).filter((i) => i.status !== 'removed');
  const people = data.usePeople();
  const team = data.useTeams().filter((t) => t.jobId === job.id);
  // Drafts wait in Drafts until they are filled in, so they are not counted here, as on the job.
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const done = items.filter((i) => i.status === 'complete').length;
  const time = totalText(totalTime(open));
  const share = items.length > 0 ? Math.max(done / items.length, done > 0 ? 0.02 : 0) : 0;
  const runs = teamText(team, people);
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
      <View style={styles.cardBottom}>
        <Text variant="subheadline" color={colors.secondary} tabular>
          {[`${open.length} open`, time].filter(Boolean).join(' · ')}
        </Text>
        {runs ? (
          <Text variant="subheadline" color={colors.secondary} numberOfLines={1} style={styles.team}>
            {runs}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  mine: {
    minHeight: 56,
    paddingVertical: 8,
    marginHorizontal: layout.margin,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderRadius: layout.radius,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cards: { gap: 12, paddingHorizontal: layout.margin, paddingTop: 6 },
  card: { borderRadius: layout.radius, backgroundColor: colors.surface, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 14, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: { flex: 1, gap: 2 },
  cardBottom: { gap: 2 },
  team: { flexShrink: 1 },
  chevron: { marginTop: 5 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.tint },
  actions: { flexDirection: 'row', paddingHorizontal: layout.inset, paddingTop: 10 },
  textButton: { height: 44, justifyContent: 'center' },
  closed: { paddingTop: 12 },
  showClosed: { height: 44, justifyContent: 'center', paddingHorizontal: layout.inset, alignSelf: 'flex-start' },
  footer: { gap: 4, paddingHorizontal: 32, paddingTop: 40 },
});
