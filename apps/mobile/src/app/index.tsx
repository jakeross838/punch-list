// Jobs: the first screen, Site Office style. Mine, All and Closed at the top when there is more than
// one to pick, My Items when anything is assigned to you, then the jobs, each with how much is open,
// how much is ready and how much waits. The search at the top finds jobs, and under them everything
// else on every job: items, locations, companies, people and comments. Admins make jobs with the plus in the bar, and swipe a job to
// close or delete it, or hold it down to change its name and address too. People, Companies,
// Templates, Item Form and your account are under Me, the square button in the bar.

import { assignedTo, canSetUpJobs, featureOn, planState, SAMPLE_JOB, TRIAL_ENDED, type Job } from '@punch/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useJobActions } from '@/components/JobActions';
import { GetStarted } from '@/components/GetStarted';
import { NotifyKeeper } from '@/components/Notify';
import { useUpdateLines } from '@/components/ActivityRow';
import { SearchResults } from '@/components/SearchResults';
import { useRecent, useStarred } from '@/data/stars';
import { newLines, updatesSeen } from '@/data/updatesSeen';
import { useSampleJob } from '@/components/useSampleJob';
import { Banner, Button, ChipRow, EmptyState, IconTile, LedgerRow, MetaLine, Page, Panel, SectionLabel, Stamp, SwipeRow, Text, type BarItem, type SwipeAction } from '@/ui';

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
  const hasMine = open.some((j) => mineIds.has(j.id));
  // Mine first when you are on a job; an admin on none sees them all.
  const [picked, setShow] = useState<Show>(hasMine ? 'mine' : 'all');
  // Closed with none left (the last one opened again or deleted), or Mine with none: back to the rest.
  const show: Show = picked === 'closed' && closed.length === 0 ? (hasMine ? 'mine' : 'all') : picked === 'mine' && !hasMine ? 'all' : picked;
  const shown = show === 'closed' ? closed : show === 'mine' ? open.filter((j) => mineIds.has(j.id)) : open;
  const q = query.trim().toLowerCase();
  const found = q ? shown.filter((j) => `${j.name} ${j.address}`.toLowerCase().includes(q)) : shown;
  const choices: (readonly [Show, string])[] = [...(hasMine ? [['mine', 'Mine'] as const] : []), ['all', 'All'], ...(closed.length > 0 ? [['closed', 'Closed'] as const] : [])];
  // Add the Sample Job, until there is one to try things on.
  const hasSample = jobs.some((j) => j.address === SAMPLE_JOB.address);

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
      {q ? null : <GetStarted />}
      {choices.length > 1 ? (
        <ChipRow chips={choices.map(([key, label]) => ({ key, label, on: show === key, onPress: () => setShow(key), testID: `show-${key}` }))} style={styles.show} />
      ) : null}
      {me && show !== 'closed' && !q && open.length > 0 ? <DayRows personId={me.id} /> : null}
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
      {admin && open.length > 0 && show !== 'closed' && !hasSample && !q ? (
        <View style={styles.sample}>
          <Button label={sample.adding ? 'Adding the Sample Job' : 'Add the Sample Job'} variant="plain" onPress={sample.ask} disabled={sample.adding} testID="add-sample-job" />
        </View>
      ) : null}
      {data.mode === 'preview' ? (
        <Text variant="footnote" color={colors.secondary} align="center" style={styles.preview}>
          Preview with sample data. Changes reset when you reload the page.
        </Text>
      ) : null}
    </Page>
  );
}

/** Today, Updates (with what is new since you last looked) and My Items, one tap away. */
function DayRows({ personId }: { personId: string }) {
  const data = useData();
  const mine = assignedTo(data.useAssigned(personId), personId);
  const lines = useUpdateLines();
  const seenAt = updatesSeen.useValue();
  const kept = useStarred().length + useRecent().length;
  const fresh = newLines(lines, seenAt, personId).length;
  const ready = mine.filter((i) => i.ready).length;
  const jobs = new Set(mine.map((i) => i.jobId)).size;
  return (
    <Panel style={styles.mine}>
      <LedgerRow lead={<IconTile name="calendar" />} onPress={() => router.push('/today')} chevron testID="today">
        <Text weight="500">Today</Text>
        <MetaLine facts={[featureOn('visits') ? 'To check, yours and who is on site, in walking order' : 'To check and yours, in walking order']} />
      </LedgerRow>
      <LedgerRow
        last={mine.length === 0 && kept === 0}
        lead={<IconTile name="bell" />}
        onPress={() => router.push('/updates')}
        chevron
        accessibilityLabel={fresh > 0 ? `Updates, ${fresh} new` : 'Updates'}
        testID="updates"
      >
        <Text weight="500">Updates</Text>
        <MetaLine facts={[fresh > 0 ? { text: `${fresh} new`, color: colors.label } : 'Nothing new since you last looked']} />
      </LedgerRow>
      {mine.length > 0 ? (
        <LedgerRow
          last={kept === 0}
          lead={<IconTile name="person" />}
          onPress={() => router.push('/my')}
          chevron
          accessibilityLabel={`My Items, ${mine.length} open, ${ready} ready`}
          testID="my-items"
        >
          <Text weight="500">My Items</Text>
          <MetaLine
            facts={[
              `${mine.length} open`,
              ready > 0 ? { text: `${ready} ready`, color: colors.ok } : null,
              jobs > 1 ? `${jobs} jobs` : null,
            ]}
          />
        </LedgerRow>
      ) : null}
      {kept > 0 ? (
        <LedgerRow last lead={<IconTile name="star" />} onPress={() => router.push('/recent')} chevron testID="starred-recent">
          <Text weight="500">Starred and Recent</Text>
          <MetaLine facts={['What you starred and opened lately']} />
        </LedgerRow>
      ) : null}
    </Panel>
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
  mine: { marginBottom: 4 },
  jobs: { marginBottom: 8 },
  jobRow: { paddingVertical: 13 },
  jobName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobTitle: { flex: 1, fontSize: 16, lineHeight: 21 },
  jobBody: { paddingLeft: 15, gap: 3 },
  jobMeta: { marginTop: 3 },
  emptyAction: { marginTop: 14, gap: 10, alignSelf: 'stretch' },
  none: { marginHorizontal: layout.inset, marginTop: 24 },
  sample: { marginHorizontal: layout.margin, marginTop: 8 },
  preview: { marginTop: 28, marginHorizontal: 32 },
});
