// The schedule the list builds: each company's trips to the job (visits), what is past due and by
// how many days, and each company's plan: what is ready now, what comes free and when, what has no
// date yet, and what needs a price. Work goes as soon as it is ready, with a day of handoff
// buffer, and new starts get more than a day's notice. Estimated times add up for each visit and
// each batch, and the ready work splits into full working days, location by location.

import { addWorkingDays, daysBetween, isDay, mondayOf, visitEnd, workingDayOnOrAfter } from './dates';
import { lineFor, type ListLine, type ListLookups } from './lists';
import { isPriced } from './rules';
import { NO_TIME, totalTime, workDays, type TimeTotal, type WorkDay } from './time';
import type { Item, Visit } from './types';
import { sortItems } from './views';
import { waitingOnText } from './waitingOn';

/** Working days of notice a new start gets: Friday's plan starts Tuesday at the earliest. */
export const NOTICE_DAYS = 2;
/** Working days between one company finishing and the next starting. */
export const HANDOFF_DAYS = 1;

/** The first day a new visit can start with fair notice. */
export function earliestStart(today: string): string {
  return addWorkingDays(today, NOTICE_DAYS);
}

/** When to book work that comes free on a day: the next working day after it, with notice. */
export function startAfter(readyBy: string, today: string): string {
  const after = addWorkingDays(workingDayOnOrAfter(readyBy), HANDOFF_DAYS);
  const soonest = earliestStart(today);
  return after < soonest ? soonest : after;
}

export interface PastDue {
  item: Item;
  /** Not ready past its Ready By, or still open after its visit ended. */
  reason: 'ready_by' | 'visit';
  /** The day it was due. */
  due: string;
  /** Calendar days since then. */
  days: number;
}

/** Everything open and late, the latest first. */
export function pastDue(items: Item[], visits: Visit[], today: string): PastDue[] {
  const live = new Map(visits.filter((v) => !v.removed).map((v) => [v.id, v]));
  const out: PastDue[] = [];
  for (const item of items) {
    if (item.status !== 'open' || item.unfinished) continue;
    const late: PastDue[] = [];
    if (!item.ready && isDay(item.readyBy) && item.readyBy < today) {
      late.push({ item, reason: 'ready_by', due: item.readyBy, days: daysBetween(item.readyBy, today) });
    }
    const visit = item.visitId ? live.get(item.visitId) : undefined;
    if (visit) {
      const end = visitEnd(visit);
      if (end < today) late.push({ item, reason: 'visit', due: end, days: daysBetween(end, today) });
    }
    const worst = late.sort((a, b) => b.days - a.days)[0];
    if (worst) out.push(worst);
  }
  return out.sort((a, b) => b.days - a.days || (a.item.number ?? 1e9) - (b.item.number ?? 1e9));
}

/** "5 days past due", "1 day past due". */
export function pastDueText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'} past due`;
}

export interface PlannedVisit {
  visit: Visit;
  end: string;
  /** Its open items, in floor order. */
  lines: ListLine[];
  /** Its items already complete. */
  done: number;
  /** Its last day has passed and work is still open. */
  pastDue: boolean;
  /** Its open items' estimated time. */
  time: TimeTotal;
}

export interface ComingFree {
  /** The soonest Ready By in the group. */
  date: string;
  /** What they wait on: "Owner and Volcano Stone". */
  on: string;
  lines: ListLine[];
  time: TimeTotal;
}

export interface CompanyPlan {
  companyId: string;
  company: string;
  visits: PlannedVisit[];
  /** Ready, priced and not booked yet. */
  readyNow: ListLine[];
  readyTime: TimeTotal;
  /** The ready work split into full working days, location by location. Items with no estimate are not in a day. */
  readyDays: WorkDay[];
  /** Waiting, with a date, soonest first. */
  comingFree: ComingFree[];
  /** Waiting with no date yet. */
  noDate: { on: string; lines: ListLine[] }[];
  /** Added scope with no price yet. */
  needsPrice: ListLine[];
}

function inFloorOrder(items: Item[], lookups: ListLookups): Item[] {
  const order = new Map(lookups.locations.map((l) => [l.id, l.sortOrder]));
  return [...sortItems(items)].sort((a, b) => (order.get(a.locationId) ?? 1e9) - (order.get(b.locationId) ?? 1e9));
}

