// Each company's work in the order to do it, numbered 1, 2, 3: so the company is always working on
// the thing that holds up the most other work, when it can. What it can do now comes first: an item
// marked Priority, then whatever holds up the most open work, counting everything that waits on it
// down the chain and across every company, then the most hours of it. What is not ready yet comes
// after, soonest ready first. Ties keep the order they came in: floor, trade and item number.

import { featureOn } from './features';
import type { Item } from './types';

/** What finishing an item frees up: the open items that wait on it, directly or down the chain, and their hours. */
export interface Freed {
  items: number;
  hours: number;
}

export const FREES_NOTHING: Freed = { items: 0, hours: 0 };

/**
 * For each open item, what finishing it frees up. Only open items hold anything up or count as
 * held up; an item that waits on itself through a chain does not count itself.
 */
export function freedWork(items: Pick<Item, 'id' | 'status' | 'waitingOnItems' | 'hours'>[]): Map<string, Freed> {
  const open = new Map(items.filter((i) => i.status === 'open').map((i) => [i.id, i]));
  // Who waits on each item, directly.
  const waiters = new Map<string, string[]>();
  for (const item of open.values()) {
    for (const on of item.waitingOnItems) {
      if (!open.has(on)) continue;
      const list = waiters.get(on);
      if (list) list.push(item.id);
      else waiters.set(on, [item.id]);
    }
  }
  const out = new Map<string, Freed>();
  for (const id of open.keys()) {
    const seen = new Set<string>();
    const next = [...(waiters.get(id) ?? [])];
    while (next.length > 0) {
      const w = next.pop()!;
      if (w === id || seen.has(w)) continue;
      seen.add(w);
      for (const after of waiters.get(w) ?? []) next.push(after);
    }
    let hours = 0;
    for (const w of seen) hours += open.get(w)?.hours ?? 0;
    out.set(id, { items: seen.size, hours });
  }
  return out;
}

/** What the order goes by, for one item. */
export interface WorkFacts {
  ready: boolean;
  priority?: boolean | null;
  /** When it should be ready, for an item that is not. */
  readyBy?: string | null;
  freed: Freed;
}

/** Which of two items to do first: below zero for a, above for b, zero to keep them as they came. */
export function doFirst(a: WorkFacts, b: WorkFacts): number {
  if (a.ready !== b.ready) return a.ready ? -1 : 1;
  if (!a.ready) {
    const when = (a.readyBy || '9999-12-31').localeCompare(b.readyBy || '9999-12-31');
    if (when !== 0) return when;
  }
  // The hours held up break a tie only while times are switched on: with them out of sight, the order
  // goes by what can be seen.
  return Number(!!b.priority) - Number(!!a.priority) || b.freed.items - a.freed.items || (featureOn('hours') ? b.freed.hours - a.freed.hours : 0);
}

/** What an item holds up, as it reads on a list: "Holds up 3 items". Empty when it holds up nothing. */
export function freesText(freed: Freed): string {
  if (freed.items <= 0) return '';
  return `Holds up ${freed.items === 1 ? '1 item' : `${freed.items} items`}`;
}
