// One company's plan: its visits, what is ready now and not scheduled, what comes free and when,
// what is waiting with no date yet, and additional work that needs a price. Schedule a visit for the
// ready work, or for a batch as soon as what it waits on is done (with a day of handoff and fair
// notice).

import {
  companyPlan,
  dayOfDate,
  earliestStart,
  startAfter,
  visitEnd,
  waitingKey,
  type ListLine,
  type Visit,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { VisitSheet, VisitStatus, type VisitDraft } from '@/components/VisitSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { EmptyState, Icon, ListRow, ListSection, Page, shortDate, Text, Touchable, weekdayDate } from '@/ui';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function PlanScreen() {
  const { jobId, companyId } = useLocalSearchParams<{ jobId: string; companyId: string }>();
  const data = useData();
  const items = data.useItems(jobId);
  const visits = data.useVisits(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const today = dayOfDate(new Date());
  const [draft, setDraft] = useState<VisitDraft | null>(null);

  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const plan = useMemo(() => companyPlan(companyId, items, visits, lookups, today), [companyId, items, visits, lookups, today]);

  // What a visit can cover: its own items and the company's work not on another visit.
  const loose = useMemo(
    () => [...plan.readyNow, ...plan.comingFree.flatMap((g) => g.lines), ...plan.noDate.flatMap((g) => g.lines)],
    [plan],
  );
  const choicesFor = (visit: Visit | null): ListLine[] => [...(visit ? (plan.visits.find((p) => p.visit.id === visit.id)?.lines ?? []) : []), ...loose];
  const sheetLines = draft ? choicesFor(draft.visit) : [];

  const book = (itemIds: string[], start: string) => setDraft({ visit: null, companyId, start, days: 1, confirmed: false, itemIds });
  const edit = (visit: Visit, itemIds: string[]) =>
    setDraft({ visit, companyId, start: visit.start, days: visit.days, confirmed: visit.confirmed, itemIds });
  const openItem = (id: string) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: id } });
  const openHoldup = (label: string) => router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'waiting', key: waitingKey(label) } });

  const open = plan.visits.reduce((n, v) => n + v.lines.length, 0) + loose.length + plan.needsPrice.length;
  const subtitle =
    open === 0 ? 'Nothing open' : [plural(open, 'open item'), plan.readyNow.length > 0 ? `${plan.readyNow.length} ready to schedule` : ''].filter(Boolean).join(', ');

  const itemRows = (lines: ListLine[], note?: (l: ListLine) => string | undefined) =>
    lines.map((l) => (
      <ListRow
        key={l.item.id}
        title={l.item.title}
        subtitle={[l.room, note?.(l)].filter(Boolean).join(', ')}
        accessory="chevron"
        onPress={() => openItem(l.item.id)}
        testID={`plan-item-${l.item.id}`}
      />
    ));

  return (
    <Page title={plan.company} large subtitle={subtitle} backLabel="Schedule" background="grouped">
      {open === 0 ? <EmptyState icon="checkmark.circle.fill" title="Nothing Open" message={`${plan.company} has no open work on this job.`} /> : null}

      {plan.visits.length > 0 ? (
        <ListSection header="Visits">
          {plan.visits.map((p) => {
            const end = visitEnd(p.visit);
            const when = p.visit.days > 1 ? `${weekdayDate(p.visit.start)} to ${weekdayDate(end)}` : weekdayDate(p.visit.start);
            const what = [p.visit.days > 1 ? plural(p.visit.days, 'day') : '', plural(p.lines.length, 'item'), p.done > 0 ? `${p.done} done` : ''].filter(Boolean).join(', ');
            return (
              <Touchable
                key={p.visit.id}
                feedback="highlight"
                onPress={() => edit(p.visit, p.lines.map((l) => l.item.id))}
                accessibilityRole="button"
                accessibilityLabel={`Visit ${when}`}
                testID={`visit-${p.visit.id}`}
                style={styles.visit}
              >
                <View style={{ flex: 1 }}>
                  <Text>{when}</Text>
                  <Text variant="subheadline" color={p.pastDue ? colors.destructive : colors.secondary}>
                    {p.pastDue ? `Ended with work open. ${what}` : what}
                  </Text>
                </View>
                <VisitStatus confirmed={p.visit.confirmed} />
                <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" />
              </Touchable>
            );
          })}
        </ListSection>
      ) : null}

      {plan.readyNow.length > 0 ? (
        <ListSection header={`Ready (${plan.readyNow.length})`}>
          {itemRows(plan.readyNow)}
          <ListRow
            title={plan.readyNow.length === 1 ? 'Schedule This One' : `Schedule These ${plan.readyNow.length}`}
            tone="tint"
            icon="calendar"
            onPress={() => book(plan.readyNow.map((l) => l.item.id), earliestStart(today))}
            testID="book-ready"
          />
        </ListSection>
      ) : null}

      {plan.comingFree.map((g) => (
        <ListSection key={`${g.date}-${g.on}`} header={`Waiting on ${g.on}, ready by ${shortDate(g.date)}`}>
          {itemRows(g.lines)}
          <ListRow
            title={`Schedule for ${shortDate(startAfter(g.date, today))}`}
            tone="tint"
            icon="calendar"
            onPress={() => book(g.lines.map((l) => l.item.id), startAfter(g.date, today))}
            testID={`book-${g.date}`}
          />
        </ListSection>
      ))}

      {plan.noDate.map((g) => (
        <ListSection key={`none-${g.on}`} header={`Waiting on ${g.on}, no date yet`}>
          {itemRows(g.lines)}
          <ListRow title="Add a Ready By Date" tone="tint" icon="hourglass" onPress={() => openHoldup(g.lines[0]?.item.waitingOn[0] ?? g.on)} />
        </ListSection>
      ))}

      {plan.needsPrice.length > 0 ? (
        <ListSection header={`Needs a Price (${plan.needsPrice.length})`} footer="Additional work. Add its order number once it is priced.">
          {itemRows(plan.needsPrice, (l) => (l.item.ready ? undefined : 'not ready'))}
        </ListSection>
      ) : null}

      <VisitSheet jobId={jobId} company={plan.company} draft={draft} lines={sheetLines} onClose={() => setDraft(null)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  visit: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
});
