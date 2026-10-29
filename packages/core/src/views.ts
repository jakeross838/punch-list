// How the lists are cut: by room (floor order), by trade or by company, with the filters from the
// plan. Removed items never show. Every room shows, even an empty one, so items can be added to it.

import type { Company, Item, Location, Trade } from './types';

export type GroupBy = 'room' | 'trade' | 'company';
export type ItemFilter = 'open' | 'ready' | 'not_ready' | 'added_scope' | 'all';

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

export function groupItems(items: Item[], by: GroupBy, filter: ItemFilter, lookups: Lookups): ItemGroup[] {
  const live = items.filter((i) => i.status !== 'removed');
  const keyOf = (i: Item) => (by === 'room' ? i.locationId : by === 'trade' ? i.tradeId : i.companyId) ?? 'none';
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
      items: sortItems(all.filter((i) => matchesFilter(i, filter))),
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

export function itemNumberLabel(item: Pick<Item, 'number'>): string {
  return item.number === null ? 'New' : String(item.number);
}
