// Jobs: the first screen, Site Office style, and nothing on it but the jobs: each one with how much
// is open, how much is ready and how much waits. Mine, All and Closed show at the top only when they
// would show different jobs. The search at the top finds jobs, and under them everything else on
// every job: items, locations, companies, people and comments. Admins make jobs with the plus in the
// bar, and swipe a job to close or delete it, or hold it down to change its name and address too.
// Today, Updates, My Items, and Starred and Recent are under Me, the square button in the bar, with
// People, Companies, Templates, Item Form and your account.

import { canSetUpJobs, planState, TRIAL_ENDED, type Job } from '@punch/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useJobActions } from '@/components/JobActions';
import { NotifyKeeper } from '@/components/Notify';
import { SearchResults } from '@/components/SearchResults';
import { useSampleJob } from '@/components/useSampleJob';
import { Banner, Button, ChipRow, EmptyState, LedgerRow, MetaLine, Page, Panel, SectionLabel, Stamp, SwipeRow, Text, type BarItem, type SwipeAction } from '@/ui';

const newJob = () => router.push('/jobs/new');

type Show = 'mine' | 'all' | 'closed';

export default function JobsScreen() {
  const data = useData();
  const jobs = data.useJobs();
  const me = data.useMe();
  const team = data.useTeams();
  // Once a free trial is over: everything to look at, and nothing new until a plan starts.
  const ended = planState(data.useOrg()).kind === 'ended';
  // Making jobs: an admin or a project manager.
  const admin = canSetUpJobs(me) && !ended;
  const sample = useSampleJob();
  const [query, setQuery] = useState('');
  const mineIds = useMemo(() => new Set(team.filter((t) => t.personId === me?.id).map((t) => t.jobId)), [team, me?.id]);
  const open = jobs.filter((j) => !j.closed);
  const closed = jobs.filter((j) => j.closed);
  const mine = open.filter((j) => mineIds.has(j.id));
  // Mine is a choice only when it is some of the open jobs and not all of them: two chips that show
  // the same jobs are one too many.
  const hasMine = mine.length > 0 && mine.length < open.length;
  // Mine first when you are on some of the jobs; on all of them or none, they all show.
  const [picked, setShow] = useState<Show>(hasMine ? 'mine' : 'all');
  // Closed with none left (the last one opened again or deleted), or Mine no longer a choice: back to the rest.
  const show: Show = picked === 'closed' && closed.length === 0 ? (hasMine ? 'mine' : 'all') : picked === 'mine' && !hasMine ? 'all' : picked;
  const shown = show === 'closed' ? closed : show === 'mine' ? mine : open;
  const q = query.trim().toLowerCase();
  const found = q ? shown.filter((j) => `${j.name} ${j.address}`.toLowerCase().includes(q)) : shown;
  const choices: (readonly [Show, string])[] = [...(hasMine ? [['mine', 'Mine'] as const] : []), ['all', 'All'], ...(closed.length > 0 ? [['closed', 'Closed'] as const] : [])];

  const right: BarItem[] = admin ? [{ kind: 'button', label: 'New Job', icon: 'plus', iconOnly: true, onPress: newJob, testID: 'new-job' }] : [];

  return (
    <Page
      title="Jobs"
      back={false}
      right={right}
      account
      search={{ value: query, onChange: setQuery, placeholder: 'Search everything' }}
      tab={{ active: 'jobs' }}
    >
      {/* Jobs is always open under the rest: the phone kept on notifications, and a notification tapped opens its item. */}
      <NotifyKeeper />
      {ended && !q ? (
        <View style={styles.ended} testID="trial-ended">
          <Banner tone="warning">{TRIAL_ENDED}</Banner>
        </View>
      ) : null}
      {choices.length > 1 ? (
        <ChipRow chips={choices.map(([key, label]) => ({ key, label, on: show === key, onPress: () => setShow(key), testID: `show-${key}` }))} style={styles.show} />
      ) : null}
      {open.length === 0 && show !== 'closed' ? (
        <EmptyState icon="house.fill" title="No Jobs Yet" message={admin ? 'Set up a job, or try everything on the Sample Job first.' : 'Your jobs show here once you are on one.'}>
          {admin ? (
            <View style={styles.emptyAction}>
              <Button label="Set Up a New Job" icon="plus" onPress={newJob} testID="empty-new-job" />
              <Button label={sample.adding ? 'Adding the Sample Job' : 'Add the Sample Job'} variant="tinted" onPress={sample.ask} disabled={sample.adding} testID="empty-sample-job" />
            </View>
          ) : null}
        </EmptyState>
      ) : found.length === 0 ? (
        q ? null : (
          <Text variant="subheadline" color={colors.secondary} align="center" style={styles.none}>
            No jobs here.
          </Text>
        )
      ) : (
        <>
          <SectionLabel label={q ? `Jobs ${found.length}` : `${found.length} ${found.length === 1 ? 'job' : 'jobs'}`} />
          <Panel style={styles.jobs}>
            <JobRows jobs={found} />
          </Panel>
        </>
      )}
      {q ? <SearchResults query={query} jobsFound={found.length} /> : null}
      {data.mode === 'preview' ? (
        <Text variant="footnote" color={colors.secondary} align="center" style={styles.preview}>
          Preview with sample data. Changes reset when you reload the page.
        </Text>
      ) : null}
    </Page>
  );
}