export function companyPlan(companyId: string, items: Item[], visits: Visit[], lookups: ListLookups, today: string): CompanyPlan {
  const mine = inFloorOrder(
    items.filter((i) => i.companyId === companyId && !i.unfinished && i.status !== 'removed'),
    lookups,
  );
  const ownVisits = visits.filter((v) => !v.removed && v.companyId === companyId).sort((a, b) => a.start.localeCompare(b.start));
  const visitIds = new Set(ownVisits.map((v) => v.id));

  const planned: PlannedVisit[] = ownVisits.map((visit) => {
    const inIt = mine.filter((i) => i.visitId === visit.id);
    const open = inIt.filter((i) => i.status === 'open');
    const end = visitEnd(visit);
    return {
      visit,
      end,
      lines: open.map((i) => lineFor(i, lookups)),
      done: inIt.length - open.length,
      pastDue: open.length > 0 && end < today,
      time: open.length > 0 ? totalTime(open) : NO_TIME,
    };
  });

  const loose = mine.filter((i) => i.status === 'open' && !(i.visitId && visitIds.has(i.visitId)));
  const needsPrice = loose.filter((i) => !isPriced(i));
  const priced = loose.filter((i) => isPriced(i));
  const readyNow = priced.filter((i) => i.ready);

  const coming = new Map<string, ComingFree>();
  const noDate = new Map<string, { on: string; lines: ListLine[] }>();
  for (const item of priced.filter((i) => !i.ready)) {
    const on = waitingOnText(item.waitingOn) || 'Something not named';
    if (isDay(item.readyBy)) {
      const key = `${item.readyBy}|${on.toLowerCase()}`;
      const group = coming.get(key) ?? { date: item.readyBy, on, lines: [], time: NO_TIME };
      group.lines.push(lineFor(item, lookups));
      coming.set(key, group);
    } else {
      const group = noDate.get(on.toLowerCase()) ?? { on, lines: [] };
      group.lines.push(lineFor(item, lookups));
      noDate.set(on.toLowerCase(), group);
    }
  }

  return {
    companyId,
    company: lookups.companies.find((c) => c.id === companyId)?.name ?? 'Not set',
    visits: planned,
    readyNow: readyNow.map((i) => lineFor(i, lookups)),
    readyTime: totalTime(readyNow),
    readyDays: workDays(readyNow),
    comingFree: [...coming.values()]
      .map((g) => ({ ...g, time: totalTime(g.lines.map((l) => l.item)) }))
      .sort((a, b) => a.date.localeCompare(b.date) || b.lines.length - a.lines.length),
    noDate: [...noDate.values()].sort((a, b) => b.lines.length - a.lines.length || a.on.localeCompare(b.on)),
    needsPrice: needsPrice.map((i) => lineFor(i, lookups)),
  };
}

export type WeekSection = 'past' | 'this_week' | 'next_week' | 'later';

export const WEEK_LABELS: Record<WeekSection, string> = { past: 'Past Due', this_week: 'This Week', next_week: 'Next Week', later: 'Later' };

/** Which part of the look-ahead a visit belongs in. A visit whose last day has passed is past. */
export function weekSection(visit: Pick<Visit, 'start' | 'days'>, today: string): WeekSection {
  if (visitEnd(visit) < today) return 'past';
  const thisMonday = mondayOf(today);
  const start = mondayOf(workingDayOnOrAfter(visit.start));
  if (start <= thisMonday) return 'this_week';
  if (daysBetween(thisMonday, start) === 7) return 'next_week';
  return 'later';
}

export interface NotBooked {
  companyId: string;
  company: string;
  readyNow: number;
  /** The ready work's estimated time. */
  readyTime: TimeTotal;
  /** The soonest date more of their work comes free, or null. */
  nextFree: string | null;
  comingFree: number;
  needsPrice: number;
}

/** The companies with work that is not on a visit yet, the most ready first. */
export function notBooked(items: Item[], visits: Visit[], lookups: ListLookups, today: string): NotBooked[] {
  const companyIds = [...new Set(items.filter((i) => i.status === 'open' && !i.unfinished && i.companyId).map((i) => i.companyId!))];
  return companyIds
    .map((id) => {
      const plan = companyPlan(id, items, visits, lookups, today);
      return {
        companyId: id,
        company: plan.company,
        readyNow: plan.readyNow.length,
        readyTime: plan.readyTime,
        nextFree: plan.comingFree[0]?.date ?? null,
        comingFree: plan.comingFree.reduce((n, g) => n + g.lines.length, 0),
        needsPrice: plan.needsPrice.length,
      };
    })
    .filter((r) => r.readyNow + r.comingFree + r.needsPrice > 0)
    .sort((a, b) => b.readyNow - a.readyNow || a.company.localeCompare(b.company));
}
