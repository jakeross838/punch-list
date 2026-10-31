// The rules the app enforces on every item, wherever it is written from. Buildertrend could not
// enforce these; the app can, so it does.

import { MAX_HOURS, tidyHours } from './time';
import type { Item, ItemKind, Person } from './types';

export const TITLE_MAX = 80;

export interface Problem {
  field: keyof Item;
  message: string;
}

export type ItemFields = Pick<
  Item,
  | 'title'
  | 'description'
  | 'tradeId'
  | 'companyId'
  | 'kind'
  | 'ready'
  | 'waitingOn'
  | 'waitingOnItems'
  | 'readyBy'
  | 'boughtOut'
  | 'poOrCo'
  | 'status'
  | 'completedBy'
  | 'completedAt'
  | 'extra'
  | 'unfinished'
  | 'visitId'
  | 'hours'
>;

/**
 * Everything that stops an item from saving, in plain words. An empty list means it saves. An
 * unfinished item may still be missing its title, company and trade; the other rules still hold.
 */
export function checkItem(item: ItemFields): Problem[] {
  const problems: Problem[] = [];
  const title = item.title.trim();
  if (title === '' && !item.unfinished) problems.push({ field: 'title', message: 'Give it a title' });
  if (title.length > TITLE_MAX) problems.push({ field: 'title', message: `Keep the title under ${TITLE_MAX} characters` });
  if (!item.companyId && !item.unfinished) problems.push({ field: 'companyId', message: 'Pick the company' });
  if (!item.tradeId && !item.unfinished) problems.push({ field: 'tradeId', message: 'Pick the trade' });
  if (!item.ready && item.waitingOn.every((w) => w.trim() === '') && item.waitingOnItems.length === 0) {
    problems.push({ field: 'waitingOn', message: 'Pick what it is waiting on' });
  }
  if (item.readyBy !== null && !/^\d{4}-\d{2}-\d{2}$/.test(item.readyBy)) {
    problems.push({ field: 'readyBy', message: 'Ready By must be a date' });
  }
  if (item.status === 'complete' && (!item.completedBy || !item.completedAt)) {
    problems.push({ field: 'status', message: 'A complete item records who completed it and when' });
  }
  if (item.status === 'complete' && item.unfinished) {
    problems.push({ field: 'status', message: 'Finish the draft before you mark it complete' });
  }
  if (item.hours !== null && !(item.hours > 0 && item.hours <= MAX_HOURS)) {
    problems.push({ field: 'hours', message: `Keep the estimated time under ${MAX_HOURS} hours` });
  }
  return problems;
}

/** What an unfinished item still needs, in the order the form asks for it. */
export function missingDetails(item: Pick<ItemFields, 'title' | 'companyId' | 'tradeId'>): ('title' | 'company' | 'trade')[] {
  const out: ('title' | 'company' | 'trade')[] = [];
  if (item.title.trim() === '') out.push('title');
  if (!item.companyId) out.push('company');
  if (!item.tradeId) out.push('trade');
  return out;
}

/** "Needs a title, company and trade." */
export function missingText(item: Pick<ItemFields, 'title' | 'companyId' | 'tradeId'>): string {
  const words = missingDetails(item);
  if (words.length === 0) return '';
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `Needs a ${list}`;
}

/**
 * Deficiencies and completion work are in the company's scope already; additional work is priced,
 * and ready to schedule, once it has its purchase order or change order number.
 */
export function isPriced(item: Pick<ItemFields, 'kind' | 'poOrCo'>): boolean {
  return item.kind !== 'added_scope' || Boolean(item.poOrCo?.trim());
}

/** Open, finished, ready and priced: work a company can be booked for now. */
export function readyToSchedule(item: Pick<Item, 'status' | 'unfinished' | 'ready' | 'kind' | 'poOrCo'>): boolean {
  return item.status === 'open' && !item.unfinished && item.ready && isPriced(item);
}

/** A Waiting On list tidied: trimmed, each one once, nothing empty. */
export function tidyWaitingOn(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const w = raw.trim().replace(/\s+/g, ' ');
    if (w !== '' && !out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(w);
  }
  return out;
}

/**
 * Tidies an item before it saves: trims text, and a ready item drops what it waits on and its Ready
 * By, which only mean something while it is not ready.
 */
export function tidyItem<T extends ItemFields>(item: T): T {
  const text = (v: string | null) => (v === null ? null : v.trim() === '' ? null : v.trim());
  const extra: Record<string, string | boolean | null> = {};
  for (const [k, v] of Object.entries(item.extra ?? {})) extra[k] = typeof v === 'string' ? text(v) : v;
  const out = {
    ...item,
    title: item.title.trim().replace(/\s+/g, ' '),
    description: item.description.trim(),
    waitingOn: tidyWaitingOn(item.waitingOn),
    waitingOnItems: [...new Set(item.waitingOnItems)],
    readyBy: text(item.readyBy),
    poOrCo: text(item.poOrCo),
    hours: tidyHours(item.hours),
    extra,
  };
  if (out.ready) {
    out.waitingOn = [];
    out.waitingOnItems = [];
    out.readyBy = null;
  }
  // Bought Out is not asked for: it follows the type and the order number.
  out.boughtOut = isPriced(out);
  // An unfinished item is finished the moment it has everything a finished item needs.
  if (out.unfinished && checkItem({ ...out, unfinished: false }).length === 0) out.unfinished = false;
  return out;
}

/** What choosing a type sets: Bought Out follows the type and any order number already there. */
export function kindDefaults(kind: ItemKind, current: Pick<Item, 'poOrCo'>): Pick<Item, 'kind' | 'boughtOut' | 'poOrCo'> {
  return { kind, boughtOut: isPriced({ kind, poOrCo: current.poOrCo }), poOrCo: current.poOrCo };
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

/** Only an active Ross Built person marks an item complete. */
export function complete<T extends ItemFields>(item: T, by: Person, at: Date = new Date()): T {
  if (!by.active) throw new RuleError('Only Ross Built can mark items complete');
  if (item.status === 'removed') throw new RuleError('Restore it to the list first');
  if (item.unfinished) throw new RuleError('Finish the draft before you mark it complete');
  return { ...item, status: 'complete', completedBy: by.id, completedAt: at.toISOString() };
}

export function reopen<T extends ItemFields>(item: T): T {
  if (item.status === 'removed') throw new RuleError('Restore it to the list instead');
  return { ...item, status: 'open', completedBy: null, completedAt: null };
}

/** Removing never deletes: the item stays, marked Removed, and drops off the lists and printouts. */
export function remove<T extends ItemFields>(item: T): T {
  return { ...item, status: 'removed' };
}

export function restore<T extends ItemFields>(item: T): T {
  if (item.status !== 'removed') return item;
  return { ...item, status: 'open', completedBy: null, completedAt: null };
}
