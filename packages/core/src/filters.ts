// Filters: the job's lists narrowed to exactly the work in question. Each kind of filter can take
// several values. An item shows when it matches one of the values of every kind that is set, so
// Triple H Painting and Metro Electric, ready, on Level 1 is either company's ready work on Level 1.
// Past due means not ready after its Ready By, or still open after its visit ended.

import { visitEnd } from './dates';
import { KIND_LABELS, KINDS } from './forms';
import { floorOf, NO_FLOOR } from './rooms';
import { isPriced } from './rules';
import type { Item, ItemKind, Location, Visit } from './types';

export type StateFilter = 'ready' | 'not_ready' | 'past_due' | 'needs_price';

export const STATES: StateFilter[] = ['ready', 'not_ready', 'past_due', 'needs_price'];

export const STATE_LABELS: Record<StateFilter, string> = {
  ready: 'Ready',
  not_ready: 'Not Ready',
  past_due: 'Past Due',
  needs_price: 'Needs a Price',
};

/** Yes or no questions about an item; null is either. */
export type YesNo = boolean | null;

export interface ItemFilters {
  states: StateFilter[];
  kinds: ItemKind[];
  companyIds: string[];
  tradeIds: string[];
  /** Levels, as the job lists them: "Level 1", "Outside and Whole House". */
  floors: string[];
  /** Single locations. */
  locationIds: string[];
  /** What items wait on, as written. */
  waitingOn: string[];
  /** Who added it. */
  addedBy: string[];
  /** Has a photo, or has none. */
  photo: YesNo;
  /** Booked on a visit, or not. */
  scheduled: YesNo;
  /** Has an estimated time, or not yet. */
  estimated: YesNo;
}

export const NO_FILTERS: ItemFilters = {
  states: [],
  kinds: [],
  companyIds: [],
  tradeIds: [],
  floors: [],
  locationIds: [],
  waitingOn: [],
  addedBy: [],
  photo: null,
  scheduled: null,
  estimated: null,
};

/** The lists in ItemFilters, for the filters that take several values. */
export type ListFacet = 'states' | 'kinds' | 'companyIds' | 'tradeIds' | 'floors' | 'locationIds' | 'waitingOn' | 'addedBy';
export type YesNoFacet = 'photo' | 'scheduled' | 'estimated';

const LIST_FACETS: ListFacet[] = ['states', 'kinds', 'companyIds', 'tradeIds', 'floors', 'locationIds', 'waitingOn', 'addedBy'];
const YES_NO_FACETS: YesNoFacet[] = ['photo', 'scheduled', 'estimated'];

export const YES_NO_LABELS: Record<YesNoFacet, [yes: string, no: string]> = {
  photo: ['Has a Photo', 'No Photo'],
  scheduled: ['Scheduled', 'Not Scheduled'],
  estimated: ['Estimated', 'Not Estimated'],
};

/** How many filters are on: each value picked counts. */
export function filterCount(f: ItemFilters): number {
  return LIST_FACETS.reduce((n, k) => n + f[k].length, 0) + YES_NO_FACETS.filter((k) => f[k] !== null).length;
}

export const isFiltered = (f: ItemFilters) => filterCount(f) > 0;

/** One value switched on or off. */
export function toggleFilter<K extends ListFacet>(f: ItemFilters, facet: K, value: ItemFilters[K][number]): ItemFilters {
  const list = f[facet] as string[];
  const on = list.some((v) => same(v, value as string));
  return { ...f, [facet]: on ? list.filter((v) => !same(v, value as string)) : [...list, value] };
}

