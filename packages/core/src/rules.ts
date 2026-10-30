// The rules the app enforces on every item, wherever it is written from. Buildertrend could not
// enforce these; the app can, so it does.

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
  | 'readyBy'
  | 'boughtOut'
  | 'poOrCo'
  | 'status'
  | 'completedBy'
  | 'completedAt'
  | 'extra'
  | 'unfinished'
  | 'visitId'
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
  if (!item.companyId && !item.unfinished) problems.push({ field: 'companyId', message: 'Pick the company doing the work' });
  if (!item.tradeId && !item.unfinished) problems.push({ field: 'tradeId', message: 'Pick the trade' });
  if (!item.ready && item.waitingOn.every((w) => w.trim() === '')) {
    problems.push({ field: 'waitingOn', message: 'Not ready: say what it is waiting on' });
  }
  if (item.readyBy !== null && !/^\d{4}-\d{2}-\d{2}$/.test(item.readyBy)) {
    problems.push({ field: 'readyBy', message: 'Ready By must be a date' });
  }
  if (item.kind === 'added_scope' && item.boughtOut && !item.poOrCo?.trim()) {
    problems.push({ field: 'poOrCo', message: 'Added scope is Bought Out only once it has a PO or CO' });
  }
  if (item.status === 'complete' && (!item.completedBy || !item.completedAt)) {
    problems.push({ field: 'status', message: 'A complete item records who completed it and when' });
  }
  if (item.status === 'complete' && item.unfinished) {
    problems.push({ field: 'status', message: 'Finish the item before it is completed' });
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

/** "Needs a title and a company." */
export function missingText(item: Pick<ItemFields, 'title' | 'companyId' | 'tradeId'>): string {
  const words = missingDetails(item).map((m) => `a ${m}`);
  if (words.length === 0) return '';
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `Needs ${list}`;
}

/** Deficiencies are the company's own work; added scope is ready to schedule only once it is priced. */
export function isPriced(item: Pick<ItemFields, 'kind' | 'boughtOut'>): boolean {
  return item.kind === 'deficiency' || item.boughtOut;
}

/** Open, finished, ready and priced: work a company can be booked for now. */
export function readyToSchedule(item: Pick<Item, 'status' | 'unfinished' | 'ready' | 'kind' | 'boughtOut'>): boolean {
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
 * Tidies an item before it saves: trims text, and a ready item drops its Waiting On and Ready By,
 * which only mean something while it is not ready.
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
    readyBy: text(item.readyBy),
    poOrCo: text(item.poOrCo),
    extra,
  };
  if (out.ready) {
    out.waitingOn = [];
    out.readyBy = null;
  }
  // An unfinished item is finished the moment it has everything a finished item needs.
  if (out.unfinished && checkItem({ ...out, unfinished: false }).length === 0) out.unfinished = false;
  return out;
}

/**
 * What choosing Deficiency or Added Scope pre-fills. A deficiency is the company's own work, so it
 * is Bought Out with no PO or CO. Added scope stays not Bought Out until a PO or CO is entered.
 */
export function kindDefaults(kind: ItemKind, current: Pick<Item, 'poOrCo'>): Pick<Item, 'kind' | 'boughtOut' | 'poOrCo'> {
  if (kind === 'deficiency') return { kind, boughtOut: true, poOrCo: null };
  return { kind, boughtOut: Boolean(current.poOrCo?.trim()), poOrCo: current.poOrCo };
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

/** Only an active Ross Built person marks an item complete. */
export function complete<T extends ItemFields>(item: T, by: Person, at: Date = new Date()): T {
  if (!by.active) throw new RuleError('Only an active Ross Built user can mark an item complete');
  if (item.status === 'removed') throw new RuleError('A removed item cannot be completed; restore it first');
  if (item.unfinished) throw new RuleError('Finish the item before it is completed');
  return { ...item, status: 'complete', completedBy: by.id, completedAt: at.toISOString() };
}

export function reopen<T extends ItemFields>(item: T): T {
  if (item.status === 'removed') throw new RuleError('A removed item is restored, not reopened');
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
