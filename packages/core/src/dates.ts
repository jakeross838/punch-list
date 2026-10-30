// Days on the schedule are calendar days written YYYY-MM-DD, counted on the job's own calendar, so
// time zones never move a date. Working days are Monday to Friday.

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

export function isWorkingDay(ymd: string): boolean {
  const w = weekdayOf(ymd);
  return w !== 0 && w !== 6;
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
