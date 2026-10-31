import { describe, expect, it } from 'vitest';
import { groupItems, itemNumberLabel, matchesFilters, NO_FILTERS, readViewSettings, type Item, type ItemFilters, type Location } from '../src/index';

const rooms: Location[] = [
  { id: 'l2', jobId: 'j', name: 'Bathroom', number: '116', label: 'Bathroom 116', floor: null, kind: 'room', sortOrder: 2, active: true },
  { id: 'l1', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: null, kind: 'room', sortOrder: 1, active: true },
  { id: 'l3', jobId: 'j', name: 'Roof', number: null, label: 'Roof', floor: null, kind: 'shared', sortOrder: 3, active: true },
];

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'l1', number: n, title: `Item ${n}`, description: '',
    tradeId: 't1', companyId: 'c1', kind: 'deficiency', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null,
    boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, source: 'typed',
    extra: {}, unfinished: false, visitId: null, hours: null, btExternalId: null, createdBy: 'p1', createdAt: `2026-10-29T10:00:0${n % 10}Z`, updatedAt: '2026-10-29T10:00:00Z',
    ...over,
  };
}

const items = [
  item({ locationId: 'l2', number: 5 }),
  item({ locationId: 'l1', number: 3, ready: false, waitingOn: ['Owner'] }),
  item({ locationId: 'l1', number: null, createdAt: '2026-10-29T11:00:00Z' }),
  item({ locationId: 'l1', number: 1, status: 'complete', completedBy: 'p1', completedAt: '2026-10-29T12:00:00Z' }),
  item({ locationId: 'l2', number: 2, status: 'removed' }),
  item({ locationId: 'l2', number: 4, kind: 'added_scope', boughtOut: false, tradeId: 't2', companyId: 'c2' }),
];
const lookups = {
  locations: rooms,
  trades: [{ id: 't1', name: 'Plumbing', sortOrder: 1 }, { id: 't2', name: 'Electrical', sortOrder: 2 }],
  companies: [
    { id: 'c1', name: 'Gator Plumbing', defaultTradeId: 't1', phone: null, email: null, active: true },
    { id: 'c2', name: 'Metro Electric', defaultTradeId: 't2', phone: null, email: null, active: true },
  ],
};

describe('list views', () => {
  it('Show Completed adds completed items after the open ones, under the same filters', () => {
    const kitchen = groupItems(items, 'room', lookups, { showCompleted: true })[0]!;
    expect(kitchen.items.map(itemNumberLabel)).toEqual(['3', 'New', '1']);
    const done = items.find((i) => i.status === 'complete')!;
    // State filters are about open work: a completed item is checked on everything else.
    expect(matchesFilters(done, { ...NO_FILTERS, states: ['not_ready'] })).toBe(true);
    expect(matchesFilters(done, { ...NO_FILTERS, companyIds: ['c2'] })).toBe(false);
    expect(groupItems(items, 'room', lookups)[0]!.items.map(itemNumberLabel)).toEqual(['3', 'New']);
    expect(groupItems(items, 'room', lookups, { showCompleted: true }).flatMap((g) => g.items).some((i) => i.status === 'removed')).toBe(false);
  });

  it('shows every room in floor order, empty ones too, with open and ready counts', () => {
    const groups = groupItems(items, 'room', lookups);
    expect(groups.map((g) => [g.label, g.items.length, g.open, g.ready])).toEqual([
      ['Kitchen 109', 2, 2, 1],
      ['Bathroom 116', 2, 2, 2],
      ['Roof', 0, 0, 0],
    ]);
  });

  it('puts numbered items in order and new ones after', () => {
    const kitchen = groupItems(items, 'room', lookups)[0]!;
    expect(kitchen.items.map(itemNumberLabel)).toEqual(['3', 'New']);
  });

  it('groups by company, alphabetically, and reads a view grouped by trade as by company', () => {
    expect(readViewSettings({ groupBy: 'trade' }).groupBy).toBe('company');
    expect(groupItems(items, 'company', lookups).map((g) => g.label)).toEqual(['Gator Plumbing', 'Metro Electric']);
  });

  it('filters by state and type, several values at once, and never shows removed items', () => {
    const count = (f: Partial<ItemFilters>) => groupItems(items, 'room', lookups, { filters: { ...NO_FILTERS, ...f } }).reduce((n, g) => n + g.items.length, 0);
    expect(count({})).toBe(4);
    expect(count({ states: ['ready'] })).toBe(3);
    expect(count({ states: ['not_ready'] })).toBe(1);
    expect(count({ states: ['ready', 'not_ready'] })).toBe(4);
    expect(count({ states: ['needs_price'] })).toBe(1);
    expect(count({ kinds: ['added_scope'] })).toBe(1);
    expect(count({ kinds: ['added_scope'], states: ['not_ready'] })).toBe(0);
  });

  it('reads a saved view, and carries over one saved before filters took several values', () => {
    expect(readViewSettings({ groupBy: 'trade', filter: 'not_ready', tradeId: 't1', companyId: null, showCompleted: true })).toEqual({
      groupBy: 'company',
      showCompleted: true,
      filters: { ...NO_FILTERS, states: ['not_ready'] },
    });
    expect(readViewSettings({ groupBy: 'company', filter: 'added_scope' }).filters.kinds).toEqual(['added_scope']);
    expect(readViewSettings({ groupBy: 'sideways', filters: { states: ['ready', 'later'], photo: 'yes', estimated: false } })).toEqual({
      groupBy: 'room',
      showCompleted: false,
      filters: { ...NO_FILTERS, states: ['ready'], estimated: false },
    });
    expect(readViewSettings(null).groupBy).toBe('room');
  });
});
