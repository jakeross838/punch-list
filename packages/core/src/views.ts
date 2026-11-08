// How the lists are cut: by location (floor order), by who they are assigned to (each company, then
// each person on the team) or by what items wait on,
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
import { floorOf, inWalkOrder, NO_FLOOR } from './rooms';
import { isPriced } from './rules';
import { NO_TIME, totalTime, type TimeTotal } from './time';
import { assigneeKey, NOT_ASSIGNED, personOfKey } from './assignees';
import type { Company, Item, Location, Person, Trade } from './types';

export type GroupBy = 'room' | 'company' | 'waiting';

/** How a person likes a job to open, saved with Save as My Default. */
export interface ViewSettings {
  groupBy: GroupBy;
  showCompleted: boolean;
  filters: ItemFilters;
  /** Views saved with a name ("Ready for Paint"), one tap away on every job. */
  named?: NamedView[];
}

/** A view saved with a name: how it is grouped and what it shows. */
export interface NamedView {
  name: string;
  groupBy: GroupBy;
  showCompleted: boolean;
  filters: ItemFilters;
}

/** The most views kept with a name, and the longest name. */
export const NAMED_VIEWS_KEPT = 12;
export const VIEW_NAME_MAX = 40;

/** A view's name, tidied: one line, spaces single, at most 40 characters, or empty. */
export const viewName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX);

function readNamed(raw: unknown): NamedView[] {
  if (!Array.isArray(raw)) return [];
  const out: NamedView[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const name = typeof r.name === 'string' ? viewName(r.name) : '';
    if (!name || out.some((v) => v.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ name, groupBy: GROUPS.includes(r.groupBy as GroupBy) ? (r.groupBy as GroupBy) : 'room', showCompleted: r.showCompleted === true, filters: readFilters(r.filters) });
    if (out.length >= NAMED_VIEWS_KEPT) break;
  }
  return out;
}

/** The views saved with a name, with this one added (or saved again over one with its name), newest first. */
export function withNamedView(list: NamedView[] | undefined, name: string, view: Pick<ViewSettings, 'groupBy' | 'showCompleted' | 'filters'>): NamedView[] {
  const clean = viewName(name);
  if (!clean) return list ?? [];
  const rest = (list ?? []).filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
  return [{ name: clean, groupBy: view.groupBy, showCompleted: view.showCompleted, filters: view.filters }, ...rest].slice(0, NAMED_VIEWS_KEPT);
}

/** Whether a view is the one saved with this name. */
export const isNamedView = (view: Pick<ViewSettings, 'groupBy' | 'showCompleted' | 'filters'>, named: NamedView) =>
  view.groupBy === named.groupBy && view.showCompleted === named.showCompleted && sameFilters(view.filters, named.filters);

export const DEFAULT_VIEW: ViewSettings = { groupBy: 'room', showCompleted: false, filters: NO_FILTERS };

/** By company is by Assigned To: each company, and each person on the team with work assigned. */
export const GROUP_LABELS: Record<GroupBy, string> = { room: 'Location', company: 'Assigned To', waiting: 'Waiting On' };

const GROUPS: GroupBy[] = ['room', 'company', 'waiting'];

/**
 * A saved view, checked. Views saved before filters took several values said Show (Ready, Not Ready
 * or Additional) and one company; those carry over. A view grouped by trade, from before the trade
 * was left off the item, is grouped by company: each company does one trade on the job.
 */
export function readViewSettings(raw: unknown): ViewSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const groupBy = r.groupBy === 'trade' ? 'company' : GROUPS.includes(r.groupBy as GroupBy) ? (r.groupBy as GroupBy) : 'room';
  const filters = readFilters(r.filters);
  if (r.filters === undefined) {
    if (r.filter === 'ready') filters.states = ['ready'];
    if (r.filter === 'not_ready') filters.states = ['not_ready'];
    if (r.filter === 'added_scope') filters.kinds = ['added_scope'];
    if (typeof r.companyId === 'string') filters.companyIds = [r.companyId];
  }
  const named = readNamed(r.named);
  return { groupBy, showCompleted: r.showCompleted === true, filters, ...(named.length > 0 ? { named } : {}) };
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
  companies: Company[];
  /** The team's names, for work assigned to someone on it. */
  people?: Pick<Person, 'id' | 'name'>[];
  /** With them, each list keeps a trade's items together, in the trades' order. */
  trades?: Trade[];
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
  const holds = () => (look ??= context?.holds ?? holdLookups({ items, companies: lookups.companies, people: lookups.people, locations: lookups.locations }));
  const keysOf = (i: Item): string[] => {
    switch (by) {
      case 'room':
        return [i.locationId];
      case 'company':
        return [assigneeKey(i) ?? 'none'];
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
    // The companies, then the people on the team, each by name; work assigned to no one last.
    const companies = new Map(lookups.companies.map((x) => [x.id, x.name]));
    const people = new Map((lookups.people ?? []).map((x) => [x.id, x.name]));
    const rank = (key: string) => (key === 'none' ? 2 : personOfKey(key) ? 1 : 0);
    order = [...groups.keys()]
      .map((key) => {
        const person = personOfKey(key);
        const label = key === 'none' ? NOT_ASSIGNED : person ? (people.get(person) ?? 'Someone on the team') : (companies.get(key) ?? 'A company');
        return { key, label };
      })
      .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
  }

  const rank = lookups.trades ? tradeRanks(lookups.trades) : undefined;
  return order.map(({ key, label }) => {
    const all = groups.get(key) ?? [];
    return {
      key,
      label,
      items: arrange(all, rank),
      ...itemTotals(all, context),
      late: by === 'waiting' ? Math.max(0, ...all.map(lateBy)) : 0,
    };
  });
}

