// What an item waits on. Mostly other tasks on the list that have to be done first, usually one:
// "Set upper cabinets" waits on "Install range backsplash". For what is not a task on the list (the
// owner picking a fixture, the design team, Ross Built) it waits on who. A task that is done or
// removed holds nothing up, and an item with nothing left to wait on is ready. Its Ready By is its
// own date when it has one; otherwise the day the tasks it waits on are scheduled to be done.

import { isDay, visitEnd } from './dates';
import type { ItemFields } from './rules';
import type { Company, Item, Location, Visit } from './types';
import { waitingOnText } from './waitingOn';

export interface HoldLookups {
  items: Map<string, Item>;
  /** Company names by id. */
  companies: Map<string, string>;
  /** Location labels by id. */
  locations: Map<string, string>;
  /** The live visits by id. */
  visits: Map<string, Visit>;
  /** Today. A task whose visit is over and still not done gives no date for what waits on it. */
  today?: string;
}

export function holdLookups(input: {
  items: Item[];
  companies: Pick<Company, 'id' | 'name'>[];
  locations: Pick<Location, 'id' | 'label'>[];
  visits?: Visit[];
  today?: string;
}): HoldLookups {
  return {
    items: new Map(input.items.map((i) => [i.id, i])),
    companies: new Map(input.companies.map((c) => [c.id, c.name])),
    locations: new Map(input.locations.map((l) => [l.id, l.label])),
    visits: new Map((input.visits ?? []).filter((v) => !v.removed).map((v) => [v.id, v])),
    today: input.today,
  };
}

/** Still to be done: a task that is complete or removed holds nothing up. */
const holdsUp = (task: Item | undefined): task is Item => !!task && task.status === 'open';

/** The tasks it waits on that are still open, in the order they were picked. */
export function openHolds(item: Pick<Item, 'waitingOnItems'>, look: HoldLookups): Item[] {
  return item.waitingOnItems.map((id) => look.items.get(id)).filter(holdsUp);
}

/**
 * A task as it reads where something waits on it: "Install range backsplash (Volcano Stone)", and
 * where it is when that is somewhere else: "Install range backsplash (Volcano Stone, Kitchen 109)".
 */
export function taskText(task: Item, look: HoldLookups, here?: string): string {
  const title = task.title.trim() || 'A draft';
  const company = task.companyId ? look.companies.get(task.companyId) : undefined;
  const where = task.locationId !== here ? look.locations.get(task.locationId) : undefined;
  const about = [company, where].filter(Boolean).join(', ');
  return about ? `${title} (${about})` : title;
}

/**
 * Everything it waits on, as it reads after "Waiting on": the tasks first, then anyone else.
 * "Install range backsplash (Volcano Stone) and Owner". Empty when nothing holds it up. With
 * everywhere, a task's location is said even when it is the item's own (for a heading over items
 * from several locations).
 */
export function holdText(item: Pick<Item, 'waitingOnItems' | 'waitingOn' | 'locationId'>, look: HoldLookups, options: { everywhere?: boolean } = {}): string {
  const here = options.everywhere ? undefined : item.locationId;
  return waitingOnText([...openHolds(item, look).map((t) => taskText(t, look, here)), ...item.waitingOn]);
}

/**
 * Who holds it up, by name: the company doing each task it waits on, then anyone else, each once.
 * What the job groups and filters by, so everything waiting on Volcano Stone's work shows together.
 */
export function holdNames(item: Pick<Item, 'waitingOnItems' | 'waitingOn'>, look: HoldLookups): string[] {
  const out: string[] = [];
  const add = (name: string | undefined) => {
    const n = name?.trim();
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  };
  for (const task of openHolds(item, look)) add(task.companyId ? look.companies.get(task.companyId) : 'A company not set');
  for (const w of item.waitingOn) add(w);
  return out;
}

/**
 * When it should be ready: its own Ready By when it has one; otherwise the last day the tasks it
 * waits on are scheduled for, once every one of them is on a visit and nothing else holds it up.
 * Null when that is not known yet, or when a visit is over and its task still is not done.
 */
export function readyByOf(item: Pick<Item, 'ready' | 'readyBy' | 'waitingOnItems' | 'waitingOn'>, look: HoldLookups): string | null {
  if (item.ready) return null;
  if (isDay(item.readyBy)) return item.readyBy;
  const tasks = openHolds(item, look);
  if (tasks.length === 0 || item.waitingOn.length > 0) return null;
  let last = '';
  for (const task of tasks) {
    const visit = task.visitId ? look.visits.get(task.visitId) : undefined;
    if (!visit) return null;
    const end = visitEnd(visit);
    if (look.today && end < look.today) return null;
    if (end > last) last = end;
  }
  return last || null;
}

/** Everything that waits on an item, and everything that waits on those, and so on. */
export function waitingOnIt(itemId: string, items: Pick<Item, 'id' | 'waitingOnItems'>[]): Set<string> {
  const out = new Set<string>();
  const queue = [itemId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const i of items) {
      if (!out.has(i.id) && i.waitingOnItems.includes(id)) {
        out.add(i.id);
        queue.push(i.id);
      }
    }
  }
  return out;
}

/**
 * The tasks an item can wait on: open, finished tasks on the job, not itself, and none that already
 * wait on it, so nothing ends up waiting on itself.
 */
export function holdChoices(itemId: string | null, items: Item[]): Item[] {
  const after = itemId ? waitingOnIt(itemId, items) : new Set<string>();
  return items.filter((i) => i.id !== itemId && i.status === 'open' && !i.unfinished && !after.has(i.id));
}

export type HoldFields = Pick<ItemFields, 'ready' | 'waitingOn' | 'waitingOnItems' | 'readyBy'>;

/** What an item's waiting looks like with nothing left to wait on. */
export const READY: HoldFields = { ready: true, waitingOn: [], waitingOnItems: [], readyBy: null };

/** One change finishing a task makes: the item that waited on it, and its waiting after. */
export interface Release {
  item: Item;
  patch: HoldFields;
  /** Nothing else holds it up, so it is ready now. */
  ready: boolean;
}

/**
 * What finishing (or removing) a task frees: each open item that waits on it, with it taken off
 * (and any other task already done). An item with nothing left to wait on is ready.
 */
export function releasedBy(doneId: string, items: Item[]): Release[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: Release[] = [];
  for (const item of items) {
    if (item.status !== 'open' || item.ready || !item.waitingOnItems.includes(doneId)) continue;
    const rest = item.waitingOnItems.filter((id) => id !== doneId && holdsUp(byId.get(id)));
    const ready = rest.length === 0 && item.waitingOn.length === 0;
    out.push({ item, ready, patch: ready ? READY : { ready: false, waitingOn: item.waitingOn, waitingOnItems: rest, readyBy: item.readyBy } });
  }
  return out;
}
