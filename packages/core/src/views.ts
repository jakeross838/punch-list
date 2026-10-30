// How the lists are cut: by location (floor order), by trade, by company or by what items wait on, with
// the filters from the plan. Removed items never show. Every location shows, even an empty one, so items
// can be added to it. Show Completed (as in Reminders) adds completed items that fit the filter, after
// the open ones. By Waiting On shows the items to fill in, what is ready now and what needs a price,
// then each thing holding work up with the items it holds up (an item waiting on two things is
// under both): the late ones first, then the biggest. That is the order to clear them in.

import { isPriced } from './rules';
import { daysBetween } from './dates';
import type { Company, Item, Location, Trade } from './types';

export type GroupBy = 'room' | 'trade' | 'company' | 'waiting';
export type ItemFilter = 'open' | 'ready' | 'not_ready' | 'added_scope' | 'all';
export type ShowFilter = Exclude<ItemFilter, 'all'>;

/** How a person likes a job to open, saved with Save as My Default. */
export interface ViewSettings {
  groupBy: GroupBy;
  filter: ShowFilter;
  showCompleted: boolean;
  /** Only this trade's items, or every trade. */
  tradeId: string | null;
  /** Only this company's items, or every company. */
  companyId: string | null;
}

export const DEFAULT_VIEW: ViewSettings = { groupBy: 'room', filter: 'open', showCompleted: false, tradeId: null, companyId: null };

export const GROUP_LABELS: Record<GroupBy, string> = { room: 'Location', trade: 'Trade', company: 'Company', waiting: 'Waiting On' };

/** The group key for one thing an item waits on. */
export const waitingKey = (label: string) => `waiting:${label.trim().toLowerCase()}`;

export const FILTER_LABELS: Record<ItemFilter, string> = {
  open: 'Open',
  ready: 'Ready',
  not_ready: 'Not Ready',
  added_scope: 'Additional',
  all: 'All',
};

export function matchesFilter(item: Item, filter: ItemFilter): boolean {
  if (item.status === 'removed') return false;
  switch (filter) {
    case 'open':
      return item.status === 'open';
    case 'ready':
      return item.status === 'open' && item.ready;
    case 'not_ready':
      return item.status === 'open' && !item.ready;
    case 'added_scope':
      return item.status === 'open' && item.kind === 'added_scope';
    case 'all':
      return true;
  }
}

/** With Show Completed on, a completed item joins the open filters on everything but its status. */
export function matchesView(item: Item, filter: ItemFilter, showCompleted = false): boolean {
  if (item.status !== 'complete' || filter === 'all' || !showCompleted) return matchesFilter(item, filter);
  switch (filter) {
    case 'open':
      return true;
    case 'ready':
      return item.ready;
    case 'not_ready':
      return !item.ready;
    case 'added_scope':
      return item.kind === 'added_scope';
  }
}

export interface ViewOptions {
  showCompleted?: boolean;
  tradeId?: string | null;
  companyId?: string | null;
  /** Today, YYYY-MM-DD: By Waiting On puts late holdups first. */
  today?: string;
}

/** The trade and company filters from View: an item passes when it matches every one that is set. */
export function matchesScope(item: Item, options: ViewOptions): boolean {
  if (options.tradeId && item.tradeId !== options.tradeId) return false;
  if (options.companyId && item.companyId !== options.companyId) return false;
  return true;
}

export interface ItemGroup {
  key: string;
  label: string;
  /** Items in the group that pass the filter, numbered order. */
  items: Item[];
  open: number;
  ready: number;
  /** By Waiting On: how many days the latest item in the group is past its Ready By, or 0. */
  late: number;
}

export interface Lookups {
  locations: Location[];
  trades: Trade[];
  companies: Company[];
}

export function groupItems(items: Item[], by: GroupBy, filter: ItemFilter, lookups: Lookups, options: ViewOptions = {}): ItemGroup[] {
  const live = items.filter((i) => i.status !== 'removed' && matchesScope(i, options));
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
        if (i.unfinished) return ['unfinished'];
        const keys = i.ready || i.waitingOn.length === 0 ? [] : i.waitingOn.map(waitingKey);
        if (!isPriced(i)) return ['price', ...keys];
        return keys.length > 0 ? keys : ['ready'];
      }
    }
  };
  const lateBy = (i: Item) =>
    options.today && i.status === 'open' && !i.ready && i.readyBy && i.readyBy < options.today ? daysBetween(i.readyBy, options.today) : 0;
  const groups = new Map<string, Item[]>();
  const waitingLabels = new Map<string, string>();
  for (const item of live) {
    for (const k of keysOf(item)) {
      const list = groups.get(k) ?? [];
      list.push(item);
      groups.set(k, list);
    }
    if (by === 'waiting') for (const w of item.waitingOn) if (!waitingLabels.has(waitingKey(w))) waitingLabels.set(waitingKey(w), w.trim());
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
      { key: 'unfinished', label: 'To Fill In' },
      { key: 'ready', label: 'Ready' },
      { key: 'price', label: 'Needs a Price' },
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
      items: arrange(all.filter((i) => matchesView(i, filter, options.showCompleted)), filter, options),
      open: all.filter((i) => i.status === 'open').length,
      ready: all.filter((i) => i.status === 'open' && i.ready).length,
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

/** Number order. With Show Completed on, the open items come first and the completed ones after. */
function arrange(items: Item[], filter: ItemFilter, options: ViewOptions): Item[] {
  const sorted = sortItems(items);
  if (!options.showCompleted || filter === 'all') return sorted;
  return [...sorted.filter((i) => i.status !== 'complete'), ...sorted.filter((i) => i.status === 'complete')];
}

/** The group for the elevations, roof, pool, driveway, site and Whole House on every job. */
export const SHARED_GROUP = 'Outside and Whole House';
/** The group for locations pasted without a level. */
export const NO_FLOOR = 'Locations';

/** What a location is listed under on the job: its level, Outside and Whole House, or Locations when it has no level. */
export function floorOf(location: Pick<Location, 'kind' | 'floor'>): string {
  return location.kind === 'shared' ? SHARED_GROUP : (location.floor ?? NO_FLOOR);
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
