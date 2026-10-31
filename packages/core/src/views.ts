// How the lists are cut: by location (floor order), by trade, by company or by what items wait on,
// narrowed by the filters. Removed items never show, and drafts stay in Drafts until they are filled
// in. Every location shows, even an empty one, so items can be added to it. Show Completed (as in
// Reminders) adds completed items that fit the filters, after the open ones. By Waiting On shows what
// is ready now and what is to be quoted, then each thing holding work up with the items it holds up (an
// item waiting on two things is under both; a task it waits on counts as the company doing it): the
// late ones first, then the biggest. That is the order to clear them in. Each group carries its totals: how many are open, ready and past due, and their
// estimated time.

import { daysBetween } from './dates';
import { isPastDue, matchesFilters, NO_FILTERS, readFilters, sameFilters, type FilterContext, type ItemFilters } from './filters';
import { holdLookups, holdNames, type HoldLookups } from './holds';
import { floorOf, NO_FLOOR } from './rooms';
import { isPriced } from './rules';
import { NO_TIME, totalTime, type TimeTotal } from './time';
import type { Company, Item, Location, Trade } from './types';

export type GroupBy = 'room' | 'trade' | 'company' | 'waiting';

/** How a person likes a job to open, saved with Save as My Default. */
export interface ViewSettings {
  groupBy: GroupBy;
  showCompleted: boolean;
  filters: ItemFilters;
}

export const DEFAULT_VIEW: ViewSettings = { groupBy: 'room', showCompleted: false, filters: NO_FILTERS };

export const GROUP_LABELS: Record<GroupBy, string> = { room: 'Location', trade: 'Trade', company: 'Company', waiting: 'Waiting On' };

const GROUPS: GroupBy[] = ['room', 'trade', 'company', 'waiting'];

/**
 * A saved view, checked. Views saved before filters took several values said Show (Ready, Not Ready
 * or Additional) and one trade and one company; those carry over.
 */
export function readViewSettings(raw: unknown): ViewSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const groupBy = GROUPS.includes(r.groupBy as GroupBy) ? (r.groupBy as GroupBy) : 'room';
  const filters = readFilters(r.filters);
  if (r.filters === undefined) {
    if (r.filter === 'ready') filters.states = ['ready'];
    if (r.filter === 'not_ready') filters.states = ['not_ready'];
    if (r.filter === 'added_scope') filters.kinds = ['added_scope'];
    if (typeof r.tradeId === 'string') filters.tradeIds = [r.tradeId];
    if (typeof r.companyId === 'string') filters.companyIds = [r.companyId];
  }
  return { groupBy, showCompleted: r.showCompleted === true, filters };
}

export function sameView(a: ViewSettings, b: ViewSettings): boolean {
  return a.groupBy === b.groupBy && a.showCompleted === b.showCompleted && sameFilters(a.filters, b.filters);
}

/** The group key for one thing an item waits on. */
export const waitingKey = (label: string) => `waiting:${label.trim().toLowerCase()}`;

export interface ViewOptions {
  filters?: ItemFilters;
  /** Completed items too, after the open ones. */
  showCompleted?: boolean;
  /** What the filters and the totals need: today, the visits, which items have photos, the locations. */
  context?: FilterContext;
}

export interface ItemGroup {
  key: string;
  label: string;
  /** Items in the group that pass the filters, in number order (completed ones after, with Show Completed). */
  items: Item[];
  /** Of those, how many are open, ready, and past due. */
  open: number;
  ready: number;
  pastDue: number;
  /** The open items' estimated time. */
  time: TimeTotal;
  /** By Waiting On: how many days the latest item in the group is past its Ready By, or 0. */
  late: number;
}

export interface Lookups {
  locations: Location[];
  trades: Trade[];
  companies: Company[];
}

/** Totals for a set of items: open, ready, past due and the open work's estimated time. */
export function itemTotals(items: Item[], context?: FilterContext): Pick<ItemGroup, 'open' | 'ready' | 'pastDue' | 'time'> {
  const open = items.filter((i) => i.status === 'open');
  return {
    open: open.length,
    ready: open.filter((i) => i.ready).length,
    pastDue: context ? open.filter((i) => isPastDue(i, context.visits, context.today)).length : 0,
    time: open.length > 0 ? totalTime(open) : NO_TIME,
  };
}

