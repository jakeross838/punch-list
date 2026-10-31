// The job's schedule, built from the list as it is right now: a chart of every company's visits
// across the working days, in the order the work starts. Visits on the schedule stay where they are,
// green once the company confirms and blue as our best guess. Everything else that is ready, or has
// a date it will be ready, gets a pale best guess that moves as the list changes: work goes as soon
// as it can, with notice and a day of handoff after what it waits on, in full days of 8 hours. Save
// the Best Guess keeps those dates. The headline is when everything with a date is done. Past Due
// comes first; what has no date yet and what needs a price are listed under the chart. Tap a bar for
// its visit, or a company for its plan.

import {
  buildTimeline,
  companyPlan,
  dayOfDate,
  holdText,
  lookAheadStart,
  pastDue,
  timelineRows,
  type ListLine,
  type TimelineBar,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gantt, GanttKey } from '@/components/Gantt';
import { VisitSheet, type VisitDraft } from '@/components/VisitSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useHolds } from '@/data/view';
import { EmptyState, haptic, ListRow, ListSection, Page, Text, Touchable, useFeedback, weekdayDate } from '@/ui';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function ScheduleScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const visits = data.useVisits(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const holds = useHolds(jobId);
  const today = dayOfDate(new Date());
  // This week, or next week once it is Friday: the three weeks the look ahead sends.
  const monday = lookAheadStart(today);
  const [draft, setDraft] = useState<VisitDraft | null>(null);

  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const late = useMemo(() => pastDue(items, visits, today), [items, visits, today]);
  const timeline = useMemo(() => buildTimeline(items, visits, locations, today), [items, visits, locations, today]);
  const rows = useMemo(() => timelineRows(timeline, monday), [timeline, monday]);
  const moving = timeline.bars.filter((b) => b.kind === 'auto');

  const name = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Not set';
  const where = (id: string) => locations.find((l) => l.id === id)?.label ?? '';
  const openPlan = (companyId: string) => router.push({ pathname: '/jobs/[jobId]/plan/[companyId]', params: { jobId, companyId } });
  const openItem = (itemId: string) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId } });

  // A visit can cover its own items and the company's work not on another visit (work left on a visit that is over included).
  const plan = useMemo(() => (draft ? companyPlan(draft.companyId, items, visits, lookups, today) : null), [draft, items, visits, lookups, today]);
  const sheetLines: ListLine[] = plan
    ? [
        ...(draft?.visit ? (plan.visits.find((p) => p.visit.id === draft.visit!.id)?.lines ?? []) : []),
        ...plan.visits.filter((p) => p.pastDue && p.visit.id !== draft?.visit?.id).flatMap((p) => p.lines),
        ...plan.readyNow,
        ...plan.comingFree.flatMap((g) => g.lines),
        ...plan.noDate.flatMap((g) => g.lines),
      ]
    : [];

  function openBar(bar: TimelineBar) {
    haptic.tap();
    const itemIds = bar.items.map((i) => i.id);
    if (bar.visit) {
      setDraft({ visit: bar.visit, companyId: bar.companyId, start: bar.visit.start, days: bar.visit.days, confirmed: bar.visit.confirmed, itemIds });
    } else {
      setDraft({ visit: null, companyId: bar.companyId, start: bar.start, days: bar.days, confirmed: false, itemIds });
    }
  }

  /** Every best guess that moves with the list goes on the schedule as it is, with Undo. */
  async function saveAll() {
    if (moving.length === 0) return;
    haptic.success();
    const made: string[] = [];
    for (const bar of moving) {
      made.push(await data.addVisit({ jobId, companyId: bar.companyId, start: bar.start, days: bar.days, confirmed: false, itemIds: bar.items.map((i) => i.id) }));
    }
    feedback.toast({
      message: `${plural(made.length, 'visit')} on the schedule as our best guess`,
      action: { label: 'Undo', onPress: () => void Promise.all(made.map((id) => data.removeVisit(id))) },
    });
  }

  const headline = timeline.finish
    ? `Everything with a date is done by ${weekdayDate(timeline.finish)}.`
    : timeline.bars.length > 0
      ? 'Nothing open has a date yet.'
      : '';
  const undated = timeline.noDate.length;
  const subtitle = [headline, undated > 0 ? `${plural(undated, 'item')} with no date yet.` : ''].filter(Boolean).join(' ');

  return (
    <Page title="Schedule" large subtitle={subtitle || undefined} backLabel={job?.name}>
      {late.length > 0 ? (
        <ListSection>
          <ListRow
            title="Past Due"
            subtitle={late.length === 1 ? `${plural(late[0]!.days, 'day')} past due` : `The oldest is ${plural(late[0]!.days, 'day')} past due`}
            value={String(late.length)}
            valueColor={colors.destructive}
            accessory="chevron"
            onPress={() => router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'due', key: 'all' } })}
            testID="schedule-past-due"
          />
        </ListSection>
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.chart}>
          <Gantt timeline={timeline} rows={rows} monday={monday} today={today} companyName={name} onBar={openBar} onCompany={openPlan} />
          <GanttKey />
        </View>
      ) : (
        <EmptyState icon="calendar" title="Nothing to Schedule" message="Open work shows here as it is added, company by company." />
      )}

      {moving.length > 0 ? (
        <ListSection footer="The pale bars move as the list changes. Saved, they stay where they are until you move them, ready to send and confirm.">
          <ListRow
            title="Save the Best Guess"
            subtitle={`${plural(moving.length, 'visit')} for ${plural(new Set(moving.map((b) => b.companyId)).size, 'company', 'companies')}`}
            icon="calendar"
            tone="tint"
            onPress={() => void saveAll()}
            testID="schedule-save-all"
          />
        </ListSection>
      ) : null}

      {timeline.noDate.length > 0 ? (
        <ListSection header={`No Date Yet (${timeline.noDate.length})`} footer="A Ready By date, or a date for the work they wait on, puts these on the schedule.">
          {timeline.noDate.map((item, i) => (
            <Touchable
              key={item.id}
              feedback="highlight"
              onPress={() => openItem(item.id)}
              accessibilityRole="button"
              testID={`schedule-undated-${item.id}`}
              style={[styles.row, i > 0 ? styles.rule : null]}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{item.title}</Text>
                <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
                  {[where(item.locationId), item.companyId ? name(item.companyId) : '', `Waiting on ${holdText(item, holds) || 'something'}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Touchable>
          ))}
        </ListSection>
      ) : null}

      {timeline.needsPrice.length > 0 ? (
        <ListSection footer="Additional work goes on the schedule once it has its order number.">
          <ListRow
            title="Needs a Price"
            value={String(timeline.needsPrice.length)}
            accessory="chevron"
            onPress={() => router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'waiting', key: 'price' } })}
            testID="schedule-needs-price"
          />
        </ListSection>
      ) : null}

      <VisitSheet jobId={jobId} company={draft ? name(draft.companyId) : ''} draft={draft} lines={sheetLines} onClose={() => setDraft(null)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  chart: { marginBottom: 22 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
  rule: { borderTopWidth: layout.hairline, borderTopColor: colors.separator },
});
