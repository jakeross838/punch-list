// Estimated time: about how long each item takes, in hours, so the work adds up for every location,
// trade, company and visit, and ready work can be planned in full days. A working day is 8 hours.
// Times are said in words, never abbreviated: "30 minutes", "1 hour", "2.5 hours", "about 2 days".

import type { Item } from './types';

/** A working day, in hours. */
export const DAY_HOURS = 8;
/** The most one item can be estimated at: 25 working days. */
export const MAX_HOURS = 200;
/** The times one tap away on the form. */
export const QUICK_HOURS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];
/** Every time the picker offers, for the rest. */
export const PICK_HOURS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 24, 32, 40];

/** An estimate tidied: rounded to the quarter hour, a quarter hour at the least, or nothing. */
export function tidyHours(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_HOURS, Math.max(0.25, Math.round(n * 4) / 4));
}

/** 2.5, 13.75: no trailing zeros. */
const number = (n: number) => String(Math.round(n * 100) / 100);

/** "15 minutes", "1 hour", "2.5 hours". */
export function hoursText(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${number(hours)} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** Working days, up to the next half day: "half a day", "1 day", "1.5 days". */
export function daysText(hours: number): string {
  const halves = Math.max(1, Math.ceil(hours / (DAY_HOURS / 2) - 1e-9));
  if (halves === 1) return 'half a day';
  const days = halves / 2;
  return `${number(days)} ${days === 1 ? 'day' : 'days'}`;
}

/** The whole working days the work fills, at least one: what a visit needs. */
export function daysFor(hours: number): number {
  return Math.max(1, Math.ceil(hours / DAY_HOURS - 1e-9));
}

export interface TimeTotal {
  /** The estimates added up. */
  hours: number;
  /** How many have an estimate. */
  timed: number;
  /** How many have none yet. */
  untimed: number;
}

export const NO_TIME: TimeTotal = { hours: 0, timed: 0, untimed: 0 };

/** The estimates of these items added up, and how many have none yet. */
export function totalTime(items: Pick<Item, 'hours'>[]): TimeTotal {
  let hours = 0;
  let timed = 0;
  for (const i of items) {
    if (i.hours !== null && i.hours > 0) {
      hours += i.hours;
      timed += 1;
    }
  }
  return { hours: Math.round(hours * 100) / 100, timed, untimed: items.length - timed };
}

/** "6.5 hours", "6.5 hours, 2 not estimated", "3 not estimated", or nothing when there are no items. */
export function totalText(total: TimeTotal): string {
  const parts: string[] = [];
  if (total.timed > 0) parts.push(hoursText(total.hours));
  if (total.untimed > 0) parts.push(`${total.untimed} not estimated`);
  return parts.join(', ');
}

/**
 * Work for a set number of hours, picked in the order given (floor order, location by location, so
 * a company works its way through the house): each item that still fits goes in, one that would run
 * over is passed for a smaller one after it. Only items with an estimate are picked.
 */
export function fillHours<T extends Pick<Item, 'id' | 'hours'>>(items: T[], hours: number): T[] {
  const out: T[] = [];
  let left = hours + 1e-9;
  for (const item of items) {
    if (item.hours === null || item.hours <= 0) continue;
    if (item.hours <= left) {
      out.push(item);
      left -= item.hours;
    }
  }
  return out;
}

export interface WorkDay {
  /** The items for the day, in the order given. */
  items: string[];
  hours: number;
}

/**
 * Ready work split into full working days, in the order given: each day takes what fits, the way
 * fillHours picks. An item longer than a day gets days of its own. Items with no estimate are left
 * out; say how many separately.
 */
export function workDays<T extends Pick<Item, 'id' | 'hours'>>(items: T[]): WorkDay[] {
  let rest = items.filter((i) => i.hours !== null && i.hours > 0);
  const days: WorkDay[] = [];
  while (rest.length > 0) {
    const first = rest[0]!;
    if ((first.hours ?? 0) >= DAY_HOURS) {
      days.push({ items: [first.id], hours: first.hours! });
      rest = rest.slice(1);
      continue;
    }
    const day = fillHours(rest, DAY_HOURS);
    const picked = new Set(day.map((i) => i.id));
    days.push({ items: day.map((i) => i.id), hours: Math.round(day.reduce((n, i) => n + (i.hours ?? 0), 0) * 100) / 100 });
    rest = rest.filter((i) => !picked.has(i.id));
  }
  return days;
}