export function groupItems(items: Item[], by: GroupBy, lookups: Lookups, options: ViewOptions = {}): ItemGroup[] {
  const filters = options.filters ?? NO_FILTERS;
  const context = options.context;
  const live = items.filter(
    (i) => i.status !== 'removed' && !i.unfinished && (i.status === 'open' || options.showCompleted) && matchesFilters(i, filters, context),
  );
  // Who holds each item up: the company doing each task it waits on, or the name it waits on.
  let look: HoldLookups | undefined;
  const holds = () => (look ??= context?.holds ?? holdLookups({ items, companies: lookups.companies, locations: lookups.locations }));
  const keysOf = (i: Item): string[] => {
    switch (by) {
      case 'room':
        return [i.locationId];
      case 'trade':
        return [i.tradeId ?? 'none'];
      case 'company':
        return [i.companyId ?? 'none'];
      case 'waiting': {
        if (i.status === 'complete') return ['complete'];
        const keys = i.ready ? [] : holdNames(i, holds()).map(waitingKey);
        if (!isPriced(i)) return ['price', ...keys];
        return keys.length > 0 ? keys : ['ready'];
      }
    }
  };
  const today = context?.today;
  const lateBy = (i: Item) => (today && i.status === 'open' && !i.ready && i.readyBy && i.readyBy < today ? daysBetween(i.readyBy, today) : 0);
  const groups = new Map<string, Item[]>();
  const waitingLabels = new Map<string, string>();
  for (const item of live) {
    for (const k of keysOf(item)) {
      const list = groups.get(k) ?? [];
      list.push(item);
      groups.set(k, list);
    }
    if (by === 'waiting' && !item.ready) for (const w of holdNames(item, holds())) if (!waitingLabels.has(waitingKey(w))) waitingLabels.set(waitingKey(w), w);
  }

  let order: Array<{ key: string; label: string }>;
  if (by === 'room') {
    order = [...lookups.locations]
      .filter((l) => l.active || groups.has(l.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({ key: l.id, label: l.label }));
  } else if (by === 'waiting') {
    const holding = [...waitingLabels]
      .map(([key, label]) => {
        const open = (groups.get(key) ?? []).filter((i) => i.status === 'open');
        return { key, label, n: open.length, late: Math.max(0, ...open.map(lateBy)) };
      })
      .sort((a, b) => b.late - a.late || b.n - a.n || a.label.localeCompare(b.label));
    order = [
      { key: 'ready', label: 'Ready' },
      { key: 'price', label: 'To Be Quoted' },
      ...holding.map(({ key, label }) => ({ key, label })),
      { key: 'complete', label: 'Completed' },
    ];
  } else {
    const names = new Map((by === 'trade' ? lookups.trades : lookups.companies).map((x) => [x.id, x.name]));
    order = [...groups.keys()]
      .map((key) => ({ key, label: names.get(key) ?? 'Not set' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return order.map(({ key, label }) => {
    const all = groups.get(key) ?? [];
    return {
      key,
      label,
      items: arrange(all),
      ...itemTotals(all, context),
      late: by === 'waiting' ? Math.max(0, ...all.map(lateBy)) : 0,
    };
  });
}

/** Numbered items first, in number order; items not yet numbered (made offline) after, oldest first. */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (a.number !== null && b.number !== null) return a.number - b.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** Number order, the open items first and any completed ones after. */
function arrange(items: Item[]): Item[] {
  const sorted = sortItems(items);
  return [...sorted.filter((i) => i.status !== 'complete'), ...sorted.filter((i) => i.status === 'complete')];
}

/** Rows gathered under their floor, floors in the order they first appear. */
export function byFloor<T>(rows: T[], locationOf: (row: T) => Pick<Location, 'kind' | 'floor'> | undefined): { floor: string; rows: T[] }[] {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const loc = locationOf(row);
    const floor = loc ? floorOf(loc) : NO_FLOOR;
    const list = out.get(floor) ?? [];
    list.push(row);
    out.set(floor, list);
  }
  return [...out].map(([floor, list]) => ({ floor, rows: list }));
}

/** The locations around one, in floor order: for Previous and Next while walking. */
export function neighborRooms(locations: Location[], id: string): { previous: Location | null; next: Location | null } {
  const rooms = [...locations].filter((l) => l.active || l.id === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const i = rooms.findIndex((l) => l.id === id);
  if (i < 0) return { previous: null, next: null };
  return { previous: rooms[i - 1] ?? null, next: rooms[i + 1] ?? null };
}

export function itemNumberLabel(item: Pick<Item, 'number'>): string {
  return item.number === null ? 'New' : String(item.number);
}