function JobRows({ jobs }: { jobs: Job[] }) {
  const actions = useJobActions();
  return (
    <>
      {jobs.map((job, i) => (
        <JobRow key={job.id} job={job} last={i === jobs.length - 1} actions={actions} />
      ))}
      {actions.sheet}
    </>
  );
}

function JobRow({ job, last, actions }: { job: Job; last: boolean; actions: ReturnType<typeof useJobActions> }) {
  const data = useData();
  const items = data.useItems(job.id);
  const photos = data.usePhotos(job.id);
  const locations = data.useLocations(job.id);
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const ready = open.filter((i) => i.ready).length;
  const waiting = open.length - ready;
  const started = locations.some((l) => l.active) || items.some((i) => i.status !== 'removed');
  const counts = { items: items.filter((i) => i.status !== 'removed').length, photos: photos.filter((p) => !p.removed).length };
  const said = [job.name, job.address, started ? `${open.length} open, ${ready} ready${waiting ? `, ${waiting} waiting` : ''}` : 'nothing on the list yet'].filter(Boolean).join(', ');
  // Swipe it to close or delete it, or hold it down for those and Edit: an admin or a project manager, and only an admin deletes.
  const swipes: SwipeAction[] = actions.admin
    ? [
        job.closed
          ? { label: 'Open', icon: 'undo', color: colors.okFill, onPress: () => actions.reopen(job), testID: `reopen-${job.id}` }
          : { label: 'Close', icon: 'archive', color: colors.quiet, onPress: () => actions.close(job), testID: `close-${job.id}` },
        ...(actions.deletes ? [{ label: 'Delete', icon: 'trash' as const, color: colors.destructive, onPress: () => actions.remove(job, counts), testID: `delete-${job.id}` }] : []),
      ]
    : [];
  return (
    <SwipeRow actions={swipes}>
      <LedgerRow
        last={last}
        onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
        onLongPress={actions.admin ? () => actions.menu(job, counts) : undefined}
        accessibilityLabel={said}
        testID={`job-${job.id}`}
        style={styles.jobRow}
      >
        <View style={styles.jobName}>
          <Stamp color={!job.closed && started ? colors.okFill : colors.quiet} size={7} />
          <Text weight="500" numberOfLines={1} style={styles.jobTitle}>
            {job.name}
          </Text>
        </View>
        <View style={styles.jobBody}>
          {job.address ? (
            <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
              {job.address}
            </Text>
          ) : null}
          <MetaLine
            style={styles.jobMeta}
            facts={
              job.closed
                ? [`${items.filter((i) => i.status === 'complete').length} complete`]
                : started
                  ? [{ text: `${open.length} open`, color: colors.label }, ready > 0 ? { text: `${ready} ready`, color: colors.ok } : null, waiting > 0 ? `${waiting} waiting` : null]
                  : [{ text: 'Nothing on the list yet', color: colors.tint }]
            }
          />
        </View>
      </LedgerRow>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  show: { marginBottom: 8 },
  ended: { marginBottom: 12 },
  jobs: { marginBottom: 8 },
  jobRow: { paddingVertical: 13 },
  jobName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobTitle: { flex: 1, fontSize: 16, lineHeight: 21 },
  jobBody: { paddingLeft: 15, gap: 3 },
  jobMeta: { marginTop: 3 },
  emptyAction: { marginTop: 14, gap: 10, alignSelf: 'stretch' },
  none: { marginHorizontal: layout.inset, marginTop: 24 },
  preview: { marginTop: 28, marginHorizontal: 32 },
});