/**
 * Each trade's place when a list keeps a trade's items together, so it does not jump from
 * electrical to plumbing to painting and back: the trades' own order, then their names. An item with
 * no trade yet comes last.
 */
export function tradeRanks(trades: Pick<Trade, 'id' | 'name' | 'sortOrder'>[]): (tradeId: string | null) => number {
  const order = [...trades].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const rank = new Map(order.map((t, i) => [t.id, i]));
  return (tradeId) => (tradeId !== null && rank.has(tradeId) ? rank.get(tradeId)! : order.length);
}

/**
 * Numbered items first, in number order; items not yet numbered (made offline) after, oldest first.
 * With tradeRank, each trade's items come together first, in the trades' order: something added
 * lands with its trade.
 */
export function sortItems(items: Item[], tradeRank?: (tradeId: string | null) => number): Item[] {
  return [...items].sort((a, b) => {
    if (tradeRank) {
      const ra = tradeRank(a.tradeId);
      const rb = tradeRank(b.tradeId);
      if (ra !== rb) return ra - rb;
    }
    // Wanted first: a priority goes to the top of its trade, or of the list.
    if (!!a.priority !== !!b.priority) return a.priority ? -1 : 1;
    // Where someone dragged it, or its number: the two count the same way, so a list put in order
    // by hand stays in order, and anything added after it goes at the end.
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka !== null && kb !== null && ka !== kb) return ka - kb;
    if (ka !== null && kb === null) return -1;
    if (kb !== null && ka === null) return 1;
    if (a.number !== null && b.number !== null && a.number !== b.number) return a.number - b.number;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** Where an item sorts in its list: where it was dragged to, else its number, else nowhere yet. */
export function sortKey(item: Pick<Item, 'position' | 'number'>): number | null {
  return item.position ?? item.number ?? null;
}

/** Number order (each trade together, when ranked), the open items first and any completed ones after. */
function arrange(items: Item[], tradeRank?: (tradeId: string | null) => number): Item[] {
  const sorted = sortItems(items, tradeRank);
  return [...sorted.filter((i) => i.status !== 'complete'), ...sorted.filter((i) => i.status === 'complete')];
}

/** Rows gathered under their floor, floors in the order they first appear and the outside and whole house areas last. */
export function byFloor<T>(rows: T[], locationOf: (row: T) => Pick<Location, 'kind' | 'floor'> | undefined): { floor: string; rows: T[] }[] {
  const out = new Map<string, { floor: string; shared: boolean; rows: T[] }>();
  for (const row of rows) {
    const loc = locationOf(row);
    const floor = loc ? floorOf(loc) : NO_FLOOR;
    const shared = loc?.kind === 'shared';
    const key = `${shared ? 's' : 'r'}:${floor}`;
    const group = out.get(key) ?? { floor, shared, rows: [] };
    group.rows.push(row);
    out.set(key, group);
  }
  const all = [...out.values()];
  return [...all.filter((g) => !g.shared), ...all.filter((g) => g.shared)].map(({ floor, rows: list }) => ({ floor, rows: list }));
}

/** The locations around one, in floor order: for Previous and Next while walking. */
export function neighborRooms(locations: Location[], id: string): { previous: Location | null; next: Location | null } {
  const rooms = inWalkOrder(locations.filter((l) => l.active || l.id === id));
  const i = rooms.findIndex((l) => l.id === id);
  if (i < 0) return { previous: null, next: null };
  return { previous: rooms[i - 1] ?? null, next: rooms[i + 1] ?? null };
}

export function itemNumberLabel(item: Pick<Item, 'number'>): string {
  return item.number === null ? 'New' : String(item.number);
}
