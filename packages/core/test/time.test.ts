import { describe, expect, it } from 'vitest';
import {
  activityLines,
  activityLookups,
  checkItem,
  companyPlan,
  daysFor,
  daysText,
  fillHours,
  filterChips,
  filterCount,
  groupItems,
  hoursForTitle,
  hoursText,
  isPastDue,
  matchesFilters,
  NO_FILTERS,
  notBooked,
  setYesNo,
  suggestTitles,
  tidyHours,
  tidyItem,
  toggleFilter,
  totalText,
  totalTime,
  workDays,
  type FilterContext,
  type Item,
  type ItemFilters,
  type Location,
  type StandardTitle,
  type Visit,
} from '../src/index';

const rooms: Location[] = [
  { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true },
  { id: 'b', jobId: 'j', name: 'Bathroom', number: '207', label: 'Bathroom 207', floor: 'Level 2', kind: 'room', sortOrder: 2, active: true },
  { id: 'r', jobId: 'j', name: 'Roof', number: null, label: 'Roof', floor: null, kind: 'shared', sortOrder: 3, active: true },
];
const lookups = {
  locations: rooms,
  trades: [
    { id: 't-carp', name: 'Carpentry', sortOrder: 1 },
    { id: 't-paint', name: 'Painting', sortOrder: 2 },
  ],
  companies: [
    { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
    { id: 'c-hhh', name: 'Triple H Painting', defaultTradeId: 't-paint', phone: null, email: null, active: true },
  ],
};

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'typed', extra: {}, unfinished: false, visitId: null,
    hours: null, btExternalId: null, createdBy: 'jake', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

describe('estimated time', () => {
  it('says times in words, never abbreviated', () => {
    expect([0.25, 0.5, 0.75, 1, 1.5, 2, 13.75].map(hoursText)).toEqual([
      '15 minutes',
      '30 minutes',
      '45 minutes',
      '1 hour',
      '1.5 hours',
      '2 hours',
      '13.75 hours',
    ]);
    expect([1, 4, 5, 8, 9, 13.5, 16, 17].map(daysText)).toEqual(['half a day', 'half a day', '1 day', '1 day', '1.5 days', '2 days', '2 days', '2.5 days']);
    expect([0.5, 8, 8.25, 16].map(daysFor)).toEqual([1, 1, 2, 2]);
  });

  it('tidies an estimate to the quarter hour, and keeps it on the item through the rules', () => {
    expect([tidyHours(1.3), tidyHours('2'), tidyHours(0.05), tidyHours(0), tidyHours(-2), tidyHours('soon'), tidyHours(null), tidyHours(900)]).toEqual([
      1.25, 2, 0.25, null, null, null, null, 200,
    ]);
    const tidied = tidyItem(item({ hours: 0.6 }));
    expect(tidied.hours).toBe(0.5);
    expect(checkItem({ ...item({}), hours: 250 }).map((p) => p.field)).toEqual(['hours']);
    expect(checkItem(item({ hours: 3 }))).toEqual([]);
  });

  it('adds up, and says how many have no estimate yet', () => {
    const total = totalTime([item({ hours: 2 }), item({ hours: 0.5 }), item({ hours: null }), item({ hours: null })]);
    expect(total).toEqual({ hours: 2.5, timed: 2, untimed: 2 });
    expect(totalText(total)).toBe('2.5 hours, 2 not estimated');
    expect(totalText(totalTime([item({ hours: 8 })]))).toBe('8 hours');
    expect(totalText(totalTime([item({})]))).toBe('1 not estimated');
    expect(totalText(totalTime([]))).toBe('');
  });

  it('fills a title from the standard list, or from the same work on this job', () => {
    const library: StandardTitle[] = [
      { id: 's1', title: 'Touch up paint', tradeId: 't-paint', uses: 40, approved: true, hours: 0.5 },
      { id: 's2', title: 'Hang door', tradeId: 't-carp', uses: 5, approved: true, hours: null },
    ];
    const job = [item({ title: 'Hang door', hours: 2 }), item({ title: 'Hang door', hours: 2 }), item({ title: 'Hang door', hours: 3 }), item({ title: 'Hang door', hours: 9, status: 'removed' })];
    expect(hoursForTitle('touch up paint', library)).toBe(0.5);
    expect(hoursForTitle('Hang door', library, job)).toBe(2);
    expect(hoursForTitle('Something new', library, job)).toBeNull();
    expect(suggestTitles('touch', library)[0]).toEqual({ title: 'Touch up paint', tradeId: 't-paint', hours: 0.5 });
    expect(suggestTitles('hang', library, job)[0]).toEqual({ title: 'Hang door', tradeId: 't-carp', hours: 2 });
  });

  it('says an estimate change in History', () => {
    const it1 = item({ title: 'Hang door' });
    const look = activityLookups({ people: [{ id: 'jake', email: '', name: 'Jake Ross', active: true }], items: [it1], locations: rooms, companies: [], trades: [], visits: [], customFields: [] });
    const entry = (before: string | null, after: string | null) => ({ id: 'e', jobId: 'j', itemId: it1.id, personId: 'jake', at: '2026-10-30T10:00:00Z', kind: 'item_changed' as const, field: 'hours', before, after });
    expect(activityLines([entry(null, '2.50')], look, { forItem: true })[0]?.detail).toBe('Estimated time: 2.5 hours.');
    expect(activityLines([entry('2.00', null)], look, { forItem: true })[0]?.detail).toBe('Estimated time cleared.');
  });
});

describe('groups add up their time', () => {
  it('totals the open work in each group, past due included', () => {
    const items = [
      item({ locationId: 'k', hours: 2 }),
      item({ locationId: 'k', hours: 1.5, ready: false, waitingOn: ['Owner'], readyBy: '2026-10-20' }),
      item({ locationId: 'k', hours: 4, status: 'complete', completedBy: 'jake', completedAt: '2026-10-28T10:00:00Z' }),
      item({ locationId: 'b' }),
    ];
    const context: FilterContext = { today: '2026-10-30', visits: [], photoItemIds: new Set(), locations: rooms };
    const [kitchen, bathroom, roof] = groupItems(items, 'room', lookups, { context, showCompleted: true });
    expect(kitchen).toMatchObject({ open: 2, ready: 1, pastDue: 1, time: { hours: 3.5, timed: 2, untimed: 0 } });
    expect(kitchen?.items).toHaveLength(3);
    expect(bathroom).toMatchObject({ open: 1, time: { hours: 0, timed: 0, untimed: 1 } });
    expect(roof).toMatchObject({ open: 0, time: { hours: 0, timed: 0, untimed: 0 } });
  });
});

describe('filters', () => {
  const visits: Visit[] = [
    { id: 'v-old', jobId: 'j', companyId: 'c-hhh', start: '2026-10-19', days: 2, confirmed: true, note: '', removed: false, createdBy: 'jake', createdAt: '', updatedAt: '' },
    { id: 'v-next', jobId: 'j', companyId: 'c-sms', start: '2026-11-03', days: 1, confirmed: false, note: '', removed: false, createdBy: 'jake', createdAt: '', updatedAt: '' },
  ];
  const items = [
    item({ id: 'a', hours: 1, companyId: 'c-sms', locationId: 'k', kind: 'deficiency' }),
    item({ id: 'b', hours: null, companyId: 'c-hhh', tradeId: 't-paint', locationId: 'b', visitId: 'v-old', createdBy: 'sam' }),
    item({ id: 'c', hours: 2, companyId: 'c-sms', locationId: 'r', ready: false, waitingOn: ['Owner', 'Volcano Stone'] }),
    item({ id: 'd', hours: 4, companyId: 'c-sms', locationId: 'b', visitId: 'v-next', kind: 'added_scope', boughtOut: false }),
  ];
  const context: FilterContext = { today: '2026-10-30', visits, photoItemIds: new Set(['a', 'c']), locations: rooms };
  const pick = (f: Partial<ItemFilters>) => items.filter((i) => matchesFilters(i, { ...NO_FILTERS, ...f }, context)).map((i) => i.id);

  it('matches any value within a filter, and every filter that is set', () => {
    expect(pick({ companyIds: ['c-sms'] })).toEqual(['a', 'c', 'd']);
    expect(pick({ companyIds: ['c-sms', 'c-hhh'] })).toEqual(['a', 'b', 'c', 'd']);
    expect(pick({ companyIds: ['c-sms'], floors: ['Level 2'] })).toEqual(['d']);
    expect(pick({ floors: ['Outside and Whole House'] })).toEqual(['c']);
    expect(pick({ kinds: ['deficiency', 'added_scope'] })).toEqual(['a', 'd']);
    expect(pick({ waitingOn: ['volcano stone'] })).toEqual(['c']);
    expect(pick({ addedBy: ['sam'] })).toEqual(['b']);
  });

  it('finds past due work, what is to be quoted, photos, visits and estimates', () => {
    expect(pick({ states: ['past_due'] })).toEqual(['b']);
    expect(isPastDue(items[1]!, visits, '2026-10-30')).toBe(true);
    expect(pick({ states: ['needs_price'] })).toEqual(['d']);
    expect(pick({ photo: true })).toEqual(['a', 'c']);
    expect(pick({ photo: false })).toEqual(['b', 'd']);
    expect(pick({ scheduled: true })).toEqual(['b', 'd']);
    expect(pick({ scheduled: false })).toEqual(['a', 'c']);
    expect(pick({ estimated: false })).toEqual(['b']);
  });

  it('switches values on and off, counts them and names them for the chips', () => {
    let f = toggleFilter(NO_FILTERS, 'companyIds', 'c-sms');
    f = toggleFilter(f, 'states', 'ready');
    f = setYesNo(f, 'estimated', false);
    expect(filterCount(f)).toBe(3);
    expect(setYesNo(f, 'estimated', false).estimated).toBeNull();
    expect(toggleFilter(f, 'companyIds', 'c-sms').companyIds).toEqual([]);
    const names = { companies: new Map([['c-sms', 'SMS Carpentry']]), trades: new Map(), people: new Map() };
    const chips = filterChips(toggleFilter(f, 'waitingOn', 'Owner'), names);
    expect(chips.map((c) => c.label)).toEqual(['Ready', 'SMS Carpentry', 'Waiting on Owner', 'Not Estimated']);
    expect(filterCount(chips[1]!.without)).toBe(3);
  });
});

describe('planning full days', () => {
  it('fills the hours in the order given, passing over what would run over', () => {
    const list = [item({ id: 'a', hours: 3 }), item({ id: 'b', hours: 4 }), item({ id: 'c', hours: 2 }), item({ id: 'd', hours: 1 }), item({ id: 'e', hours: null })];
    expect(fillHours(list, 8).map((i) => i.id)).toEqual(['a', 'b', 'd']);
    expect(workDays(list)).toEqual([
      { items: ['a', 'b', 'd'], hours: 8 },
      { items: ['c'], hours: 2 },
    ]);
    // Work longer than a day gets days of its own.
    expect(workDays([item({ id: 'x', hours: 1 }), item({ id: 'y', hours: 12 })])).toEqual([
      { items: ['x'], hours: 1 },
      { items: ['y'], hours: 12 },
    ]);
  });

  it("splits a company's ready work into days, location by location, and totals each batch", () => {
    const items = [
      item({ id: 'k1', locationId: 'b', number: 1, hours: 3 }),
      item({ id: 'k2', locationId: 'k', number: 2, hours: 4 }),
      item({ id: 'k3', locationId: 'k', number: 3, hours: 2 }),
      item({ id: 'k4', locationId: 'r', number: 4, hours: 2 }),
      item({ id: 'k5', locationId: 'k', number: 5, hours: null }),
      item({ id: 'k6', locationId: 'k', number: 6, hours: 1, ready: false, waitingOn: ['Owner'], readyBy: '2026-11-04' }),
      item({ id: 'k7', locationId: 'k', number: 7, hours: 0.5, companyId: 'c-hhh' }),
    ];
    const plan = companyPlan('c-sms', items, [], lookups, '2026-10-30');
    expect(plan.readyNow.map((l) => l.item.id)).toEqual(['k2', 'k3', 'k5', 'k1', 'k4']);
    expect(plan.readyTime).toEqual({ hours: 11, timed: 4, untimed: 1 });
    // Full days first: the roof's 2 hours finish the first day, and the bathroom starts the second.
    expect(plan.readyDays).toEqual([
      { items: ['k2', 'k3', 'k4'], hours: 8 },
      { items: ['k1'], hours: 3 },
    ]);
    expect(plan.comingFree[0]?.time).toEqual({ hours: 1, timed: 1, untimed: 0 });
    const row = notBooked(items, [], lookups, '2026-10-30').find((r) => r.companyId === 'c-sms');
    expect(row?.readyTime.hours).toBe(11);
  });
});
