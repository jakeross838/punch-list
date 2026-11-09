// Today, across every job you are on: what the companies answered since yesterday, then for each job
// what waits for your team to check, what is yours, who is on site and with what, and how much is
// ready. Under each job, the day's walk: that work in walking order, location by location, each item
// a tap away to check off or open.

import { canSetUpJobs, todayPlan, type Item, type Photo } from '@punch/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityRow, useUpdateLines } from '@/components/ActivityRow';
import { ItemRow } from '@/components/ItemRow';
import { useItemActions } from '@/components/useItemActions';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useClaudeReady } from '@/ai/claude';
import { EmptyState, Icon, LedgerRow, MetaLine, Page, Panel, SectionLabel, Text, timeOf, weekdayDate, todayIso } from '@/ui';

const DAY_MS = 86_400_000;

export default function TodayScreen() {
  const data = useData();
  const me = data.useMe();
  const jobs = data.useJobs();
  const teams = data.useTeams();
  const items = data.useAllItems();
  const locations = data.useAllLocations();
  const visits = data.useAllVisits();
  const companies = data.useCompanies();
  const lines = useUpdateLines();
  const now = useMemo(() => new Date(), []);
  // The jobs you are on; an admin or a project manager on none sees every job.
  const mineIds = useMemo(() => new Set(teams.filter((t) => t.personId === me?.id).map((t) => t.jobId)), [teams, me?.id]);
  const jobIds = mineIds.size > 0 || !canSetUpJobs(me) ? mineIds : undefined;
  const plan = useMemo(
    () => todayPlan({ meId: me?.id ?? null, jobs, items, locations, visits, companies, jobIds, now }),
    [me?.id, jobs, items, locations, visits, companies, jobIds, now],
  );
  const shownJobs = new Set(plan.map((p) => p.job.id));
  const jobName = new Map(jobs.map((j) => [j.id, j.name]));
  // What the companies answered on their pages since this time yesterday.
  const answers = lines.filter((l) => l.line.fromCompany && now.getTime() - Date.parse(l.line.at) <= DAY_MS && (!jobIds || jobIds.has(l.jobId)));

  return (
    <Page title="Today" subtitle={weekdayDate(todayIso())} backLabel="Jobs" tab={{ active: 'jobs' }}>
      {answers.length > 0 ? (
        <>
          <SectionLabel label={`From the Companies ${answers.length}`} right={answers.length > 4 ? 'See All' : undefined} onPress={answers.length > 4 ? () => router.push('/updates') : undefined} />
          <Panel style={styles.panel} testID="today-answers">
            {answers.slice(0, 4).map(({ jobId, line }, k) => (
              <ActivityRow
                key={`${jobId}-${line.key}`}
                line={{ ...line, detail: [line.detail, shownJobs.size > 1 || mineIds.size > 1 ? jobName.get(jobId) : null].filter(Boolean).join(' ') }}
                time={timeOf(line.at)}
                last={k === Math.min(answers.length, 4) - 1}
                onPress={line.itemId ? () => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: line.itemId! } }) : undefined}
              />
            ))}
          </Panel>
        </>
      ) : null}
      {plan.length === 0 ? (
        <EmptyState icon="checkmark.circle.fill" title="Nothing for Today" message="Work to check, your own items and the companies on site show here." />
      ) : (
        plan.map((p) => <TodayJobSection key={p.job.id} plan={p} />)
      )}
    </Page>
  );
}

function TodayJobSection({ plan }: { plan: ReturnType<typeof todayPlan>[number] }) {
  const data = useData();
  const claude = useClaudeReady();
  const jobId = plan.job.id;
  const photos = data.usePhotos(jobId);
  const actions = useItemActions(jobId);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const ph of photos) if (!map.has(ph.itemId)) map.set(ph.itemId, ph);
    return map;
  }, [photos]);
  const company = new Map(plan.onSite.map((c) => [c.companyId, c.name]));
  const why = (i: Item) => (i.markedDoneAt ? undefined : i.assignedTo && plan.mine.some((m) => m.id === i.id) ? 'Yours' : i.companyId && company.has(i.companyId) ? `${company.get(i.companyId)}, on site today` : undefined);
  const open = (i: Item) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: i.id } });

  return (
    <View testID={`today-${jobId}`}>
      <SectionLabel label={plan.job.name} right="Open the Job" onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId } })} />
      <MetaLine
        style={styles.meta}
        facts={[
          plan.toCheck.length > 0 ? { text: `${plan.toCheck.length} to check`, color: colors.label } : null,
          plan.mine.length > 0 ? `${plan.mine.length} yours` : null,
          plan.onSite.length > 0 ? `On site: ${plan.onSite.map((c) => c.name).join(', ')}` : null,
          { text: `${plan.ready} ready`, color: colors.ok },
        ]}
      />
      {plan.walk.map((stop, s) => (
        <View key={stop.location?.id ?? 'none'} testID={`today-stop-${s}`}>
          <Text variant="label" color={colors.secondary} style={styles.stop}>
            {stop.location ? stop.location.label : 'No Location Yet'}
          </Text>
          <Panel style={styles.panel}>
            {stop.items.map((i, k) => (
              <ItemRow
                key={i.id}
                item={i}
                photo={firstPhoto.get(i.id)}
                note={why(i)}
                first={k === 0}
                last={k === stop.items.length - 1}
                checking={actions.checking.has(i.id)}
                onOpen={open}
                onCheck={actions.onCheck}
                onReady={actions.onReady}
                onRemove={actions.onRemove}
              />
            ))}
          </Panel>
        </View>
      ))}
      {claude ? (
        <Panel style={styles.panel}>
          <LedgerRow
            last
            lead={<Icon name="sparkles" size={18} color={colors.tint} />}
            onPress={() => router.push({ pathname: '/jobs/[jobId]/day-note', params: { jobId } })}
            chevron
            testID={`day-note-${jobId}`}
          >
            <Text weight="500">End of Day Note</Text>
            <Text variant="footnote" color={colors.secondary}>
              Claude writes what got done and found today, for the daily log.
            </Text>
          </LedgerRow>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 6 },
  meta: { marginHorizontal: layout.inset, marginBottom: 4 },
  stop: { marginHorizontal: layout.inset, marginTop: 10, marginBottom: 2 },
});
