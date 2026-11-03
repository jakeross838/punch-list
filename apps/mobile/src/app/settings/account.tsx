// Your account: who you are signed in as, what you do at Ross Built and what you see, and the jobs
// you are on and as what. An admin changes these in People. Sign Out clears what is on this phone;
// it all comes back when you sign in again.

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
            void data.signOut();
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
      <ListSection>
        <ListRow title="Sign Out" tone="destructive" onPress={signOut} testID="sign-out" />
      </ListSection>
      <Text variant="footnote" color={colors.secondary} align="center" style={styles.version}>
        {`${APP_NAME}${version ? `, version ${version}` : ''}`}
      </Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  version: { marginHorizontal: layout.inset, marginTop: -8, marginBottom: 32 },
});
