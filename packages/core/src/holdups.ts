// Keeping the list current with less work: a holdup is cleared once for every item it holds up,
// finished work frees what was waiting on it in that room, and the same item is not written twice.

import { READY, type HoldFields, type HoldLookups } from './holds';
import { tidyWaitingOn } from './rules';
import { tidyTitle } from './titles';
import type { Item } from './types';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One holdup is done: it comes off what the item waits on, whether it is a name it waits on or the
 * company doing a task it waits on (with the lookups to tell). With nothing else left to wait on,
 * the item is ready.
 */
export function clearHoldup(item: HoldFields, holdup: string, look?: HoldLookups): HoldFields {
  const waitingOn = item.waitingOn.filter((w) => !same(w, holdup));
  const waitingOnItems = look
    ? item.waitingOnItems.filter((id) => {
        const task = look.items.get(id);
        if (!task || task.status !== 'open') return false;
        const company = task.companyId ? look.companies.get(task.companyId) : undefined;
        return !(company && same(company, holdup));
      })
    : item.waitingOnItems;
  if (waitingOn.length === 0 && waitingOnItems.length === 0) return READY;
  return { ready: false, waitingOn, waitingOnItems, readyBy: item.readyBy };
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
