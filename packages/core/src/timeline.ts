// The job's schedule as a timeline, built from the list as it is right now, so the whole job can be
// seen at once and sent each week. What is on the schedule already stays where it is: confirmed, or
// our best guess. Everything else that is ready, or has a date it will be ready, gets a best guess
// that moves with the list: as soon as it can go, with more than a day's notice and a day of
// handoff after the work it waits on, a company's work packed into full days of 8 hours, location
// by location, never on a day that company already has a visit. Work that waits on a task follows
// that task however far back the chain goes. What has no date yet, or is to be quoted, is listed.

import { addWorkingDays, daysBetween, isDay, mondayOf, visitEnd, weekdayOf, workingDayOnOrAfter } from './dates';
import { isPriced } from './rules';
import { earliestStart, startAfter } from './schedule';
import { DAY_HOURS, NO_TIME, totalTime, type TimeTotal } from './time';
import type { Item, Location, Visit } from './types';

/** confirmed: the company said yes. planned: on the schedule as our best guess. auto: the best guess the list makes, not saved yet. */
export type BarKind = 'confirmed' | 'planned' | 'auto';

export interface TimelineBar {
  /** The visit's id, or "auto:" with the company and first day for a best guess not saved yet. */
  key: string;
  companyId: string;
  start: string;
  /** Working days. */
  days: number;
  /** Its last working day. */
  end: string;
  kind: BarKind;
  /** The visit it is, once it is on the schedule. */
  visit: Visit | null;
  /** Its open items, in the order the work goes. */
  items: Item[];
  time: TimeTotal;
  /** On the schedule, over, and work on it still open. */
  pastDue: boolean;
  /** On the schedule and everything on it is done. */
  done: boolean;
}

export interface Timeline {
  /** Every visit, saved or a best guess, by first day. */
  bars: TimelineBar[];
  /** Open work with no date yet: waiting on someone with no Ready By, or on work that has no date. */
  noDate: Item[];
  /** Additional work to be quoted: it is scheduled once it has its purchase order, variance purchase order or change order. */
  needsPrice: Item[];
  /** The last day with open work on it: when everything with a date is done. */
  finish: string | null;
}

