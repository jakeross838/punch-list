// Me: at the top, what is yours on every job: Today, Updates (with what is new since you last
// looked), My Items, and Starred and Recent. They are here, and not on Jobs, so the app opens on the
// jobs and nothing else. Then Get Started for a company's admin, until its steps are done or it is
// put away, and who you are signed in as, what you do at your company and what you see, your
// notifications, the jobs you are on and as what, and the company's setup: its name, People,
// Companies, Templates and Item Form. An admin changes who you are in People, and the company's name here. On the
// iPhone, This Phone says whether every change made here has gone up, and anything the server
// turned down. Sign Out clears what is on this phone; it all comes back when you sign in again. It
// waits until every change has gone up. Delete My Account takes your sign in away for good, and the
// last one at a company takes the whole company with them.

import { assignedTo, canSetUpJobs, COMPANY_NAME_MAX, companyNameProblem, exportEntries, featureOn, isAdmin, PART_LABELS, planState, planText, ROLE_HINTS, ROLE_LABELS, SAMPLE_JOB, SEES_LABELS, seesEveryJob } from '@punch/core';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { colors, layout } from '@/constants/theme';
import { useUpdateLines } from '@/components/ActivityRow';
import { GetStarted } from '@/components/GetStarted';
import { NotifySection } from '@/components/Notify';
import { pickLogo } from '@/components/pickLogo';
import { useSampleJob } from '@/components/useSampleJob';
import { exportZip } from '@/export/everything';
import { useData } from '@/data/api';
import { sitePageUrl } from '@/data/links';
import { newLines, updatesSeen } from '@/data/updatesSeen';
import { dayOf, SheetScroll, haptic, ListRow, ListSection, ListSwitchRow, ListTextField, Page, Sheet, Text, todayIso, useFeedback } from '@/ui';
import { useClaudeAllowance } from '@/ai/claude';

