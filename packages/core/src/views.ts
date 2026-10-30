// How the lists are cut: by room (floor order), by trade, by company or by status, with the filters
// from the plan. Removed items never show. Every room shows, even an empty one, so items can be added
// to it. Show Completed (as in Reminders) adds completed items that fit the filter, after the open ones.

import type { Company, Item, Location, Trade } from './types';

export type GroupBy = 'room' | 'trade' | 'company' | 'status';
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

export const GROUP_LABELS: Record<GroupBy, string> = { room: 'Room', trade: 'Trade', company: 'Company', status: 'Status' };

const STATUS_GROUPS = [
  { key: 'not_ready', label: 'Not Ready' },
  { key: 'ready', label: 'Ready' },
  { key: 'complete', label: 'Completed' },
] as const;

export const FILTER_LABELS: Record<ItemFilter, string> = {
  open: 'Open',
  ready: 'Ready',
  not_ready: 'Not ready',
  added_scope: 'Added scope',
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
}

export interface Lookups {
  locations: Location[];
  trades: Trade[];
  companies: Company[];
}

export function groupItems(items: Item[], by: GroupBy, filter: ItemFilter, lookups: Lookups, options: ViewOptions = {}): ItemGroup[] {
  const live = items.filter((i) => i.status !== 'removed' && matchesScope(i, options));
  const keyOf = (i: Item) =>
    (by === 'room'
      ? i.locationId
      : by === 'trade'
        ? i.tradeId
        : by === 'company'
          ? i.companyId
          : i.status === 'complete'
            ? 'complete'
            : i.ready
              ? 'ready'
              : 'not_ready') ?? 'none';
  const groups = new Map<string, Item[]>();
  for (const item of live) {
    const k = keyOf(item);
    const list = groups.get(k) ?? [];
    list.push(item);
    groups.set(k, list);
  }

  let order: Array<{ key: string; label: string }>;
  if (by === 'room') {
    order = [...lookups.locations]
      .filter((l) => l.active || groups.has(l.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({ key: l.id, label: l.label }));
  } else if (by === 'status') {
    order = STATUS_GROUPS.map((g) => ({ key: g.key, label: g.label }));
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

/** What a room is listed under on the job: its floor, Shared Areas, or Rooms when it has no floor. */
export function floorOf(location: Pick<Location, 'kind' | 'floor'>): string {
  return location.kind === 'shared' ? 'Shared Areas' : (location.floor ?? 'Rooms');
}

/** Rows gathered under their floor, floors in the order they first appear. */
export function byFloor<T>(rows: T[], locationOf: (row: T) => Pick<Location, 'kind' | 'floor'> | undefined): { floor: string; rows: T[] }[] {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const loc = locationOf(row);
    const floor = loc ? floorOf(loc) : 'Rooms';
    const list = out.get(floor) ?? [];
    list.push(row);
    out.set(floor, list);
  }
  return [...out].map(([floor, list]) => ({ floor, rows: list }));
}

/** The rooms around one, in floor order: for Previous and Next while walking. */
export function neighborRooms(locations: Location[], id: string): { previous: Location | null; next: Location | null } {
  const rooms = [...locations].filter((l) => l.active || l.id === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const i = rooms.findIndex((l) => l.id === id);
  if (i < 0) return { previous: null, next: null };
  return { previous: rooms[i - 1] ?? null, next: rooms[i + 1] ?? null };
}

export function itemNumberLabel(item: Pick<Item, 'number'>): string {
  return item.number === null ? 'New' : String(item.number);
}
