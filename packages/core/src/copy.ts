// Copy and paste, and the order of a list. Copied items paste as new open items: the same title,
// description, company, type, time and added fields, with no visit, photo or history of their own.
// Copies keep waiting on each other; a wait on a task left behind becomes a wait on the same task in
// the new location when there is one, and otherwise drops. An item already open on the list there
// is left out. Dragging puts items where they were dropped, and the rest of that list keeps its
// order around them.

import { isPriced, tidyItem } from './rules';
import { sortItems, sortKey } from './views';
import type { ItemFields } from './rules';
import type { Item } from './types';

/** A new item made by Paste or by a template, with its id made before it is saved, so copies can wait on each other. */
export interface PlannedItem extends ItemFields {
  id: string;
  jobId: string;
  locationId: string;
  source: 'copy' | 'template';
}

export interface PastePlan {
  items: PlannedItem[];
  /** Left out: the same title is already open on the list in that location. */
  skipped: Item[];
}

const titleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

/** The open item with the same title in a location, if there is one. */
export function twinIn(title: string, locationId: string, items: Item[], withDone = false): Item | undefined {
  const t = titleKey(title);
  if (t === '') return undefined;
  return items.find(
    (i) => i.locationId === locationId && (i.status === 'open' || (withDone && i.status === 'complete')) && titleKey(i.title) === t,
  );
}

/**
 * What pasting copied items into a location makes. existing: the items already on the target job.
 * newId makes the ids of the copies.
 */
export function pastePlan(copied: Item[], target: { jobId: string; locationId: string }, existing: Item[], newId: () => string): PastePlan {
  const ordered = sortItems(copied.filter((i) => i.status !== 'removed'));
  const sameJob = ordered.every((i) => i.jobId === target.jobId);
  // Each copy's new id, or the item already there that takes its place.
  const placed = new Map<string, string>();
  const skipped: Item[] = [];
  const landing: Item[] = [];
  const seen = new Set<string>();
  for (const item of ordered) {
    const twin = twinIn(item.title, target.locationId, existing);
    const key = titleKey(item.title);
    if (twin) {
      placed.set(item.id, twin.id);
      skipped.push(item);
    } else if (key !== '' && seen.has(key)) {
      // The same title twice in what was copied lands once.
      skipped.push(item);
    } else {
      placed.set(item.id, newId());
      if (key !== '') seen.add(key);
      landing.push(item);
    }
  }
  // A copy that waits on one that already took the same title's place waits on that one.
  for (const item of skipped) if (!placed.has(item.id)) placed.set(item.id, placed.get(landing.find((l) => titleKey(l.title) === titleKey(item.title))!.id)!);
  const byId = new Map(existing.map((i) => [i.id, i]));
  /**
   * A wait on a task that was not copied: the same task in the new location when it is there (a
   * copy of the shower glass waits on that bathroom's own caulking), else the task itself when the
   * copy stays in the same location; otherwise it no longer waits on it.
   */
  const leftBehind = (item: Item, w: string): string[] => {
    const first = byId.get(w);
    if (!first || first.status !== 'open') return [];
    const there = twinIn(first.title, target.locationId, existing);
    if (there) return [there.id];
    return sameJob && item.locationId === target.locationId ? [w] : [];
  };

  const items = landing.map((item): PlannedItem => {
    const waits = item.waitingOnItems.flatMap((w) => (placed.has(w) ? [placed.get(w)!] : leftBehind(item, w)));
    const id = placed.get(item.id)!;
    const waitingOnItems = waits.filter((w) => w !== id);
    const readyBy = sameJob ? item.readyBy : null;
    const ready = item.ready || (item.waitingOn.length === 0 && waitingOnItems.length === 0 && readyBy === null);
    // An order number belongs to the original's own order: the copy is to be quoted again.
    const poOrCo = item.kind === 'added_scope' ? null : item.poOrCo;
    const fields: ItemFields = {
      assignedTo: sameJob ? item.assignedTo : null,
      title: item.title,
      description: item.description,
      tradeId: item.tradeId,
      companyId: item.companyId,
      kind: item.kind,
      ready,
      waitingOn: item.waitingOn,
      waitingOnItems,
      readyBy,
      boughtOut: isPriced({ kind: item.kind, poOrCo }),
      poOrCo,
      status: 'open',
      completedBy: null,
      completedAt: null,
      extra: item.extra,
      unfinished: item.unfinished,
      visitId: null,
      hours: item.hours,
    };
    return { ...tidyItem(fields), id, jobId: target.jobId, locationId: target.locationId, source: 'copy' };
  });
  return { items: firstThingsFirst(items), skipped };
}

/**
 * New items in an order where each comes after anything new it waits on, otherwise as they were:
 * saved in this order, every wait points at an item that is already there.
 */
export function firstThingsFirst<T extends { id: string; waitingOnItems: string[] }>(items: T[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: T[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const place = (item: T) => {
    if (placed.has(item.id) || visiting.has(item.id)) return;
    visiting.add(item.id);
    for (const w of item.waitingOnItems) {
      const first = byId.get(w);
      if (first) place(first);
    }
    visiting.delete(item.id);
    placed.add(item.id);
    out.push(item);
  };
  for (const item of items) place(item);
  return out;
}

/**
 * Where a dragged row can go in a list that keeps its groups together (each trade's items, say):
 * within its own group's run. Let go among another group's rows, it goes to the nearer end of its
 * own. Returns the row it goes before, or null for the end of the list.
 */
export function keepTogether<T extends { id: string }>(list: T[], movedId: string, before: string | null, groupOf: (row: T) => string): string | null {
  const moved = list.find((r) => r.id === movedId);
  if (!moved) return before;
  const group = groupOf(moved);
  const own = list.map((r, i) => (groupOf(r) === group ? i : -1)).filter((i) => i >= 0);
  const first = own[0]!;
  const last = own[own.length - 1]!;
  const at = before === null ? list.length : list.findIndex((r) => r.id === before);
  const into = at < 0 ? list.length : Math.min(Math.max(at, first), last + 1);
  return into < list.length ? list[into]!.id : null;
}

/**
 * Items dropped into a list before another one (or at the end when before is null): the position
 * each item in the list needs now, only for the ones that change. list is the list as it shows;
 * moved can come from it or from somewhere else, and keep their order. The list's own sort keys are
 * used again, so it stays in step with items added later, which go at the end.
 */
export function dropAt(list: Item[], moved: Item[], before: string | null): { id: string; position: number }[] {
  const movedIds = new Set(moved.map((m) => m.id));
  const rest = list.filter((i) => !movedIds.has(i.id));
  const at = before === null ? rest.length : Math.max(0, rest.findIndex((i) => i.id === before));
  const order = [...rest.slice(0, at), ...sortItems(moved), ...rest.slice(at)];
  // The keys the list had, plus those of anything coming in, smallest first; ties are spread apart.
  const keys = [...list, ...moved.filter((m) => !list.some((i) => i.id === m.id))]
    .map((i) => sortKey(i) ?? 0)
    .sort((a, b) => a - b);
  for (let k = 1; k < keys.length; k += 1) if (keys[k]! <= keys[k - 1]!) keys[k] = keys[k - 1]! + 0.5;
  const changes: { id: string; position: number }[] = [];
  order.forEach((item, n) => {
    const position = keys[n]!;
    if (sortKey(item) !== position) changes.push({ id: item.id, position });
  });
  return changes;
}
