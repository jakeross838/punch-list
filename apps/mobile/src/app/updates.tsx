// Updates: what other people did lately on the jobs you see, newest first, a day at a time. A line
// for each thing: who did what, the job, and what to do about it. The companies' answers come first
// to mind: work they say is done, dates they asked to move, their comments. Chips narrow it to one
// job, or to what needs you. Opening Updates marks it all seen; the new lines keep a stamp until you
// leave.

import { activityLines, activityLookups, type Activity, type ActivityLine } from '@punch/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { markUpdatesSeen, useUpdatesSeenAt } from '@/data/updates';
import { ChipRow, dayHeading, EmptyState, Page, Panel, SectionLabel, Stamp, Text, timeOf, Touchable } from '@/ui';

interface Line extends ActivityLine {
  jobId: string;
  job: string;
  kind: Activity['kind'];
  field?: string;
}

/** What needs someone at Ross Built: work said to be done, dates asked to move, a company's comment. */
function needsYou(line: Line): boolean {
  return line.kind === 'item_marked_done' || line.kind === 'visit_change_asked' || (line.kind === 'comment_added' && line.personId === null);
}

function markOf(line: Line): string {
  if (line.kind === 'item_marked_done') return colors.tint;
  if (line.kind === 'visit_change_asked') return colors.destructive;
  if (line.kind === 'visit_confirmed_by_company' || line.kind === 'item_created') return colors.okFill;
  return colors.quiet;
}

/** The job's own lines, worked out with the job's lookups, handed up to the list. */
function JobLines({ jobId, job, entries, onLines }: { jobId: string; job: string; entries: Activity[]; onLines: (jobId: string, lines: Line[]) => void }) {
  const data = useData();
  const people = data.usePeople();
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const visits = data.useVisits(jobId);
  const customFields = data.useCustomFields();
  const comments = data.useComments(jobId);
  const lines = useMemo(() => {
    const look = activityLookups({ people, items, locations, companies, trades, visits, customFields, comments });
    const byId = new Map(entries.map((e) => [e.id, e]));
    return activityLines(entries, look).map((l): Line => {
      const first = byId.get(l.key) ?? entries.find((e) => l.key.includes(e.id));
      return { ...l, jobId, job, kind: first?.kind ?? 'item_changed', field: first?.field };
    });
  }, [entries, people, items, locations, companies, trades, visits, customFields, comments, jobId, job]);
  useEffect(() => onLines(jobId, lines), [jobId, lines, onLines]);
  return null;
}

export default function UpdatesScreen() {
  const data = useData();
  const me = data.useMe();
  const jobs = data.useJobs();
  const updates = data.useUpdates();
  const seenAt = useUpdatesSeenAt();
  // What was new when the screen opened stays marked while it is open.
  const [seenBefore] = useState(seenAt);
  const [byJob, setByJob] = useState<Map<string, Line[]>>(new Map());
  const [only, setOnly] = useState<string>('all');
  const onLines = useMemo(
    () => (jobId: string, lines: Line[]) =>
      setByJob((now) => {
        if (now.get(jobId) === lines) return now;
        const next = new Map(now);
        next.set(jobId, lines);
        return next;
      }),
    [],
  );
  useEffect(() => {
    markUpdatesSeen();
  }, [updates]);

  const theirs = useMemo(() => updates.filter((u) => u.personId !== me?.id), [updates, me?.id]);
  const entriesByJob = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const u of theirs) map.set(u.jobId, [...(map.get(u.jobId) ?? []), u]);
    return map;
  }, [theirs]);
  const jobsWith = jobs.filter((j) => entriesByJob.has(j.id));
  const all = useMemo(() => [...byJob.values()].flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)), [byJob]);
  const shown = all.filter((l) => (only === 'all' ? true : only === 'needs' ? needsYou(l) : l.jobId === only));
  const days: { day: string; lines: Line[] }[] = [];
  for (const l of shown) {
    const day = dayHeading(l.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.lines.push(l);
    else days.push({ day, lines: [l] });
  }
  const fresh = (l: Line) => !seenBefore || l.at > seenBefore;
  const newCount = all.filter(fresh).length;

  const open = (l: Line) => {
    if (l.itemId) router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId: l.jobId, itemId: l.itemId } });
    else if (l.kind.startsWith('visit')) router.push({ pathname: '/jobs/[jobId]/schedule', params: { jobId: l.jobId } });
    else router.push({ pathname: '/jobs/[jobId]/activity', params: { jobId: l.jobId } });
  };

  return (
    <Page
      title="Updates"
      eyebrow={newCount > 0 ? `${newCount} new since you last looked` : 'All caught up'}
      crumb={['Home', 'Updates']}
      backLabel="Back"
      bell={false}
      account
      tab={{ active: 'jobs' }}
    >
      {jobsWith.map((j) => (
        <JobLines key={j.id} jobId={j.id} job={j.name} entries={entriesByJob.get(j.id) ?? []} onLines={onLines} />
      ))}
      <ChipRow
        chips={[
          { key: 'all', label: 'All Jobs', on: only === 'all', onPress: () => setOnly('all'), testID: 'updates-all' },
          ...jobsWith.map((j) => ({ key: j.id, label: j.name, on: only === j.id, onPress: () => setOnly(j.id), testID: `updates-job-${j.id}` })),
          { key: 'needs', label: 'Needs Me', on: only === 'needs', onPress: () => setOnly('needs'), testID: 'updates-needs' },
        ]}
      />
      {days.length === 0 ? (
        <EmptyState icon="bell" title="Nothing New" message={only === 'needs' ? 'Nothing is waiting on you right now.' : 'When people work on your jobs, it shows here.'} />
      ) : (
        days.map(({ day, lines }) => (
          <View key={day}>
            <SectionLabel label={day} right={`${lines.length}`} />
            <Panel>
              {lines.map((l, i) => (
                <Touchable
                  key={l.key}
                  feedback="highlight"
                  onPress={() => open(l)}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.who} ${l.action}. ${l.detail} ${l.job}, ${timeOf(l.at)}`}
                  testID={`update-${l.key}`}
                  style={[styles.line, i < lines.length - 1 ? styles.rule : null]}
                >
                  <Text variant="stamp" color={colors.secondary} tabular style={styles.time}>
                    {timeOf(l.at)}
                  </Text>
                  <Stamp color={markOf(l)} size={6} style={styles.mark} />
                  <View style={styles.body}>
                    <Text variant="subheadline" color={colors.label}>
                      <Text variant="subheadline" weight="600" color={colors.label}>
                        {l.who}
                      </Text>{' '}
                      {l.action}
                    </Text>
                    <View style={styles.under}>
                      <Text variant="stamp" color={colors.secondary} numberOfLines={1} style={styles.note}>
                        {[l.job, l.detail].filter(Boolean).join(' · ')}
                      </Text>
                      {fresh(l) ? (
                        <Text variant="stamp" weight="600" color={colors.tint}>
                          New
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Touchable>
              ))}
            </Panel>
          </View>
        ))
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.cell },
  rule: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  time: { width: 62, paddingTop: 3, letterSpacing: 0.8 },
  mark: { marginTop: 6 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  under: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flex: 1, letterSpacing: 1.1 },
});
