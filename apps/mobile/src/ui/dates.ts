// Dates are stored as YYYY-MM-DD and shown in words, with the month spelled out.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromIso(iso: string): Date {
  const p = parts(iso);
  return p ? new Date(p[0], p[1] - 1, p[2]) : new Date();
}

export function todayIso(): string {
  return isoFromDate(new Date());
}

/** "November 2, 2026". */
export function longDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}

/** "November 2" this year, "January 4, 2027" otherwise. */
export function shortDate(iso: string, today: Date = new Date()): string {
  const p = parts(iso);
  if (!p) return iso;
  return p[0] === today.getFullYear() ? `${MONTHS[p[1] - 1]} ${p[2]}` : longDate(iso);
}

/** "October 29" from an ISO time, for when an item was completed. */
export function dayOf(isoTime: string): string {
  return shortDate(isoFromDate(new Date(isoTime)));
}

export function isBeforeToday(iso: string, today: Date = new Date()): boolean {
  return iso < isoFromDate(today);
}
