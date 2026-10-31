// The lists that go out: one per company for the subs, one for the owner and design team, and the
// whole job for Ross Built. Open, finished items only, the room on every line. A company's list says
// what is ready now, then what is waiting, grouped by what it waits on and soonest first, then
// added scope that needs a price, so the work can be scheduled in batches and in the right order.

import { isPriced } from './rules';
import type { Company, Item, Location, Trade } from './types';
import { waitingOnText } from './waitingOn';
import { floorOf, NO_FLOOR } from './rooms';
import { sortItems } from './views';

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
  /** Ready and priced: it can be done now. */
  ready: ListLine[];
  waiting: WaitingGroup[];
  /** Added scope with no price yet, ready or not. */
  needsPrice: ListLine[];
  open: number;
}

/** Open and finished: on the lists that go out. */
export const onLists = (item: Item) => item.status === 'open' && !item.unfinished;

export function lineFor(item: Item, lookups: ListLookups): ListLine {
  const room = lookups.locations.find((l) => l.id === item.locationId);
  return {
    item,
    room: room?.label ?? 'Not set',
    floor: room ? floorOf(room) : NO_FLOOR,
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
  const open = items.filter((i) => onLists(i) && i.companyId === companyId);
  const sorted = inFloorOrder(open, lookups);
  const priced = sorted.filter((i) => isPriced(i));
  const ready = priced.filter((i) => i.ready).map((i) => lineFor(i, lookups));
  const groups = new Map<string, WaitingGroup>();
  for (const item of priced.filter((i) => !i.ready)) {
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
    needsPrice: sorted.filter((i) => !isPriced(i)).map((i) => lineFor(i, lookups)),
    open: open.length,
  };
}

export interface CompanyWork {
  companyId: string;
  name: string;
  open: number;
  /** Ready and priced. */
  ready: number;
  needsPrice: number;
}

/** The companies with open work on the job, with how much is ready now. */
export function companiesWithWork(items: Item[], lookups: ListLookups): CompanyWork[] {
  const out = new Map<string, CompanyWork>();
  for (const i of items) {
    if (!onLists(i) || !i.companyId) continue;
    const row = out.get(i.companyId) ?? {
      companyId: i.companyId,
      name: lookups.companies.find((c) => c.id === i.companyId)?.name ?? 'Not set',
      open: 0,
      ready: 0,
      needsPrice: 0,
    };
    row.open += 1;
    if (!isPriced(i)) row.needsPrice += 1;
    else if (i.ready) row.ready += 1;
    out.set(i.companyId, row);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who else work waits on: the owner, the design team, anyone who is not a company on the job and
 * not Ross Built. Their list is what Ross Built needs from them, the soonest needed first.
 */
export function partiesWaitedOn(items: Item[], lookups: ListLookups): { party: string; lines: number }[] {
  const companies = new Set(lookups.companies.map((c) => c.name.trim().toLowerCase()));
  const out = new Map<string, { party: string; lines: number }>();
  for (const i of items) {
    if (!onLists(i) || i.ready) continue;
    for (const w of i.waitingOn) {
      const key = w.trim().toLowerCase();
      if (key === '' || key === 'ross built' || companies.has(key)) continue;
      const row = out.get(key) ?? { party: w.trim(), lines: 0 };
      row.lines += 1;
      out.set(key, row);
    }
  }
  return [...out.values()].sort((a, b) => b.lines - a.lines || a.party.localeCompare(b.party));
}

/** The items waiting on one party, the soonest Ready By first, then floor order. */
export function partyList(party: string, items: Item[], lookups: ListLookups): ListLine[] {
  const key = party.trim().toLowerCase();
  const waiting = items.filter((i) => onLists(i) && !i.ready && i.waitingOn.some((w) => w.trim().toLowerCase() === key));
  return inFloorOrder(waiting, lookups)
    .sort((a, b) => (a.readyBy ?? '9999').localeCompare(b.readyBy ?? '9999'))
    .map((i) => lineFor(i, lookups));
}

/** Every open, finished item on the job, in floor order, then by trade. */
export function jobList(items: Item[], lookups: ListLookups): ListLine[] {
  const open = items.filter(onLists);
  const lines = inFloorOrder(open, lookups).map((i) => lineFor(i, lookups));
  const order = new Map(lookups.locations.map((l) => [l.id, l.sortOrder]));
  return lines.sort(
    (a, b) => (order.get(a.item.locationId) ?? 1e9) - (order.get(b.item.locationId) ?? 1e9) || a.trade.localeCompare(b.trade),
  );
}
