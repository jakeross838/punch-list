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
  'title' | 'description' | 'tradeId' | 'companyId' | 'kind' | 'ready' | 'waitingOn' | 'readyBy' | 'boughtOut' | 'poOrCo' | 'status' | 'completedBy' | 'completedAt'
>;

/** Everything that stops an item from saving, in plain words. An empty list means it saves. */
export function checkItem(item: ItemFields): Problem[] {
  const problems: Problem[] = [];
  const title = item.title.trim();
  if (title === '') problems.push({ field: 'title', message: 'Give it a title' });
  if (title.length > TITLE_MAX) problems.push({ field: 'title', message: `Keep the title under ${TITLE_MAX} characters` });
  if (!item.companyId) problems.push({ field: 'companyId', message: 'Pick the company doing the work' });
  if (!item.tradeId) problems.push({ field: 'tradeId', message: 'Pick the trade' });
  if (!item.ready && !item.waitingOn?.trim()) {
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
  return problems;
}

/**
 * Tidies an item before it saves: trims text, and a ready item drops its Waiting On and Ready By,
 * which only mean something while it is not ready.
 */
export function tidyItem<T extends ItemFields>(item: T): T {
  const text = (v: string | null) => (v === null ? null : v.trim() === '' ? null : v.trim());
  const out = {
    ...item,
    title: item.title.trim().replace(/\s+/g, ' '),
    description: item.description.trim(),
    waitingOn: text(item.waitingOn),
    readyBy: text(item.readyBy),
    poOrCo: text(item.poOrCo),
  };
  if (out.ready) {
    out.waitingOn = null;
    out.readyBy = null;
  }
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
