import { describe, expect, it } from 'vitest';
import { groupItems, itemNumberLabel, matchesFilter, matchesView, type Item, type Location } from '../src/index';

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
    tradeId: 't1', companyId: 'c1', kind: 'deficiency', ready: true, waitingOn: [], readyBy: null,
    boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, source: 'typed',
    extra: {}, unfinished: false, visitId: null, btExternalId: null, createdBy: 'p1', createdAt: `2026-10-29T10:00:0${n % 10}Z`, updatedAt: '2026-10-29T10:00:00Z',
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
  it('Show Completed adds completed items after the open ones, under the same filter', () => {
    const kitchen = groupItems(items, 'room', 'open', lookups, { showCompleted: true })[0]!;
    expect(kitchen.items.map(itemNumberLabel)).toEqual(['3', 'New', '1']);
    const done = items.find((i) => i.status === 'complete')!;
    expect(matchesView(done, 'ready', true)).toBe(true);
    expect(matchesView(done, 'not_ready', true)).toBe(false);
    expect(matchesView(done, 'ready', false)).toBe(false);
    const removed = items.find((i) => i.status === 'removed')!;
    expect(matchesView(removed, 'open', true)).toBe(false);
  });

  it('shows every room in floor order, empty ones too, with open and ready counts', () => {
    const groups = groupItems(items, 'room', 'open', lookups);
    expect(groups.map((g) => [g.label, g.items.length, g.open, g.ready])).toEqual([
      ['Kitchen 109', 2, 2, 1],
      ['Bathroom 116', 2, 2, 2],
      ['Roof', 0, 0, 0],
    ]);
  });

  it('puts numbered items in order and new ones after', () => {
    const kitchen = groupItems(items, 'room', 'all', lookups)[0]!;
    expect(kitchen.items.map(itemNumberLabel)).toEqual(['1', '3', 'New']);
  });

  it('groups by trade or company, alphabetically', () => {
    expect(groupItems(items, 'trade', 'open', lookups).map((g) => g.label)).toEqual(['Electrical', 'Plumbing']);
    expect(groupItems(items, 'company', 'open', lookups).map((g) => g.label)).toEqual(['Gator Plumbing', 'Metro Electric']);
  });

  it('filters, and never shows removed items', () => {
    const count = (f: Parameters<typeof matchesFilter>[1]) => items.filter((i) => matchesFilter(i, f)).length;
    expect([count('open'), count('ready'), count('not_ready'), count('added_scope'), count('all')]).toEqual([4, 3, 1, 1, 5]);
  });
});
