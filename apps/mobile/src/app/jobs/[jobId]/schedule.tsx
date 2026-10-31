// The job's schedule, built from the list: what is past due first, then each company's visits this
// week, next week and later (confirmed, or our best guess) with the time their work takes, then the
// companies with work that is not scheduled yet and how many days of it is ready. Tap a company
// for its plan.

import {
  daysText,
  DAY_HOURS,
  dayOfDate,
  notBooked,
  pastDue,
  totalText,
  totalTime,
  visitEnd,
  weekSection,
  WEEK_LABELS,
  type TimeTotal,
  type Visit,
  type WeekSection,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { VisitStatus } from '@/components/VisitSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { EmptyState, Icon, ListRow, ListSection, Page, shortDate, Text, Touchable, weekdayDate } from '@/ui';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ORDER: WeekSection[] = ['past', 'this_week', 'next_week', 'later'];

export default function ScheduleScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const visits = data.useVisits(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const today = dayOfDate(new Date());

  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const late = useMemo(() => pastDue(items, visits, today), [items, visits, today]);
  const loose = useMemo(() => notBooked(items, visits, lookups, today), [items, visits, lookups, today]);
  const sections = useMemo(() => {
    const out = new Map<WeekSection, { visit: Visit; open: number; time: TimeTotal }[]>();
    for (const visit of [...visits].sort((a, b) => a.start.localeCompare(b.start))) {
      const openItems = items.filter((i) => i.visitId === visit.id && i.status === 'open');
      const open = openItems.length;
      const section = weekSection(visit, today);
      // A finished visit in the past has nothing left to show.
      if (section === 'past' && open === 0) continue;
      const list = out.get(section) ?? [];
      list.push({ visit, open, time: totalTime(openItems) });
      out.set(section, list);
    }
    return out;
  }, [visits, items, today]);

  const name = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Not set';
  const openPlan = (companyId: string) => router.push({ pathname: '/jobs/[jobId]/plan/[companyId]', params: { jobId, companyId } });
  const booked = ORDER.reduce((n, s) => n + (sections.get(s)?.length ?? 0), 0);

  return (
    <Page
      title="Schedule"
      large
      subtitle={[plural(booked, 'visit'), late.length > 0 ? `${plural(late.length, 'item')} past due` : ''].filter(Boolean).join(', ')}
      backLabel={job?.name}
    >
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

      {ORDER.map((section) => {
        const rows = sections.get(section);
        if (!rows || rows.length === 0) return null;
        return (
          <ListSection key={section} header={section === 'past' ? 'Ended With Work Open' : WEEK_LABELS[section]}>
            {rows.map(({ visit, open, time }) => {
              const end = visitEnd(visit);
              const over = section !== 'past' && time.hours > visit.days * DAY_HOURS;
              const when = visit.days > 1 ? `${weekdayDate(visit.start)} to ${weekdayDate(end)}` : weekdayDate(visit.start);
              return (
                <Touchable
                  key={visit.id}
                  feedback="highlight"
                  onPress={() => openPlan(visit.companyId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${name(visit.companyId)}, ${when}`}
                  testID={`schedule-visit-${visit.id}`}
                  style={styles.row}
                >
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{name(visit.companyId)}</Text>
                    <Text variant="subheadline" color={section === 'past' ? colors.destructive : colors.secondary}>
                      {when}
                    </Text>
                    <Text variant="subheadline" color={section === 'past' || over ? colors.destructive : colors.secondary}>
                      {[visit.days > 1 ? plural(visit.days, 'day') : '', `${plural(open, 'item')}${section === 'past' ? ' still open' : ''}`, totalText(time)]
                        .filter(Boolean)
                        .join(', ')}
                      {over ? `, more than ${plural(visit.days, 'day')}` : ''}
                    </Text>
                  </View>
                  <VisitStatus confirmed={visit.confirmed} />
                  <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" />
                </Touchable>
              );
            })}
          </ListSection>
        );
      })}

      {loose.length > 0 ? (
        <ListSection header="Not Scheduled" footer="Tap a company to schedule its work.">
          {loose.map((r) => (
            <ListRow
              key={r.companyId}
              title={r.company}
              subtitle={[
                r.readyNow > 0 ? `${r.readyNow} ready now${r.readyTime.timed > 0 ? `, about ${daysText(r.readyTime.hours)} of work` : ''}` : '',
                r.comingFree > 0 && r.nextFree ? `${r.comingFree} ${r.readyNow > 0 ? 'more' : 'ready'} by ${shortDate(r.nextFree)}` : '',
                r.needsPrice > 0 ? `${r.needsPrice} ${r.needsPrice === 1 ? 'needs' : 'need'} a price` : '',
              ]
                .filter(Boolean)
                .join(', ')}
              accessory="chevron"
              onPress={() => openPlan(r.companyId)}
              testID={`schedule-company-${r.companyId}`}
            />
          ))}
        </ListSection>
      ) : null}

      {booked === 0 && loose.length === 0 && late.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing to Schedule" message="Open work shows here by company." />
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
});
