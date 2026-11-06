// Me: who you are signed in as, what you do at your company and what you see, the jobs you are on
// and as what, and the company's setup: its name, People, Companies, Templates and Item Form. An
// admin changes who you are in People, and the company's name here. On the iPhone, This Phone says
// whether every change made here has gone up, and anything the server turned down. Sign Out clears
// what is on this phone; it all comes back when you sign in again. It waits until every change has
// gone up. Delete My Account takes your sign in away for good, and the last one at a company takes
// the whole company with them.

import { COMPANY_NAME_MAX, companyNameProblem, isAdmin, PART_LABELS, ROLE_HINTS, ROLE_LABELS, SEES_LABELS } from '@punch/core';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListTextField, Page, Sheet, Text, useFeedback } from '@/ui';

export default function AccountScreen() {
  const data = useData();
  const feedback = useFeedback();
  const me = data.useMe();
  const jobs = data.useJobs();
  const team = data.useTeams().filter((t) => t.personId === me?.id);
  const sync = data.useSync();
  const people = data.usePeople();
  const org = data.useOrg();
  const [renaming, setRenaming] = useState<string | null>(null);
  // Signing out: the screen goes as the sign in comes up.
  if (!me) return <Page title="Me" tab={{}} />;
  const admin = isAdmin(me);
  const version = Constants.expoConfig?.version;
  const company = org.name || 'Your Company';
  const others = people.filter((p) => p.active && p.id !== me.id);

  const rename = async () => {
    if (renaming === null) return;
    const problem = companyNameProblem(renaming);
    if (problem) {
      haptic.warning();
      feedback.toast({ message: `${problem}.` });
      return;
    }
    try {
      await data.renameOrg(renaming);
      haptic.success();
      setRenaming(null);
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  };

  const deleteAccount = () => {
    // A company with people still in it keeps an admin: someone else is made admin first.
    if (admin && others.length > 0 && !others.some(isAdmin)) {
      feedback.actionSheet({
        title: 'Make someone else an admin first',
        message: `${company} needs an admin. In People, make someone else an admin, then delete your account.`,
        actions: [{ label: 'Open People', onPress: () => router.push('/settings/people') }],
      });
      return;
    }
    feedback.actionSheet({
      title: 'Delete your account?',
      message:
        others.length === 0
          ? `You are the only one at ${company}, so the company goes too: its jobs, items, photos and lists. This cannot be undone.`
          : `Your sign in goes, and your name, email and phone come off everything you did. ${company} keeps its jobs and lists. This cannot be undone.`,
      actions: [
        {
          label: 'Delete My Account',
          destructive: true,
          onPress: () => {
            haptic.tap();
            data.deleteAccount().catch((e: unknown) => {
              haptic.warning();
              feedback.toast({ message: e instanceof Error ? e.message : 'That did not go. Check the signal and try again.' });
            });
          },
        },
      ],
    });
  };

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
    <Page title={me.name} eyebrow={`${ROLE_LABELS[me.role]} · ${company}`} subtitle={me.email} crumb={['Home', 'Me']} back={false} tab={{}}>
      <ListSection
        header={company}
        footer={admin ? 'The name on every list, who works here, the companies you work with, what always needs doing in a house, and what the item form asks.' : 'An admin changes these.'}
      >
        {admin ? (
          <ListRow title="Company Name" icon="building" value={org.name} accessory="chevron" onPress={() => setRenaming(org.name)} testID="company-name" />
        ) : null}
        <ListRow title="People" icon="person.2.fill" accessory="chevron" onPress={() => router.push('/settings/people')} testID="people" />
        <ListRow title="Companies" icon="building" accessory="chevron" onPress={() => router.push('/settings/companies')} testID="companies" />
        <ListRow title="Templates" icon="templates" accessory="chevron" onPress={() => router.push('/settings/templates')} testID="templates" />
        <ListRow title="Item Form" icon="list.bullet" accessory="chevron" onPress={() => router.push('/settings/item-form')} testID="item-form" />
      </ListSection>
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
      {data.mode === 'preview' && data.previewAs ? (
        <ListSection header="See the Preview As" footer="The preview can be seen as anyone, to check what each person sees and can change.">
          {people
            .filter((p) => p.active)
            .map((p) => (
              <ListRow
                key={p.id}
                title={p.name}
                subtitle={ROLE_LABELS[p.role]}
                accessory={p.id === me.id ? 'checkmark' : 'none'}
                onPress={() => data.previewAs?.(p.id)}
                testID={`preview-as-${p.id}`}
              />
            ))}
        </ListSection>
      ) : null}
      <ListSection>
        <ListRow title="Sign Out" tone="destructive" onPress={signOut} testID="sign-out" />
      </ListSection>
      <ListSection footer="Takes your sign in away for good. Your company keeps what you did, under Deleted Account.">
        <ListRow title="Delete My Account" tone="destructive" onPress={deleteAccount} testID="delete-account" />
      </ListSection>
      <Text variant="footnote" color={colors.secondary} align="center" style={styles.version}>
        {`${APP_NAME}${version ? `, version ${version}` : ''}`}
      </Text>

      <Sheet
        visible={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Company Name"
        left={{ label: 'Cancel', onPress: () => setRenaming(null), testID: 'company-name-cancel' }}
        right={{ label: 'Save', variant: 'prominent', onPress: () => void rename(), disabled: (renaming ?? '').trim() === '', testID: 'company-name-save' }}
        testID="company-name-sheet"
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheet}>
          <ListSection footer="It goes at the top of every list you send, and on the emails.">
            <ListTextField
              placeholder="Company Name"
              value={renaming ?? ''}
              onChangeText={setRenaming}
              autoCapitalize="words"
              autoFocus
              maxLength={COMPANY_NAME_MAX}
              returnKeyType="done"
              onSubmitEditing={() => void rename()}
              accessibilityLabel="Company name"
              testID="company-name-field"
            />
          </ListSection>
        </ScrollView>
      </Sheet>
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
  sheet: { paddingTop: 4, paddingBottom: 48 },
});
