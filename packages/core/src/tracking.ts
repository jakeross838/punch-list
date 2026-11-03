// Tracking against what everyone was told: each time the schedule goes out (the Three Week Look
// Ahead, or the Schedule Email to every company), the schedule as it went out is kept. Since then
// compares it with the schedule now, company by company: who starts or finishes later or earlier
// and by how many working days, who is new on it, who confirmed, who is all done and who has no date
// any more, and the finish date then and now.

import { addDays, isWorkingDay } from './dates';
import type { Timeline } from './timeline';
import type { ListSend, ScheduleSnapshot } from './types';

/** The schedule as it goes out: every visit and best guess with work still open. */
export function scheduleSnapshot(timeline: Timeline): ScheduleSnapshot {
  return {
    finish: timeline.finish,
    bars: timeline.bars
      .filter((b) => !b.done && b.items.length > 0)
      .map((b) => ({ key: b.key, companyId: b.companyId, start: b.start, end: b.end, confirmed: b.kind === 'confirmed' })),
  };
}

/** Working days from one day to another, holidays left out: above zero when the second is later. */
export function workingDaysBetween(from: string, to: string): number {
  if (from === to) return 0;
  const later = to > from;
  let n = 0;
  let day = from;
  while (day !== to) {
    day = addDays(day, later ? 1 : -1);
    if (isWorkingDay(day)) n += 1;
  }
  return later ? n : -n;
}

/**
 * later and earlier: its first day moved. longer and shorter: its first day stayed and its last day
 * moved. confirmed: its dates stayed and it confirmed a visit it had not. done: off the schedule
 * with nothing open. off: off the schedule with work still open, which has no date now.
 */
export type CompanyChangeKind = 'later' | 'longer' | 'earlier' | 'shorter' | 'new' | 'confirmed' | 'off' | 'done';

export interface CompanyChange {
  companyId: string;
  kind: CompanyChangeKind;
  /** Its first and last day then and now, where it had them. */
  was: { start: string; end: string } | null;
  now: { start: string; end: string } | null;
  /** Working days its first day moved (its last day, for longer and shorter): above zero is later. */
  days: number;
  /** For confirmed: how many visits it confirmed. */
  visits?: number;
}

export interface ScheduleChanges {
  /** When the schedule went out. */
  sentAt: string;
  finish: { was: string | null; now: string | null; days: number };
  changes: CompanyChange[];
}

/** Each company's first day, last day, and the dates of the visits it confirmed. */
function byCompany(s: ScheduleSnapshot): Map<string, { start: string; end: string; confirmed: Set<string> }> {
  const out = new Map<string, { start: string; end: string; confirmed: Set<string> }>();
  for (const b of s.bars) {
    const was = out.get(b.companyId) ?? { start: b.start, end: b.end, confirmed: new Set<string>() };
    if (b.confirmed) was.confirmed.add(`${b.start} ${b.end}`);
    out.set(b.companyId, { start: b.start < was.start ? b.start : was.start, end: b.end > was.end ? b.end : was.end, confirmed: was.confirmed });
  }
  return out;
}

const ORDER: CompanyChangeKind[] = ['later', 'longer', 'earlier', 'shorter', 'new', 'confirmed', 'off', 'done'];

/**
 * What moved since the schedule went out, the biggest moves first; nothing when nothing did.
 * hasOpenWork tells a company that is all done from one whose work has no date now.
 */
export function scheduleChanges(
  then: ScheduleSnapshot,
  now: ScheduleSnapshot,
  sentAt: string,
  hasOpenWork: (companyId: string) => boolean = () => true,
): ScheduleChanges {
  const before = byCompany(then);
  const after = byCompany(now);
  const changes: CompanyChange[] = [];
  for (const [companyId, n] of after) {
    const b = before.get(companyId);
    const span = { start: n.start, end: n.end };
    if (!b) {
      changes.push({ companyId, kind: 'new', was: null, now: span, days: 0 });
      continue;
    }
    const was = { start: b.start, end: b.end };
    const starts = workingDaysBetween(b.start, n.start);
    const ends = workingDaysBetween(b.end, n.end);
    if (starts !== 0) changes.push({ companyId, kind: starts > 0 ? 'later' : 'earlier', was, now: span, days: starts });
    else if (ends !== 0) changes.push({ companyId, kind: ends > 0 ? 'longer' : 'shorter', was, now: span, days: ends });
    else {
      const newly = [...n.confirmed].filter((d) => !b.confirmed.has(d)).length;
      if (newly > 0) changes.push({ companyId, kind: 'confirmed', was, now: span, days: 0, visits: newly });
    }
  }
  for (const [companyId, b] of before) {
    if (!after.has(companyId)) changes.push({ companyId, kind: hasOpenWork(companyId) ? 'off' : 'done', was: { start: b.start, end: b.end }, now: null, days: 0 });
  }
  changes.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || Math.abs(b.days) - Math.abs(a.days));
  const finishDays = then.finish && now.finish ? workingDaysBetween(then.finish, now.finish) : 0;
  return { sentAt, finish: { was: then.finish, now: now.finish, days: finishDays }, changes };
}

/** The last time the schedule went out with the schedule kept: the Schedule Email or the look ahead. */
export function lastScheduleSend(sends: ListSend[]): ListSend | undefined {
  return sends
    .filter((s) => !s.removed && (s.list === 'schedule' || s.list === 'lookahead') && s.snapshot)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
}

/** "5 working days later", "1 working day earlier" */
export function movedText(days: number): string {
  const n = Math.abs(days);
  return `${n} working ${n === 1 ? 'day' : 'days'} ${days > 0 ? 'later' : 'earlier'}`;
}

/** What changed for a company, in a few words: "Starts 3 working days later". */
export function changeText(change: Pick<CompanyChange, 'kind' | 'days' | 'visits'>): string {
  switch (change.kind) {
    case 'later':
    case 'earlier':
      return `Starts ${movedText(change.days)}`;
    case 'longer':
    case 'shorter':
      return `Finishes ${movedText(change.days)}`;
    case 'new':
      return 'New on the schedule';
    case 'confirmed':
      return (change.visits ?? 1) > 1 ? `Confirmed ${change.visits} visits` : 'Confirmed a visit';
    case 'off':
      return 'No date now';
    case 'done':
      return 'All done';
  }
}

/** Whether anything moved since: a company, or the finish date. */
export const anyChange = (changes: ScheduleChanges): boolean => changes.changes.length > 0 || changes.finish.days !== 0 || changes.finish.was !== changes.finish.now;
