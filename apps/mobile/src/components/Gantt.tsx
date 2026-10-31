// The schedule as a chart: a row for each company, in the order their work starts, and a bar for
// each visit across the working days. Green is confirmed, blue is our best guess, and a pale bar is
// a best guess that still moves with the list; red is a visit that is over with work still open.
// A dark outline marks the visits that set the finish date. Holidays are shaded, with no work on
// them. A line marks today. It scrolls sideways for the weeks after the first three. Tap a bar for
// its visit, or a company for its plan.

import { addDays, holidayOn, isWeekday, workingIndex, type Timeline, type TimelineBar } from '@punch/core';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { shortDate, Text, Touchable, weekdayDate } from '@/ui';

const DAY = 20;
const LABEL = 100;
const ROW = 40;
const BAR = 24;
const HEAD = 38;
const MIN_WEEKS = 3;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function barWords(bar: TimelineBar): string {
  return bar.pastDue
    ? 'Over, with work still open'
    : bar.done
      ? 'Done'
      : bar.kind === 'confirmed'
        ? 'Confirmed'
        : bar.kind === 'planned'
          ? 'Our best guess'
          : 'Our best guess, moves with the list';
}

export function Gantt({
  timeline,
  rows,
  monday,
  today,
  companyName,
  onBar,
  onCompany,
}: {
  timeline: Timeline;
  rows: { companyId: string; bars: TimelineBar[] }[];
  /** The Monday the chart starts on. */
  monday: string;
  today: string;
  companyName: (id: string) => string;
  onBar: (bar: TimelineBar) => void;
  onCompany: (companyId: string) => void;
}) {
  const lastIndex = Math.max(MIN_WEEKS * 5 - 1, ...timeline.bars.map((b) => workingIndex(monday, b.end)));
  const weeks = Math.max(MIN_WEEKS, Math.ceil((lastIndex + 1) / 5));
  const width = weeks * 5 * DAY;
  const todayIndex = workingIndex(monday, today);
  const todayShown = todayIndex >= 0 && todayIndex < weeks * 5 && isWeekday(today);
  const now = new Date();
  const critical = new Set(timeline.critical.map((b) => b.key));
  // The holidays in view, by their column.
  const off = Array.from({ length: weeks * 5 }, (_, i) => addDays(monday, Math.floor(i / 5) * 7 + (i % 5)))
    .map((day, i) => ({ day, i, name: holidayOn(day) }))
    .filter((d) => d.name !== null);

  return (
    <View style={styles.card} testID="gantt">
      <View style={styles.labels}>
        <View style={{ height: HEAD }} />
        {rows.map((r) => (
          <Touchable
            key={r.companyId}
            feedback="highlight"
            onPress={() => onCompany(r.companyId)}
            accessibilityRole="button"
            accessibilityLabel={`${companyName(r.companyId)}, its plan`}
            testID={`gantt-company-${r.companyId}`}
            style={styles.label}
          >
            <Text variant="footnote" weight="600" numberOfLines={2}>
              {companyName(r.companyId)}
            </Text>
          </Touchable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={{ width }}>
          <View style={[styles.head, { width }]}>
            {Array.from({ length: weeks }, (_, w) => {
              const weekStart = addDays(monday, w * 7);
              return (
                <View key={weekStart} style={[styles.week, { width: 5 * DAY }]}>
                  <Text variant="caption1" weight="600" color={colors.secondary} numberOfLines={1}>
                    {shortDate(weekStart, now)}
                  </Text>
                  <View style={styles.dayNumbers}>
                    {Array.from({ length: 5 }, (_, d) => {
                      const day = addDays(weekStart, d);
                      return (
                        <Text
                          key={day}
                          variant="caption1"
                          color={day === today ? colors.destructive : holidayOn(day) ? colors.chevron : colors.quiet}
                          weight={day === today ? '600' : '400'}
                          style={styles.dayNumber}
                        >
                          {Number(day.slice(8))}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
          {off.map((d) => (
            <View
              key={d.day}
              pointerEvents="none"
              accessibilityLabel={`${d.name}, no work`}
              style={[styles.holiday, { left: d.i * DAY, height: rows.length * ROW }]}
            />
          ))}
          {rows.map((r) => (
            <View key={r.companyId} style={[styles.row, { width }]}>
              {Array.from({ length: weeks }, (_, w) => (
                <View key={w} style={[styles.weekRule, { left: w * 5 * DAY }]} />
              ))}
              {r.bars.map((bar) => {
                const from = Math.max(0, workingIndex(monday, bar.start));
                const to = workingIndex(monday, bar.end);
                if (to < 0) return null;
                const span = to - from + 1;
                const when = bar.days > 1 ? `${weekdayDate(bar.start, now)} to ${weekdayDate(bar.end, now)}` : weekdayDate(bar.start, now);
                return (
                  <Touchable
                    key={bar.key}
                    feedback="opacity"
                    onPress={() => onBar(bar)}
                    accessibilityRole="button"
                    accessibilityLabel={`${companyName(bar.companyId)}, ${when}, ${barWords(bar)}, ${plural(bar.items.length, 'item')}${critical.has(bar.key) ? ', sets the finish date' : ''}${bar.visit?.askedStart && !bar.visit.confirmed ? ', other dates asked for' : ''}`}
                    testID={`gantt-bar-${bar.key}`}
                    style={[
                      styles.bar,
                      { left: from * DAY + 1, width: span * DAY - 2 },
                      bar.done
                        ? styles.done
                        : bar.kind === 'confirmed'
                          ? styles.confirmed
                          : bar.kind === 'planned'
                            ? styles.planned
                            : styles.moving,
                      bar.pastDue ? styles.late : null,
                      critical.has(bar.key) && !bar.pastDue ? styles.critical : null,
                    ]}
                  >
                    {bar.visit?.askedStart && !bar.visit.confirmed ? <View style={styles.askedDot} testID={`gantt-asked-${bar.key}`} /> : null}
                    {span >= 3 ? (
                      <Text
                        variant="caption1"
                        weight="600"
                        color={bar.kind === 'auto' && !bar.done ? colors.tint : colors.white}
                        numberOfLines={1}
                        style={styles.barText}
                      >
                        {plural(bar.items.length, 'item')}
                      </Text>
                    ) : null}
                  </Touchable>
                );
              })}
            </View>
          ))}
          {todayShown ? <View pointerEvents="none" style={[styles.today, { left: todayIndex * DAY + DAY / 2, height: HEAD + rows.length * ROW - 6 }]} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** What the colors mean, under the chart. */
export function GanttKey({ critical = false, holidays = false }: { critical?: boolean; holidays?: boolean }) {
  const swatch = (style: object, label: string) => (
    <View style={styles.keyItem}>
      <View style={[styles.swatch, style]} />
      <Text variant="footnote" color={colors.secondary}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={styles.key}>
      {swatch(styles.confirmed, 'Confirmed')}
      {swatch(styles.planned, 'Our best guess')}
      {swatch(styles.moving, 'Moves with the list')}
      {swatch([styles.planned, styles.late], 'Over, work open')}
      {critical ? swatch([styles.planned, styles.critical], 'Sets the finish date') : null}
      {holidays ? swatch(styles.holidaySwatch, 'Holiday') : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', marginHorizontal: layout.margin, borderRadius: layout.radius, backgroundColor: colors.cell, overflow: 'hidden', paddingBottom: 6 },
  labels: { width: LABEL, borderRightWidth: layout.hairline, borderRightColor: colors.separator },
  label: { height: ROW, justifyContent: 'center', paddingLeft: 12, paddingRight: 6 },
  head: { height: HEAD, flexDirection: 'row' },
  week: { paddingTop: 6, paddingLeft: 4, borderLeftWidth: layout.hairline, borderLeftColor: colors.separator },
  dayNumbers: { flexDirection: 'row', marginLeft: -4, marginTop: 2 },
  dayNumber: { width: DAY, textAlign: 'center' },
  row: { height: ROW, justifyContent: 'center' },
  weekRule: { position: 'absolute', top: 0, bottom: 0, width: 0, borderLeftWidth: layout.hairline, borderLeftColor: colors.separator },
  bar: { position: 'absolute', top: (ROW - BAR) / 2, height: BAR, borderRadius: 6, justifyContent: 'center', overflow: 'hidden' },
  barText: { paddingHorizontal: 6 },
  confirmed: { backgroundColor: colors.confirmed },
  planned: { backgroundColor: colors.bestGuess },
  moving: { backgroundColor: colors.moving, borderWidth: 1, borderColor: colors.bestGuess },
  done: { backgroundColor: colors.chevron },
  late: { borderWidth: 2, borderColor: colors.destructive },
  critical: { borderWidth: 2, borderColor: colors.label },
  askedDot: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.destructive, borderWidth: 1, borderColor: colors.white },
  holiday: { position: 'absolute', top: HEAD, width: DAY, backgroundColor: colors.surface },
  holidaySwatch: { backgroundColor: colors.surface, borderWidth: layout.hairline, borderColor: colors.separator },
  today: { position: 'absolute', top: HEAD - 4, width: 0, borderLeftWidth: 1.5, borderLeftColor: colors.destructive },
  key: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginHorizontal: layout.inset, marginTop: 10 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 16, height: 10, borderRadius: 3 },
});
