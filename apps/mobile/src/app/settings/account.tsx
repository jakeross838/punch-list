// Your account: who you are signed in as, what you do at Ross Built and what you see, and the jobs
// you are on and as what. An admin changes these in People. On the iPhone, This Phone says whether
// every change made here has gone up, and anything the server turned down. Sign Out clears what is
// on this phone; it all comes back when you sign in again. It waits until every change has gone up.

import { isAdmin, PART_LABELS, ROLE_HINTS, ROLE_LABELS, SEES_LABELS } from '@punch/core';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, Page, Text, useFeedback } from '@/ui';

export default function AccountScreen() {
  const data = useData();
  const feedback = useFeedback();
  const me = data.useMe();
  const jobs = data.useJobs();
  const team = data.useTeams().filter((t) => t.personId === me?.id);
  const sync = data.useSync();
  // Signing out: the screen goes as the sign in comes up.
  if (!me) return <Page title="Account" backLabel="Jobs" />;
  const admin = isAdmin(me);
  const version = Constants.expoConfig?.version;

  const signOut = () =>
    feedback.actionSheet({
      title: 'Sign out?',
      message: `What is on this ${data.mode === 'preview' ? 'page' : 'phone'} is cleared, and it all comes back when you sign in again with ${me.email}.`,
      actions: [
        {
          label: 'Sign Out',
          destructive: true,
          onPress: () => {
            haptic.tap();
            data.signOut().catch((e: unknown) => {
              haptic.warning();
              feedback.toast({ message: e instanceof Error ? e.message : 'That did not go. Try again.' });
            });
          },
        },
      ],
    });

  return (
    <Page title={me.name} large subtitle={me.email} backLabel="Jobs">
      <ListSection header="You" footer={admin ? 'Change any of it in People.' : 'An admin changes these in People.'}>
        <ListRow title="Email" value={me.email} testID="account-email" />
        <ListRow title="Phone" value={me.phone ?? 'None'} />
        <ListRow title="Role" subtitle={ROLE_HINTS[me.role]} value={ROLE_LABELS[me.role]} testID="account-role" />
        <ListRow title="Sees" value={me.role === 'admin' ? SEES_LABELS.all : SEES_LABELS[me.sees]} />
        {admin ? (
          <ListRow title="Edit in People" tone="tint" onPress={() => router.push({ pathname: '/settings/people/[personId]', params: { personId: me.id } })} testID="account-edit" />
        ) : null}
      </ListSection>
      <ListSection header="Your Jobs" footer={team.length === 0 ? "You are not on any job's team yet." : undefined}>
        {team.map((t) => {
          const job = jobs.find((j) => j.id === t.jobId);
          return job ? (
            <ListRow
              key={t.id}
              title={job.name}
              subtitle={job.closed ? 'Closed' : undefined}
              value={PART_LABELS[t.part]}
              accessory="chevron"
              onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
              testID={`account-job-${job.id}`}
            />
          ) : null;
        })}
      </ListSection>
      {data.mode === 'live' ? (
        <ListSection
          header="This Phone"
          footer={
            sync.refused.length > 0
              ? 'The server turned these down, so they are no longer on the phone. Make them again, or ask an admin.'
              : sync.waiting > 0
                ? 'Changes made here go up on their own when there is a signal.'
                : 'Every change made on this phone has gone up.'
          }
        >
          <ListRow title="Signal" value={sync.online ? 'Connected' : 'No Signal'} testID="account-signal" />
          <ListRow title="Waiting to Go Up" value={sync.waiting === 0 ? 'Nothing' : `${sync.waiting} ${sync.waiting === 1 ? 'Change' : 'Changes'}`} testID="account-waiting" />
          {sync.refused.map((r) => (
            <ListRow key={r.id} title={r.what} subtitle={formatWhen(r.at)} />
          ))}
          {sync.refused.length > 0 ? <ListRow title="Clear This List" tone="tint" onPress={() => void data.clearRefused()} testID="account-clear-refused" /> : null}
        </ListSection>
      ) : null}
      <ListSection>
        <ListRow title="Sign Out" tone="destructive" onPress={signOut} testID="sign-out" />
      </ListSection>
      <Text variant="footnote" color={colors.secondary} align="center" style={styles.version}>
        {`${APP_NAME}${version ? `, version ${version}` : ''}`}
      </Text>
    </Page>
  );
}

/** When the server turned a change down, the way a person says it. */
function formatWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  version: { marginHorizontal: layout.inset, marginTop: -8, marginBottom: 32 },
});
