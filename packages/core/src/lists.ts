// The lists that go out: one per company for the subs, and the whole job for Ross Built. Open items
// only, the room on every line. A company's list says what is ready now, then what is waiting,
// grouped by what it waits on and soonest first, so the work can be scheduled in batches and in
// the right order.

import type { Company, Item, Location, Trade } from './types';
import { waitingOnText } from './waitingOn';
import { floorOf, sortItems } from './views';

export interface ListLookups {
  locations: Location[];
  trades: Trade[];
  companies: Company[];
}

export interface ListLine {
  item: Item;
  room: string;
  floor: string;
  trade: string;
  company: string;
}

export interface WaitingGroup {
  /** What these items wait on, as it reads: "Owner and Volcano Stone". */
  on: string;
  /** The soonest Ready By in the group, or null. */
  readyBy: string | null;
  lines: ListLine[];
}

export interface CompanyList {
  companyId: string;
  company: string;
  trades: string[];
  ready: ListLine[];
  waiting: WaitingGroup[];
  open: number;
}

function lineFor(item: Item, lookups: ListLookups): ListLine {
  const room = lookups.locations.find((l) => l.id === item.locationId);
  return {
    item,
    room: room?.label ?? 'Not set',
    floor: room ? floorOf(room) : 'Rooms',
    trade: lookups.trades.find((t) => t.id === item.tradeId)?.name ?? 'Not set',
    company: lookups.companies.find((c) => c.id === item.companyId)?.name ?? 'Not set',
  };
}

/** Floor order, then the item number. */
function inFloorOrder(items: Item[], lookups: ListLookups): Item[] {
  const order = new Map(lookups.locations.map((l) => [l.id, l.sortOrder]));
  const numbered = sortItems(items);
  return [...numbered].sort((a, b) => (order.get(a.locationId) ?? 1e9) - (order.get(b.locationId) ?? 1e9));
}

export function companyList(companyId: string, items: Item[], lookups: ListLookups): CompanyList {
  const open = items.filter((i) => i.status === 'open' && i.companyId === companyId);
  const sorted = inFloorOrder(open, lookups);
  const ready = sorted.filter((i) => i.ready).map((i) => lineFor(i, lookups));
  const groups = new Map<string, WaitingGroup>();
  for (const item of sorted.filter((i) => !i.ready)) {
    const on = waitingOnText(item.waitingOn) || 'Something not named';
    const key = on.toLowerCase();
    const group = groups.get(key) ?? { on, readyBy: null, lines: [] };
    group.lines.push(lineFor(item, lookups));
    if (item.readyBy && (!group.readyBy || item.readyBy < group.readyBy)) group.readyBy = item.readyBy;
    groups.set(key, group);
  }
  const waiting = [...groups.values()].sort(
    (a, b) => (a.readyBy ?? '9999').localeCompare(b.readyBy ?? '9999') || b.lines.length - a.lines.length || a.on.localeCompare(b.on),
  );
  const trades = [...new Set(open.map((i) => lookups.trades.find((t) => t.id === i.tradeId)?.name).filter((n): n is string => !!n))].sort();
  return {
    companyId,
    company: lookups.companies.find((c) => c.id === companyId)?.name ?? 'Not set',
    trades,
    ready,
    waiting,
    open: open.length,
  };
}

/** The companies with open work on the job, with how much is ready now. */
export function companiesWithWork(items: Item[], lookups: ListLookups): { companyId: string; name: string; open: number; ready: number }[] {
  const out = new Map<string, { companyId: string; name: string; open: number; ready: number }>();
  for (const i of items) {
    if (i.status !== 'open' || !i.companyId) continue;
    const row = out.get(i.companyId) ?? {
      companyId: i.companyId,
      name: lookups.companies.find((c) => c.id === i.companyId)?.name ?? 'Not set',
      open: 0,
      ready: 0,
    };
    row.open += 1;
    if (i.ready) row.ready += 1;
    out.set(i.companyId, row);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every open item on the job, in floor order, then by trade. */
export function jobList(items: Item[], lookups: ListLookups): ListLine[] {
  const open = items.filter((i) => i.status === 'open');
  const lines = inFloorOrder(open, lookups).map((i) => lineFor(i, lookups));
  const order = new Map(lookups.locations.map((l) => [l.id, l.sortOrder]));
  return lines.sort(
    (a, b) => (order.get(a.item.locationId) ?? 1e9) - (order.get(b.item.locationId) ?? 1e9) || a.trade.localeCompare(b.trade),
  );
}
