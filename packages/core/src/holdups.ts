// Keeping the list current with less work: a holdup is cleared once for every item it holds up,
// finished work frees what was waiting on it in that room, and the same item is not written twice.

import { tidyWaitingOn, type ItemFields as Fields } from './rules';
import { tidyTitle } from './titles';
import type { Item } from './types';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One holdup is done: it comes off the item's Waiting On. With nothing else left to wait on, the
 * item is ready.
 */
export function clearHoldup(item: Pick<Fields, 'ready' | 'waitingOn' | 'readyBy'>, holdup: string): Pick<Fields, 'ready' | 'waitingOn' | 'readyBy'> {
  const waitingOn = item.waitingOn.filter((w) => !same(w, holdup));
  if (waitingOn.length === 0) return { ready: true, waitingOn: [], readyBy: null };
  return { ready: false, waitingOn, readyBy: item.readyBy };
}

/**
 * The items a finished item frees: open items in the same room that wait on its company, once that
 * company has nothing else open in the room.
 */
export function freedBy(done: Item, items: Item[], companyName: string | undefined): Item[] {
  if (!companyName || !done.companyId) return [];
  const stillOpen = items.some(
    (i) => i.id !== done.id && i.locationId === done.locationId && i.companyId === done.companyId && i.status === 'open',
  );
  if (stillOpen) return [];
  return items.filter(
    (i) => i.id !== done.id && i.locationId === done.locationId && i.status === 'open' && !i.ready && i.waitingOn.some((w) => same(w, companyName)),
  );
}

/**
 * A company renamed: the items that wait on it by its old name, with the new name in its place, so
 * they still wait on it.
 */
export function renamedHoldups(items: Pick<Item, 'id' | 'waitingOn'>[], from: string, to: string): { id: string; waitingOn: string[] }[] {
  if (same(from, to)) return [];
  return items
    .filter((i) => i.waitingOn.some((w) => same(w, from)))
    .map((i) => ({ id: i.id, waitingOn: tidyWaitingOn(i.waitingOn.map((w) => (same(w, from) ? to : w))) }));
}

/** Open items already in the room with the same title. */
export function duplicatesOf(title: string, locationId: string, items: Item[], selfId?: string): Item[] {
  const t = tidyTitle(title).toLowerCase();
  if (t === '') return [];
  return items.filter((i) => i.id !== selfId && i.locationId === locationId && i.status === 'open' && tidyTitle(i.title).toLowerCase() === t);
}