/** Cents as dollars and cents, like $1.84. */
const dollars = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2)}`;

export default function AccountScreen() {
  const data = useData();
  const feedback = useFeedback();
  /** The Privacy Policy or the Terms of Use, on the web. */
  const openSite = (page: 'privacy' | 'terms') =>
    void WebBrowser.openBrowserAsync(sitePageUrl(page)).catch(() => feedback.toast({ message: 'The page did not open. Check the signal and try again.' }));
  const me = data.useMe();
  const jobs = data.useJobs();
  const team = data.useTeams().filter((t) => t.personId === me?.id);
  const sync = data.useSync();
  const people = data.usePeople();
  const org = data.useOrg();
  const [renaming, setRenaming] = useState<string | null>(null);
  // Export Everything: every job's items, comments and photos, read when it runs.
  const allItems = data.useAllItems();
  const allLocations = data.useAllLocations();
  const companies = data.useCompanies();
  const allComments = data.useAllComments();
  const allPhotos = data.useAllPhotos();
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const allowance = useClaudeAllowance();
  const sample = useSampleJob();
  // Signing out: the screen goes as the sign in comes up.
  if (!me) return <Page title="Me" tab={{}} />;
  const admin = isAdmin(me);
  const plan = planState(org);
  // Add the Sample Job, for whoever sets up jobs, until there is one to try things on.
  const offersSample = canSetUpJobs(me) && plan.kind !== 'ended' && !jobs.some((j) => j.address === SAMPLE_JOB.address);
  const version = Constants.expoConfig?.version;
  const company = org.name || 'Your Company';
  const others = people.filter((p) => p.active && p.id !== me.id);

  const stopRenaming = () => setRenaming(null);

  async function exportAll() {
    if (exporting) return;
    const { folder, entries } = exportEntries({ company, day: todayIso(), jobs, items: allItems, locations: allLocations, companies, people, comments: allComments, photos: allPhotos });
    setExporting({ done: 0, total: entries.length });
    try {
      const done = await exportZip(`${folder}.zip`, entries, (d, total) => setExporting({ done: d, total }));
      haptic.success();
      if (done.missed > 0) {
        feedback.toast({ message: `${done.missed === 1 ? 'A photo was' : `${done.missed} photos were`} not on this phone yet, so ${done.missed === 1 ? 'it was' : 'they were'} left out. With a signal, open the app a while, then export again.` });
      }
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? `The export did not finish: ${e.message}` : 'The export did not finish. Try again.' });
    } finally {
      setExporting(null);
    }
  }
  const exportEverything = () =>
    feedback.actionSheet({
      title: 'Export everything?',
      message: `Every job, item, comment and photo at ${company} goes into one file to keep. With many photos it takes a few minutes; keep the app open.`,
      actions: [{ label: 'Export Everything', onPress: () => void exportAll() }],
    });

  const chooseLogo = async () => {
    try {
      const logo = await pickLogo();
      if (!logo) return;
      await data.setLogo(logo);
      haptic.success();
      feedback.toast({ message: 'The logo goes on your printed lists and your pages' });
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That picture did not work. Try another one.' });
    }
  };
  const logo = () =>
    org.logo
      ? feedback.actionSheet({
          title: 'Your Logo',
          message: featureOn('ownerPage') ? 'It goes on your printed lists, and on the pages your companies and owners open.' : 'It goes on your printed lists, and on the pages your companies open.',
          actions: [
            { label: 'Choose Another Picture', onPress: () => void chooseLogo() },
            {
              label: 'Take Away the Logo',
              destructive: true,
              onPress: () => {
                void data.setLogo(null).then(
                  () => haptic.tap(),
                  (e: unknown) => feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' }),
                );
              },
            },
          ],
        })
      : void chooseLogo();

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
    <Page title={me.name} eyebrow={`${ROLE_LABELS[me.role]} · ${company}`} back={false} tab={{}}>
      <YourRows personId={me.id} />
      <GetStarted />
      <ListSection
        header={company}
        footer={admin ? undefined : 'An admin changes these.'}
      >
        {admin ? (
          <ListRow title="Company Name" icon="building" value={org.name} accessory="chevron" onPress={() => setRenaming(org.name)} testID="company-name" />
        ) : null}
        {admin ? (
          <ListRow
            title="Logo"
            icon="photo.on.rectangle"
            value={org.logo ? undefined : 'None'}
            right={org.logo ? <Image source={{ uri: org.logo }} style={styles.logo} contentFit="contain" accessibilityLabel="Your logo" testID="logo-picture" /> : undefined}
            accessory="chevron"
            onPress={logo}
            testID="logo"
          />
        ) : null}
        <ListRow title="People" icon="person.2.fill" accessory="chevron" onPress={() => router.push('/settings/people')} testID="people" />
        <ListRow title="Companies" icon="building" accessory="chevron" onPress={() => router.push('/settings/companies')} testID="companies" />
        <ListRow title="Templates" icon="templates" accessory="chevron" onPress={() => router.push('/settings/templates')} testID="templates" />
        <ListRow title="Item Form" icon="list.bullet" accessory="chevron" onPress={() => router.push('/settings/item-form')} testID="item-form" />
        {admin ? (
          <ListRow
            title="Export Everything"
            icon="archive"
            value={exporting ? `${exporting.done} of ${exporting.total}` : undefined}
            accessory={exporting ? 'none' : 'chevron'}
            disabled={!!exporting}
            onPress={exportEverything}
            testID="export-everything"
          />
        ) : null}
        {offersSample ? (
          <ListRow
            title={sample.adding ? 'Adding the Sample Job' : 'Add the Sample Job'}
            icon="house.fill"
            accessory={sample.adding ? 'none' : 'chevron'}
            disabled={sample.adding}
            onPress={sample.ask}
            testID="add-sample-job"
          />
        ) : null}
      </ListSection>
      {admin && (plan.kind === 'trial' || plan.kind === 'ended') ? (
        <ListSection
          header="Plan"
          footer={
            plan.kind === 'ended'
              ? 'Everything is still here to look at, comment on and download. Nothing else changes until a plan starts.'
              : `The free trial ends on ${dayOf(plan.ends)}. Then your company needs a plan to keep adding and sending.`
          }
        >
          <ListRow title={planText(plan)} icon="calendar" testID="plan" />
        </ListSection>
      ) : null}
      {admin && allowance ? (
        <ListSection header="Claude" footer="Claude's cost for your company this month. It starts over on the first.">
          <ListRow title="This Month" value={`${dollars(allowance.usedCents)} of ${dollars(allowance.limitCents)}`} testID="claude-allowance" />
        </ListSection>
      ) : null}
      <ListSection header="You" footer={admin ? 'Change any of it in People.' : 'An admin changes these in People.'}>
        <ListRow title="Email" value={me.email} testID="account-email" />
        <ListRow title="Phone" value={me.phone ?? 'None'} />
        <ListRow title="Role" subtitle={ROLE_HINTS[me.role]} value={ROLE_LABELS[me.role]} testID="account-role" />
        <ListRow title="Sees" value={seesEveryJob(me) ? SEES_LABELS.all : SEES_LABELS[me.sees]} />
        {admin ? (
          <ListRow title="Edit in People" tone="tint" onPress={() => router.push({ pathname: '/settings/people/[personId]', params: { personId: me.id } })} testID="account-edit" />
        ) : null}
      </ListSection>
      <NotifySection />
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
      {data.mode === 'preview' && data.previewTrialOver ? (
        <ListSection header="Preview the Plan" footer="The free trial over, to check what a company sees then.">
          <ListSwitchRow title="Free Trial Over" value={plan.kind === 'ended'} onValueChange={(over) => data.previewTrialOver?.(over)} testID="preview-trial-over" />
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
        <ListRow title="Help" icon="info.circle" accessory="chevron" onPress={() => router.push('/settings/help')} testID="help" />
        <ListRow title="Privacy Policy" accessory="chevron" onPress={() => openSite('privacy')} testID="privacy-policy" />
        <ListRow title="Terms of Use" accessory="chevron" onPress={() => openSite('terms')} testID="terms-of-use" />
      </ListSection>
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
        onClose={stopRenaming}
        title="Company Name"
        left={{ label: 'Cancel', onPress: stopRenaming, testID: 'company-name-cancel' }}
        right={{ label: 'Save', variant: 'prominent', onPress: () => void rename(), disabled: (renaming ?? '').trim() === '', testID: 'company-name-save' }}
        testID="company-name-sheet"
        dirty={renaming !== null && renaming !== org.name}
        what="the company name"
      >
        <SheetScroll contentContainerStyle={styles.sheet}>
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
        </SheetScroll>
      </Sheet>
    </Page>
  );
}

/** What is yours on every job, one tap from Me: Today, Updates with what is new since you last looked, My Items, and Starred and Recent. */
function YourRows({ personId }: { personId: string }) {
  const data = useData();
  const mine = assignedTo(data.useAssigned(personId), personId);
  const lines = useUpdateLines();
  const seenAt = updatesSeen.useValue();
  const fresh = newLines(lines, seenAt, personId).length;
  const ready = mine.filter((i) => i.ready).length;
  return (
    <ListSection testID="your-rows">
      <ListRow title="Today" icon="calendar" accessory="chevron" onPress={() => router.push('/today')} testID="today" />
      <ListRow
        title="Updates"
        icon="bell"
        value={fresh > 0 ? `${fresh} new` : undefined}
        accessory="chevron"
        onPress={() => router.push({ pathname: '/updates', params: { from: 'me' } })}
        accessibilityLabel={fresh > 0 ? `Updates, ${fresh} new` : 'Updates'}
        testID="updates"
      />
      <ListRow
        title="My Items"
        icon="person"
        value={mine.length > 0 ? `${mine.length} open` : 'None'}
        accessory="chevron"
        onPress={() => router.push('/my')}
        accessibilityLabel={mine.length > 0 ? `My Items, ${mine.length} open, ${ready} ready` : 'My Items, none'}
        testID="my-items"
      />
      <ListRow title="Starred and Recent" icon="star" accessory="chevron" onPress={() => router.push('/recent')} testID="starred-recent" />
    </ListSection>
  );
}

/** When the server turned a change down, the way a person says it. */
function formatWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  logo: { width: 96, height: 32 },
  version: { marginHorizontal: layout.inset, marginTop: -8, marginBottom: 32 },
  sheet: { paddingTop: 4, paddingBottom: 48 },
});
