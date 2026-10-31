// One company's plan: its visits, what is ready now and not scheduled, what comes free and when,
// what is waiting with no date yet, and additional work that needs a price, each with its estimated
// time. Ready work longer than a day splits into full working days, location by location, so each
// day can be scheduled on its own, or all of it at once. A batch that comes free schedules as soon
// as what it waits on is done (with a day of handoff and fair notice), for the days its time needs.
// At the top, the company's own page (what it sees from the link on its list) and the comments on
// its whole list: the back and forth about its week.

import {
  companyPlan,
  dayOfDate,
  daysFor,
  listComments,
  daysText,
  earliestStart,
  hoursText,
  openHolds,
  startAfter,
  totalText,
  visitEnd,
  waitingKey,
  type ListLine,
  type TimeTotal,
  type Visit,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CommentThread } from '@/components/Comments';
import { VisitSheet, VisitStatus, type VisitDraft } from '@/components/VisitSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useHolds } from '@/data/view';
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
  const thread = listComments(data.useComments(jobId), companyId);

  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const holds = useHolds(jobId);
  const plan = useMemo(() => companyPlan(companyId, items, visits, lookups, today), [companyId, items, visits, lookups, today]);

  // What a visit can cover: its own items and the company's work not on another visit.
  const loose = useMemo(
    () => [...plan.readyNow, ...plan.comingFree.flatMap((g) => g.lines), ...plan.noDate.flatMap((g) => g.lines)],
    [plan],
  );
  const choicesFor = (visit: Visit | null): ListLine[] => [...(visit ? (plan.visits.find((p) => p.visit.id === visit.id)?.lines ?? []) : []), ...loose];
  const sheetLines = draft ? choicesFor(draft.visit) : [];

  const book = (itemIds: string[], start: string, days = 1) => setDraft({ visit: null, companyId, start, days, confirmed: false, itemIds });
  const edit = (visit: Visit, itemIds: string[]) =>
    setDraft({ visit, companyId, start: visit.start, days: visit.days, confirmed: visit.confirmed, itemIds });
  const openItem = (id: string) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: id } });
  const openHoldup = (label: string) => router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'waiting', key: waitingKey(label) } });

  const open = plan.visits.reduce((n, v) => n + v.lines.length, 0) + loose.length + plan.needsPrice.length;
  const subtitle =
    open === 0
      ? 'Nothing open'
      : [
          plural(open, 'open item'),
          plan.readyNow.length > 0 ? `${plan.readyNow.length} ready to schedule${plan.readyTime.timed > 0 ? `, about ${daysText(plan.readyTime.hours)} of work` : ''}` : '',
        ]
          .filter(Boolean)
          .join(' · ');

  const itemRows = (lines: ListLine[], note?: (l: ListLine) => string | undefined) =>
    lines.map((l) => (
      <ListRow
        key={l.item.id}
        title={l.item.title}
        subtitle={[l.room, note?.(l)].filter(Boolean).join(', ')}
        value={l.item.hours !== null ? hoursText(l.item.hours) : undefined}
        accessory="chevron"
        onPress={() => openItem(l.item.id)}
        testID={`plan-item-${l.item.id}`}
      />
    ));
  const byId = new Map(plan.readyNow.map((l) => [l.item.id, l]));
  const untimedReady = plan.readyNow.filter((l) => l.item.hours === null);
  const allReady = plan.readyNow.map((l) => l.item.id);
  const readyDays = Math.max(1, plan.readyDays.length);

  return (
    <Page title={plan.company} large subtitle={subtitle} backLabel="Schedule" background="grouped">
      {open === 0 ? <EmptyState icon="checkmark.circle.fill" title="Nothing Open" message={`${plan.company} has no open work on this job.`} /> : null}

      <ListSection footer="What they see from the link on their list, and where they comment.">
        <ListRow
          title={`${plan.company}'s Page`}
          icon="eye"
          accessory="chevron"
          onPress={() => router.push({ pathname: '/jobs/[jobId]/company/[companyId]', params: { jobId, companyId } })}
          testID="company-page"
        />
      </ListSection>
      <Text variant="footnote" color={colors.secondary} style={styles.threadTitle}>
        Comments on the Whole List
      </Text>
      <CommentThread
        comments={thread}
        onPost={(body, internal) => void data.addComment({ jobId, itemId: null, companyId, body, internal })}
        placeholder={`Anything for ${plan.company} about the whole list`}
        hint={`${plan.company} sees these on its page and on its next list.`}
        style={styles.thread}
        testID="plan-comments"
      />

      {plan.visits.length > 0 ? (
        <ListSection header="Visits">
          {plan.visits.map((p) => {
            const end = visitEnd(p.visit);
            const when = p.visit.days > 1 ? `${weekdayDate(p.visit.start)} to ${weekdayDate(end)}` : weekdayDate(p.visit.start);
            const what = [
              p.visit.days > 1 ? plural(p.visit.days, 'day') : '',
              plural(p.lines.length, 'item'),
              totalText(p.time),
              p.done > 0 ? `${p.done} done` : '',
            ]
              .filter(Boolean)
              .join(', ');
            const over = p.time.hours > p.visit.days * 8;
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
                  {over && !p.pastDue ? (
                    <Text variant="subheadline" color={colors.destructive}>
                      More work than {plural(p.visit.days, 'day')}: about {daysText(p.time.hours)}
                    </Text>
                  ) : null}
                </View>
                <VisitStatus confirmed={p.visit.confirmed} />
                <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" />
              </Touchable>
            );
          })}
        </ListSection>
      ) : null}

      {plan.readyNow.length > 0 && plan.readyDays.length > 1 ? (
        <>
          <ListSection header="Ready to Schedule" headerRight={<TimeNote time={plan.readyTime} />} footer="Full working days of 8 hours, location by location. Schedule a day on its own, or all of it at once.">
            <ListRow
              title={`Schedule All ${plan.readyNow.length}, ${readyDays} Days`}
              tone="tint"
              icon="calendar"
              onPress={() => book(allReady, earliestStart(today), readyDays)}
              testID="book-ready"
            />
          </ListSection>
          {plan.readyDays.map((day, i) => (
            <ListSection key={`day-${i}`} header={`Day ${i + 1}`} headerRight={<Text variant="footnote" color={colors.secondary} tabular>{hoursText(day.hours)}</Text>} testID={`ready-day-${i + 1}`}>
              {itemRows(day.items.map((id) => byId.get(id)).filter((l): l is ListLine => !!l))}
              <ListRow
                title={`Schedule Day ${i + 1}`}
                tone="tint"
                icon="calendar.badge.clock"
                onPress={() => book(day.items, earliestStart(today), daysFor(day.hours))}
                testID={`book-day-${i + 1}`}
              />
            </ListSection>
          ))}
          {untimedReady.length > 0 ? (
            <ListSection header={`Not Estimated (${untimedReady.length})`} footer="Give each one an estimated time to plan it into a day.">
              {itemRows(untimedReady)}
            </ListSection>
          ) : null}
        </>
      ) : plan.readyNow.length > 0 ? (
        <ListSection header={`Ready (${plan.readyNow.length})`} headerRight={<TimeNote time={plan.readyTime} />}>
          {itemRows(plan.readyNow)}
          <ListRow
            title={plan.readyNow.length === 1 ? 'Schedule This One' : `Schedule These ${plan.readyNow.length}`}
            tone="tint"
            icon="calendar"
            onPress={() => book(allReady, earliestStart(today))}
            testID="book-ready"
          />
        </ListSection>
      ) : null}

      {plan.comingFree.map((g) => (
        <ListSection key={`${g.date}-${g.on}`} header={`Waiting on ${g.on}, ready by ${shortDate(g.date)}`}>
          {itemRows(g.lines)}
          <ListRow
            title={`Schedule for ${shortDate(startAfter(g.date, today))}`}
            subtitle={g.time.timed > 0 ? `${totalText(g.time)}, about ${daysText(g.time.hours)} of work` : undefined}
            tone="tint"
            icon="calendar"
            onPress={() => book(g.lines.map((l) => l.item.id), startAfter(g.date, today), daysFor(g.time.hours))}
            testID={`book-${g.date}`}
          />
        </ListSection>
      ))}

      {plan.noDate.map((g) => {
        // Waiting on a task with no visit yet: it gets its date once that company is scheduled.
        const first = g.lines[0]?.item;
        const task = first ? openHolds(first, holds).find((t) => t.companyId && !t.visitId) : undefined;
        const other = task?.companyId;
        return (
          <ListSection key={`none-${g.on}`} header={`Waiting on ${g.on}, no date yet`}>
            {itemRows(g.lines)}
            {other ? (
              <ListRow
                title={`Schedule ${holds.companies.get(other) ?? 'That Company'}`}
                subtitle="These come free once that visit is done."
                tone="tint"
                icon="calendar"
                onPress={() => router.push({ pathname: '/jobs/[jobId]/plan/[companyId]', params: { jobId, companyId: other } })}
              />
            ) : (
              <ListRow title="Add a Ready By Date" tone="tint" icon="hourglass" onPress={() => openHoldup(first?.waitingOn[0] ?? g.on)} />
            )}
          </ListSection>
        );
      })}

      {plan.needsPrice.length > 0 ? (
        <ListSection header={`Needs a Price (${plan.needsPrice.length})`} footer="Additional work. Add its order number once it is priced.">
          {itemRows(plan.needsPrice, (l) => (l.item.ready ? undefined : 'not ready'))}
        </ListSection>
      ) : null}

      <VisitSheet jobId={jobId} company={plan.company} draft={draft} lines={sheetLines} onClose={() => setDraft(null)} />
    </Page>
  );
}

/** "13.75 hours, 2 not estimated" at the right of a heading. */
function TimeNote({ time }: { time: TimeTotal }) {
  const text = totalText(time);
  return text ? (
    <Text variant="footnote" color={colors.secondary} tabular>
      {text}
    </Text>
  ) : null;
}

const styles = StyleSheet.create({
  threadTitle: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 7 },
  thread: { marginBottom: 22 },
  visit: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
});
