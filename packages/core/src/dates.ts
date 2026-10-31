// Days on the schedule are calendar days written YYYY-MM-DD, counted on the job's own calendar, so
// time zones never move a date. Working days are Monday to Friday, less the holidays builders take:
// New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and the day after, and
// Christmas Day. One that falls on a Saturday is taken the Friday before; on a Sunday, the Monday
// after. A visit booked on a holiday keeps its day: someone chose it.

const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

function toDays(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY;
}

function fromDays(n: number): string {
  const d = new Date(n * DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The day a moment falls on, where the phone is. */
export function dayOfDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDay(text: string | null | undefined): text is string {
  return !!text && /^\d{4}-\d{2}-\d{2}$/.test(text);
}

/** Calendar days from one day to another: 1 from Monday to Tuesday, negative going back. */
export function daysBetween(from: string, to: string): number {
  return Math.round(toDays(to) - toDays(from));
}

export function addDays(ymd: string, n: number): string {
  return fromDays(toDays(ymd) + n);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(toDays(ymd) * DAY).getUTCDay();
}

export function isWeekday(ymd: string): boolean {
  const w = weekdayOf(ymd);
  return w !== 0 && w !== 6;
}

export interface Holiday {
  day: string;
  name: string;
}

/** The day of the month a weekday falls on for the nth time (1 the first), or the last time with n = -1. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = `${year}-${pad(month)}-01`;
    return addDays(first, ((weekday - weekdayOf(first) + 7) % 7) + (n - 1) * 7);
  }
  const last = addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`, -1);
  return addDays(last, -((weekdayOf(last) - weekday + 7) % 7));
}

/** The day off for a holiday on a set date: the Friday before a Saturday, the Monday after a Sunday. */
function observed(ymd: string): string {
  const w = weekdayOf(ymd);
  return w === 6 ? addDays(ymd, -1) : w === 0 ? addDays(ymd, 1) : ymd;
}

const holidayYears = new Map<number, Map<string, string>>();

/** The holidays of a year, in order, each on the day it is taken off. */
export function holidaysOf(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    { day: observed(`${year}-01-01`), name: "New Year's Day" },
    { day: nthWeekday(year, 5, 1, -1), name: 'Memorial Day' },
    { day: observed(`${year}-07-04`), name: 'Independence Day' },
    { day: nthWeekday(year, 9, 1, 1), name: 'Labor Day' },
    { day: thanksgiving, name: 'Thanksgiving' },
    { day: addDays(thanksgiving, 1), name: 'the day after Thanksgiving' },
    { day: observed(`${year}-12-25`), name: 'Christmas Day' },
  ];
}

function holidayMap(year: number): Map<string, string> {
  let map = holidayYears.get(year);
  if (!map) {
    map = new Map(holidaysOf(year).map((h) => [h.day, h.name]));
    holidayYears.set(year, map);
  }
  return map;
}

/** The holiday taken on a day, or null. New Year's Day taken on December 31 counts too. */
export function holidayOn(ymd: string): string | null {
  const year = Number(ymd.slice(0, 4));
  return holidayMap(year).get(ymd) ?? holidayMap(year + 1).get(ymd) ?? null;
}

/** A weekday that is not a holiday. */
export function isWorkingDay(ymd: string): boolean {
  return isWeekday(ymd) && holidayOn(ymd) === null;
}

/** The day itself when it is a weekday, otherwise the Monday after. */
export function weekdayOnOrAfter(ymd: string): string {
  let d = ymd;
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

/** The day itself when it is a working day, otherwise the next one. */
export function workingDayOnOrAfter(ymd: string): string {
  let d = ymd;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

/** n working days after a day (n = 1 from Friday is Monday). */
export function addWorkingDays(ymd: string, n: number): string {
  let d = ymd;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

/** The Monday of the week a day falls in. */
export function mondayOf(ymd: string): string {
  const w = weekdayOf(ymd);
  return addDays(ymd, w === 0 ? -6 : 1 - w);
}

/** The first day of a company's visit: the day it was booked, or the Monday after a weekend. */
export function visitStart(visit: { start: string }): string {
  return weekdayOnOrAfter(visit.start);
}

/** The last working day of a company's visit: its first day and how many working days it takes, holidays skipped. */
export function visitEnd(visit: { start: string; days: number }): string {
  return addWorkingDays(visitStart(visit), Math.max(1, visit.days) - 1);
}

/** Each day of a visit, its first day first. */
export function visitDays(visit: { start: string; days: number }): string[] {
  const first = visitStart(visit);
  return Array.from({ length: Math.max(1, visit.days) }, (_, k) => addWorkingDays(first, k));
}

/** The holidays from one day to another, both included. */
export function holidaysBetween(from: string, to: string): Holiday[] {
  const out: Holiday[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)) + 1; year++) {
    for (const h of holidaysOf(year)) if (h.day >= from && h.day <= to && !out.some((x) => x.day === h.day)) out.push(h);
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Holidays as they are said: the day after Thanksgiving goes with Thanksgiving. */
export function holidayGroups(list: Holiday[]): { name: string; days: string[] }[] {
  const out: { name: string; days: string[] }[] = [];
  for (const h of list) {
    const base = h.name.startsWith('the day after ') ? h.name.slice('the day after '.length) : h.name;
    const last = out[out.length - 1];
    if (last && last.name === base && daysBetween(last.days[last.days.length - 1]!, h.day) === 1) last.days.push(h.day);
    else out.push({ name: base, days: [h.day] });
  }
  return out;
}