/** A yes or no filter set, or cleared when it is picked again. */
export function setYesNo(f: ItemFilters, facet: YesNoFacet, value: boolean): ItemFilters {
  return { ...f, [facet]: f[facet] === value ? null : value };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface FilterContext {
  /** Today, YYYY-MM-DD, for past due. */
  today: string;
  /** The job's visits, for past due and scheduled. */
  visits: Pick<Visit, 'id' | 'start' | 'days' | 'removed'>[];
  /** The items with at least one photo. */
  photoItemIds: ReadonlySet<string>;
  /** The job's locations, for the levels. */
  locations: Pick<Location, 'id' | 'kind' | 'floor'>[];
}

/** Open and late: not ready after its Ready By, or still open after its visit ended. */
export function isPastDue(item: Pick<Item, 'status' | 'unfinished' | 'ready' | 'readyBy' | 'visitId'>, visits: FilterContext['visits'], today: string): boolean {
  if (item.status !== 'open' || item.unfinished) return false;
  if (!item.ready && item.readyBy && item.readyBy < today) return true;
  const visit = item.visitId ? visits.find((v) => v.id === item.visitId && !v.removed) : undefined;
  return !!visit && visitEnd(visit) < today;
}

function matchesState(item: Item, state: StateFilter, ctx: FilterContext | undefined): boolean {
  switch (state) {
    case 'ready':
      return item.ready;
    case 'not_ready':
      return !item.ready;
    case 'past_due':
      return ctx ? isPastDue(item, ctx.visits, ctx.today) : false;
    case 'needs_price':
      return !isPriced(item);
  }
}

/**
 * Whether an item passes the filters. A completed item is checked on everything but its state
 * (ready, past due and the like are about open work), so Show Completed adds what got done.
 */
export function matchesFilters(item: Item, f: ItemFilters, ctx?: FilterContext): boolean {
  if (f.states.length > 0 && item.status === 'open' && !f.states.some((s) => matchesState(item, s, ctx))) return false;
  if (f.kinds.length > 0 && !f.kinds.includes(item.kind)) return false;
  if (f.companyIds.length > 0 && !(item.companyId && f.companyIds.includes(item.companyId))) return false;
  if (f.tradeIds.length > 0 && !(item.tradeId && f.tradeIds.includes(item.tradeId))) return false;
  if (f.floors.length > 0) {
    const location = ctx?.locations.find((l) => l.id === item.locationId);
    const level = location ? floorOf(location) : NO_FLOOR;
    if (!f.floors.some((x) => same(x, level))) return false;
  }
  if (f.locationIds.length > 0 && !f.locationIds.includes(item.locationId)) return false;
  if (f.waitingOn.length > 0 && (item.ready || !item.waitingOn.some((w) => f.waitingOn.some((x) => same(x, w))))) return false;
  if (f.addedBy.length > 0 && !f.addedBy.includes(item.createdBy)) return false;
  if (f.photo !== null && (ctx?.photoItemIds.has(item.id) ?? false) !== f.photo) return false;
  if (f.scheduled !== null) {
    const booked = !!item.visitId && (ctx ? ctx.visits.some((v) => v.id === item.visitId && !v.removed) : true);
    if (booked !== f.scheduled) return false;
  }
  if (f.estimated !== null && (item.hours !== null) !== f.estimated) return false;
  return true;
}

export interface FilterNames {
  companies: Map<string, string>;
  trades: Map<string, string>;
  people: Map<string, string>;
  /** Location labels, "Kitchen 109". */
  locations?: Map<string, string>;
}

export interface FilterChip {
  key: string;
  label: string;
  /** The filters with this one taken off. */
  without: ItemFilters;
}

/** Each filter that is on, in words, to show above the list and take off with a tap. */
export function filterChips(f: ItemFilters, names: FilterNames): FilterChip[] {
  const chips: FilterChip[] = [];
  const list = <K extends ListFacet>(facet: K, label: (v: ItemFilters[K][number]) => string) => {
    for (const v of f[facet]) chips.push({ key: `${facet}:${v}`, label: label(v), without: toggleFilter(f, facet, v) });
  };
  list('states', (s) => STATE_LABELS[s]);
  list('kinds', (k) => KIND_LABELS[k]);
  list('companyIds', (id) => names.companies.get(id) ?? 'A company');
  list('tradeIds', (id) => names.trades.get(id) ?? 'A trade');
  list('floors', (x) => x);
  list('locationIds', (id) => names.locations?.get(id) ?? 'A location');
  list('waitingOn', (w) => `Waiting on ${w}`);
  list('addedBy', (id) => `Added by ${names.people.get(id) ?? 'someone'}`);
  for (const facet of YES_NO_FACETS) {
    const v = f[facet];
    if (v !== null) chips.push({ key: facet, label: YES_NO_LABELS[facet][v ? 0 : 1], without: { ...f, [facet]: null } });
  }
  return chips;
}

/**
 * A title for a list made with these filters: the companies, else the trades, else the locations,
 * else the levels it is narrowed to (one or two), else Whole Job.
 */
export function listTitle(f: ItemFilters, names: FilterNames): string {
  const pick = (ids: string[], map: Map<string, string> | undefined) => {
    const words = ids.map((id) => map?.get(id) ?? id);
    return words.length === 0 || words.length > 2 ? null : words.join(' and ');
  };
  return (
    pick(f.companyIds, names.companies) ??
    pick(f.tradeIds, names.trades) ??
    pick(f.locationIds, names.locations) ??
    (f.floors.length > 0 && f.floors.length <= 2 ? f.floors.join(' and ') : null) ??
    'Whole Job'
  );
}

/** The kinds in form order, for the filter. */
export const FILTER_KINDS: ItemKind[] = KINDS;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const yesNo = (v: unknown): YesNo => (typeof v === 'boolean' ? v : null);

/** Filters as saved, checked: anything that is not a filter is dropped. */
export function readFilters(raw: unknown): ItemFilters {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    states: strings(r.states).filter((s): s is StateFilter => (STATES as string[]).includes(s)),
    kinds: strings(r.kinds).filter((k): k is ItemKind => (KINDS as string[]).includes(k)),
    companyIds: strings(r.companyIds),
    tradeIds: strings(r.tradeIds),
    floors: strings(r.floors),
    locationIds: strings(r.locationIds),
    waitingOn: strings(r.waitingOn),
    addedBy: strings(r.addedBy),
    photo: yesNo(r.photo),
    scheduled: yesNo(r.scheduled),
    estimated: yesNo(r.estimated),
  };
}

export function sameFilters(a: ItemFilters, b: ItemFilters): boolean {
  const list = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.some((w) => same(v, w)));
  return LIST_FACETS.every((k) => list(a[k] as string[], b[k] as string[])) && YES_NO_FACETS.every((k) => a[k] === b[k]);
}
