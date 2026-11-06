// Jobs: the first screen. My Items at the top when anything is assigned to you, then the jobs:
// yours, all of them, or the closed ones, each with how much is open, how much is ready and how much
// waits. A job with no locations yet says Set Up. Admins make jobs with the plus in the bar. People,
// Companies, Templates, Item Form and your account are under Me, the round button in the bar.

import { assignedTo, isAdmin, type Job } from '@punch/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Button, ChipRow, EmptyState, IconTile, LedgerRow, MetaLine, Page, Panel, SectionLabel, Stamp, Text, type BarItem } from '@/ui';

const newJob = () => router.push('/jobs/new');

type Show = 'mine' | 'all' | 'closed';

export default function JobsScreen() {
  const data = useData();
  const jobs = data.useJobs();
  const me = data.useMe();
  const team = data.useTeams();
  const admin = isAdmin(me);
  const [query, setQuery] = useState('');
  const mineIds = useMemo(() => new Set(team.filter((t) => t.personId === me?.id).map((t) => t.jobId)), [team, me?.id]);
  const open = jobs.filter((j) => !j.closed);
  const closed = jobs.filter((j) => j.closed);
  const hasMine = open.some((j) => mineIds.has(j.id));
  // Mine first when you are on a job; an admin on none sees them all.
  const [show, setShow] = useState<Show>(hasMine ? 'mine' : 'all');
  const shown = show === 'closed' ? closed : show === 'mine' ? open.filter((j) => mineIds.has(j.id)) : open;
  const q = query.trim().toLowerCase();
  const found = q ? shown.filter((j) => `${j.name} ${j.address}`.toLowerCase().includes(q)) : shown;

  const right: BarItem[] = admin ? [{ kind: 'button', label: 'New Job', icon: 'plus', iconOnly: true, onPress: newJob, testID: 'new-job' }] : [];
  const eyebrow = [`${open.length} active`, closed.length > 0 ? `${closed.length} closed` : null].filter(Boolean).join(' · ');

  return (
    <Page
      title="Jobs"
      eyebrow={eyebrow}
      crumb={['Home', 'Jobs']}
      back={false}
      right={right}
      account
      search={{ value: query, onChange: setQuery, placeholder: 'Search jobs' }}
      tab={{ active: 'jobs' }}
    >
      <ChipRow
        chips={[
          ...(hasMine ? [{ key: 'mine', label: 'Mine', on: show === 'mine', onPress: () => setShow('mine'), testID: 'show-mine' }] : []),
          { key: 'all', label: 'All', on: show === 'all', onPress: () => setShow('all'), testID: 'show-all' },
          ...(closed.length > 0 ? [{ key: 'closed', label: 'Closed', on: show === 'closed', onPress: () => setShow('closed'), testID: 'show-closed' }] : []),
        ]}
      />
      {me && show !== 'closed' ? <MyItemsRow personId={me.id} /> : null}
      {open.length === 0 && show !== 'closed' ? (
        <EmptyState icon="house.fill" title="No Jobs Yet" message={admin ? 'Set up the first job to start its list.' : 'Jobs show here once you are on one.'}>
          {admin ? (
            <View style={styles.emptyAction}>
              <Button label="Set Up a New Job" icon="plus" onPress={newJob} testID="empty-new-job" />
            </View>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <SectionLabel
            label={q ? `${found.length} ${found.length === 1 ? 'result' : 'results'}` : show === 'closed' ? 'Closed jobs' : show === 'mine' ? 'Your jobs' : 'Every job'}
            right={q ? undefined : `${found.length}`}
          />
          {found.length === 0 ? (
            <Text variant="subheadline" color={colors.secondary} style={styles.none}>
              {q ? `No job matches “${query.trim()}”.` : 'No jobs here.'}
            </Text>
          ) : (
            <Panel>
              <JobRows jobs={found} />
            </Panel>
          )}
        </>
      )}
      {admin && open.length > 0 && show !== 'closed' ? (
        <View style={styles.newJob}>
          <Button label="Set Up a New Job" icon="plus" variant="tinted" onPress={newJob} testID="set-up-job" />
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

/** What is assigned to you on every job, one tap away. Shows once something is. */
function MyItemsRow({ personId }: { personId: string }) {
  const mine = assignedTo(useData().useAssigned(personId), personId);
  if (mine.length === 0) return null;
  const ready = mine.filter((i) => i.ready).length;
  const jobs = new Set(mine.map((i) => i.jobId)).size;
  return (
    <>
      <SectionLabel label="Assigned to you" right={`${mine.length} open`} />
      <Panel>
        <LedgerRow
          last
          lead={<IconTile name="person" />}
          onPress={() => router.push('/my')}
          accessibilityLabel={`My Items, ${mine.length} open, ${ready} ready`}
          testID="my-items"
        >
          <Text weight="500">My Items</Text>
          <MetaLine
            facts={[
              { text: `${mine.length} open`, color: colors.label },
              ready > 0 ? { text: `${ready} ready`, color: colors.ok } : null,
              jobs > 1 ? `Across ${jobs} jobs` : null,
            ]}
          />
        </LedgerRow>
      </Panel>
    </>
  );
}

function JobRows({ jobs }: { jobs: Job[] }) {
  return (
    <>
      {jobs.map((job, i) => (
        <JobRow key={job.id} job={job} last={i === jobs.length - 1} stripe={i % 2 === 1} />
      ))}
    </>
  );
}

function JobRow({ job, last, stripe }: { job: Job; last: boolean; stripe: boolean }) {
  const data = useData();
  const items = data.useItems(job.id);
  const locations = data.useLocations(job.id);
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const ready = open.filter((i) => i.ready).length;
  const waiting = open.length - ready;
  const setUp = locations.some((l) => l.active);
  const said = [job.name, job.address, setUp ? `${open.length} open, ${ready} ready${waiting ? `, ${waiting} waiting` : ''}` : 'not set up yet'].filter(Boolean).join(', ');
  return (
    <LedgerRow
      last={last}
      stripe={stripe}
      onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
      accessibilityLabel={said}
      testID={`job-${job.id}`}
      style={styles.jobRow}
    >
      <View style={styles.jobName}>
        <Stamp color={job.closed ? colors.quiet : setUp ? colors.okFill : colors.quiet} size={7} />
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
              ? ['Closed', `${items.filter((i) => i.status === 'complete').length} complete`]
              : setUp
                ? [
                    { text: `${open.length} open`, color: colors.label },
                    { text: `${ready} ready`, color: colors.ok },
                    waiting > 0 ? { text: `${waiting} waiting`, color: colors.secondary } : null,
                  ]
                : [{ text: 'Set up', color: colors.tint }]
          }
        />
      </View>
    </LedgerRow>
  );
}

const styles = StyleSheet.create({
  emptyAction: { marginTop: 14, alignSelf: 'stretch' },
  none: { marginHorizontal: layout.inset, marginTop: 12 },
  newJob: { marginHorizontal: layout.margin, marginTop: 16 },
  preview: { marginTop: 28, marginHorizontal: 32 },
  jobRow: { paddingVertical: 13 },
  jobName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobTitle: { flex: 1, fontSize: 16, lineHeight: 21 },
  jobBody: { paddingLeft: 15, gap: 3 },
  jobMeta: { marginTop: 3 },
});