export function buildTimeline(items: Item[], visits: Visit[], locations: Pick<Location, 'id' | 'sortOrder'>[], today: string): Timeline {
  const live = visits.filter((v) => !v.removed);
  const visitById = new Map(live.map((v) => [v.id, v]));
  const place = new Map(locations.map((l) => [l.id, l.sortOrder]));
  const inOrder = (a: Item, b: Item) =>
    (place.get(a.locationId) ?? 1e9) - (place.get(b.locationId) ?? 1e9) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.createdAt.localeCompare(b.createdAt);
  const byId = new Map(items.map((i) => [i.id, i]));
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const first = earliestStart(today);

  // On the schedule already: done by the last day of its visit. Work on a visit that is over gets a new best guess.
  const doneBy = new Map<string, string>();
  for (const i of open) {
    const v = i.visitId ? visitById.get(i.visitId) : undefined;
    if (v && visitEnd(v) >= today) doneBy.set(i.id, visitEnd(v));
  }
  const needsPrice = open.filter((i) => !doneBy.has(i.id) && !isPriced(i)).sort(inOrder);
  const pending = new Map(open.filter((i) => !doneBy.has(i.id) && isPriced(i) && i.companyId).map((i) => [i.id, i]));
  const noDate: Item[] = [];

  // Each company's days: the days its visits take already, and the hours of new work on each day.
  const busy = new Map<string, Set<string>>();
  for (const v of live) {
    if (visitEnd(v) < today) continue;
    const days = busy.get(v.companyId) ?? new Set<string>();
    for (let k = 0; k < Math.max(1, v.days); k++) days.add(addWorkingDays(workingDayOnOrAfter(v.start), k));
    busy.set(v.companyId, days);
  }
  const load = new Map<string, Map<string, number>>();
  const daysOf = new Map<string, string[]>();
  const lastPut = new Map<string, string>();

  /**
   * The first days from a day on that the company has room for the work: whole free days for work
   * longer than a day. Work with no estimate goes with the work placed just before it.
   */
  function put(item: Item, from: string): string[] {
    const company = item.companyId!;
    const taken = busy.get(company) ?? new Set<string>();
    const hours = load.get(company) ?? new Map<string, number>();
    load.set(company, hours);
    const need = item.hours ?? 0;
    const placed = (days: string[]) => {
      lastPut.set(company, days[days.length - 1]!);
      return days;
    };
    if (need === 0) {
      const near = lastPut.get(company);
      let day = workingDayOnOrAfter(near && near > from ? near : from);
      while (taken.has(day)) day = addWorkingDays(day, 1);
      hours.set(day, hours.get(day) ?? 0);
      return placed([day]);
    }
    let day = workingDayOnOrAfter(from);
    for (let guard = 0; guard < 5000; guard++, day = addWorkingDays(day, 1)) {
      if (taken.has(day)) continue;
      const on = hours.get(day) ?? 0;
      if (need <= DAY_HOURS) {
        if (on + need > DAY_HOURS + 1e-9) continue;
        hours.set(day, on + need);
        return placed([day]);
      }
      const run: string[] = [];
      let d = day;
      for (let k = 0; k < Math.ceil(need / DAY_HOURS - 1e-9); k++, d = addWorkingDays(d, 1)) {
        if (taken.has(d) || (hours.get(d) ?? 0) > 0) break;
        run.push(d);
      }
      if (run.length < Math.ceil(need / DAY_HOURS - 1e-9)) continue;
      let left = need;
      for (const r of run) {
        hours.set(r, Math.min(DAY_HOURS, left));
        left -= DAY_HOURS;
      }
      return placed(run);
    }
    return [day];
  }

  /**
   * When it can start, once what it waits on has dates: null while that is not known yet, never
   * when it cannot be. A Ready By that has passed with the item still not ready gives no date: what
   * it waits on is late, and the work is not booked until it is ready or has a new date.
   */
  function startOf(item: Item): string | null | 'never' {
    if (item.ready) return first;
    if (isDay(item.readyBy)) return item.readyBy < today ? 'never' : startAfter(item.readyBy, today);
    if (item.waitingOn.length > 0) return 'never';
    let last = '';
    let holding = 0;
    for (const id of item.waitingOnItems) {
      const task = byId.get(id);
      if (!task || task.status !== 'open') continue;
      holding += 1;
      const done = doneBy.get(id);
      if (done) {
        if (done > last) last = done;
      } else if (pending.has(id)) return null;
      else return 'never';
    }
    return holding === 0 ? first : startAfter(last, today);
  }

  // The work goes in the order it can start, location by location, each placed before what waits on it.
  while (pending.size > 0) {
    let next: { item: Item; from: string } | null = null;
    const never: Item[] = [];
    for (const item of pending.values()) {
      const from = startOf(item);
      if (from === null) continue;
      if (from === 'never') never.push(item);
      else if (!next || from < next.from || (from === next.from && inOrder(item, next.item) < 0)) next = { item, from };
    }
    if (never.length > 0) {
      for (const item of never) {
        pending.delete(item.id);
        noDate.push(item);
      }
      continue;
    }
    if (!next) {
      // Only work that waits on itself by way of other work is left.
      noDate.push(...pending.values());
      break;
    }
    const days = put(next.item, next.from);
    daysOf.set(next.item.id, days);
    doneBy.set(next.item.id, days[days.length - 1]!);
    pending.delete(next.item.id);
  }

  const bars: TimelineBar[] = [];
  for (const v of live) {
    const on = items.filter((i) => i.visitId === v.id && i.status !== 'removed');
    const stillOpen = on.filter((i) => i.status === 'open').sort(inOrder);
    const end = visitEnd(v);
    bars.push({
      key: v.id,
      companyId: v.companyId,
      start: workingDayOnOrAfter(v.start),
      days: Math.max(1, v.days),
      end,
      kind: v.confirmed ? 'confirmed' : 'planned',
      visit: v,
      items: stillOpen,
      time: stillOpen.length > 0 ? totalTime(stillOpen) : NO_TIME,
      pastDue: end < today && stillOpen.length > 0,
      done: on.length > 0 && stillOpen.length === 0,
    });
  }
  // A best guess: each run of working days in a row with new work for a company is one visit.
  for (const [company, hours] of load) {
    const days = [...hours.keys()].sort();
    let run: string[] = [];
    const close = () => {
      if (run.length === 0) return;
      const inRun = new Set(run);
      const work = [...daysOf]
        .filter(([id, d]) => byId.get(id)?.companyId === company && d.some((x) => inRun.has(x)))
        .map(([id, d]) => ({ item: byId.get(id)!, day: d[0]! }))
        .sort((a, b) => a.day.localeCompare(b.day) || inOrder(a.item, b.item))
        .map((x) => x.item);
      bars.push({
        key: `auto:${company}:${run[0]}`,
        companyId: company,
        start: run[0]!,
        days: run.length,
        end: run[run.length - 1]!,
        kind: 'auto',
        visit: null,
        items: work,
        time: totalTime(work),
        pastDue: false,
        done: false,
      });
      run = [];
    };
    for (const d of days) {
      if (run.length > 0 && addWorkingDays(run[run.length - 1]!, 1) !== d) close();
      run.push(d);
    }
    close();
  }
  bars.sort((a, b) => a.start.localeCompare(b.start) || a.companyId.localeCompare(b.companyId) || a.key.localeCompare(b.key));

  const ends = bars.filter((b) => !b.done && b.items.length > 0 && !b.pastDue).map((b) => b.end);
  return {
    bars,
    noDate: noDate.sort(inOrder),
    needsPrice,
    finish: ends.length > 0 ? ends.reduce((a, b) => (b > a ? b : a)) : null,
  };
}

/** Where a working day falls on a timeline that starts on a Monday: 0 for that Monday, 5 for the next. */
export function workingIndex(monday: string, day: string): number {
  const d = workingDayOnOrAfter(day);
  const weeks = Math.floor(daysBetween(monday, mondayOf(d)) / 7);
  return weeks * 5 + (weekdayOf(d) - 1);
}

/** The companies on a timeline, in the order their work starts. */
export function timelineRows(timeline: Timeline, from: string): { companyId: string; bars: TimelineBar[] }[] {
  const rows = new Map<string, TimelineBar[]>();
  for (const bar of timeline.bars) {
    if (bar.end < from && !bar.pastDue) continue;
    const list = rows.get(bar.companyId) ?? [];
    list.push(bar);
    rows.set(bar.companyId, list);
  }
  return [...rows]
    .map(([companyId, bars]) => ({ companyId, bars }))
    .sort((a, b) => a.bars[0]!.start.localeCompare(b.bars[0]!.start) || a.companyId.localeCompare(b.companyId));
}
