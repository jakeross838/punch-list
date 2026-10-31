import { describe, expect, it } from 'vitest';
import {
  checkItem,
  clearHoldup,
  companyList,
  companyPlan,
  companyPrintout,
  groupItems,
  holdChoices,
  holdLookups,
  holdNames,
  holdText,
  matchesFilters,
  NO_FILTERS,
  readyByOf,
  releasedBy,
  tidyItem,
  type Item,
  type Location,
  type Visit,
} from '../src/index';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: 2,
    btExternalId: null, createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

const rooms: Location[] = [
  { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null },
  { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true, walkedAt: null },
];
const lookups = {
  locations: rooms,
  trades: [{ id: 't-carp', name: 'Carpentry', sortOrder: 1 }, { id: 't-stone', name: 'Stone', sortOrder: 2 }],
  companies: [
    { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
    { id: 'c-vs', name: 'Volcano Stone', defaultTradeId: 't-stone', phone: null, email: null, active: true },
  ],
};
const stoneVisit: Visit = {
  id: 'v-stone', jobId: 'j', companyId: 'c-vs', start: '2026-11-04', days: 2, confirmed: false, note: '', removed: false, askedStart: null, askedDays: null, askedName: null, askedAt: null,
  createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z',
};

// Volcano Stone's backsplash has to go in before SMS Carpentry sets the upper cabinets.
const backsplash = item({ id: 'stone', title: 'Install range backsplash', companyId: 'c-vs', tradeId: 't-stone', visitId: 'v-stone' });
const cabinets = item({ id: 'uppers', title: 'Set upper cabinets', ready: false, waitingOnItems: ['stone'] });
const hardware = item({ id: 'pulls', title: 'Install cabinet hardware', ready: false, waitingOnItems: ['uppers'], waitingOn: ['Owner'] });
const shoe = item({ id: 'shoe', title: 'Install shoe molding', locationId: 'a' });
const jobItems = [backsplash, cabinets, hardware, shoe];
const look = holdLookups({ items: jobItems, companies: lookups.companies, locations: rooms, visits: [stoneVisit], today: '2026-10-31' });

describe('waiting on other tasks', () => {
  it('says the task it waits on, with the company doing it and where it is when that is somewhere else', () => {
    expect(holdText(cabinets, look)).toBe('Install range backsplash (Volcano Stone)');
    expect(holdText(cabinets, look, { everywhere: true })).toBe('Install range backsplash (Volcano Stone, Kitchen 109)');
    expect(holdText({ ...cabinets, locationId: 'a' }, look)).toBe('Install range backsplash (Volcano Stone, Kitchen 109)');
    expect(holdText(hardware, look)).toBe('Set upper cabinets (SMS Carpentry) and Owner');
    expect(holdNames(hardware, look)).toEqual(['SMS Carpentry', 'Owner']);
    // A task already done holds nothing up.
    const done = holdLookups({ items: [{ ...backsplash, status: 'complete' }, cabinets], companies: lookups.companies, locations: rooms });
    expect(holdText(cabinets, done)).toBe('');
  });

  it("is ready by the day the task's visit is done, unless it has a Ready By of its own", () => {
    expect(readyByOf(cabinets, look)).toBe('2026-11-05');
    expect(readyByOf({ ...cabinets, readyBy: '2026-11-20' }, look)).toBe('2026-11-20');
    // Not known while the task is not on a visit, while it also waits on someone, or once the visit is over.
    expect(readyByOf({ ...cabinets, waitingOnItems: ['shoe'] }, look)).toBeNull();
    expect(readyByOf({ ...cabinets, waitingOn: ['Owner'] }, look)).toBeNull();
    expect(readyByOf(cabinets, { ...look, today: '2026-11-06' })).toBeNull();
  });

  it('offers only open tasks that do not already wait on it, so nothing waits on itself', () => {
    const ids = (list: Item[]) => list.map((i) => i.id);
    // The backsplash cannot wait on the cabinets or the hardware: both wait on it already.
    expect(ids(holdChoices('stone', jobItems))).toEqual(['shoe']);
    expect(ids(holdChoices('uppers', jobItems))).toEqual(['stone', 'shoe']);
    expect(ids(holdChoices(null, [...jobItems, item({ id: 'draft', unfinished: true }), item({ id: 'gone', status: 'removed' })]))).toEqual(['stone', 'uppers', 'pulls', 'shoe']);
  });

  it('frees what waited on a task once it is done: ready when nothing else holds it up', () => {
    const freed = releasedBy('stone', jobItems);
    expect(freed.map((r) => [r.item.id, r.ready])).toEqual([['uppers', true]]);
    expect(freed[0]!.patch).toEqual({ ready: true, waitingOn: [], waitingOnItems: [], readyBy: null });
    // The hardware still waits on the owner once the cabinets are up.
    const later = releasedBy('uppers', jobItems);
    expect(later.map((r) => [r.item.id, r.ready])).toEqual([['pulls', false]]);
    expect(later[0]!.patch).toMatchObject({ ready: false, waitingOn: ['Owner'], waitingOnItems: [] });
  });

  it('a task is enough to say what it waits on, and a ready item drops it', () => {
    expect(checkItem({ ...cabinets })).toEqual([]);
    expect(checkItem({ ...cabinets, waitingOnItems: [] }).map((p) => p.field)).toEqual(['waitingOn']);
    expect(tidyItem({ ...cabinets, ready: true }).waitingOnItems).toEqual([]);
    expect(tidyItem({ ...cabinets, waitingOnItems: ['stone', 'stone'] }).waitingOnItems).toEqual(['stone']);
  });

  it('stops waiting on a company, its tasks included', () => {
    expect(clearHoldup(cabinets, 'Volcano Stone', look)).toEqual({ ready: true, waitingOn: [], waitingOnItems: [], readyBy: null });
    expect(clearHoldup(hardware, 'Owner', look)).toEqual({ ready: false, waitingOn: [], waitingOnItems: ['uppers'], readyBy: null });
  });

  it('groups and filters what waits on a task under the company doing it', () => {
    const groups = groupItems(jobItems, 'waiting', lookups);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Ready', ['stone', 'shoe']],
      ['To Be Quoted', []],
      ['Owner', ['pulls']],
      ['SMS Carpentry', ['pulls']],
      ['Volcano Stone', ['uppers']],
      ['Completed', []],
    ]);
    const stone = { ...NO_FILTERS, waitingOn: ['Volcano Stone'] };
    const context = { today: '2026-10-31', visits: [stoneVisit], photoItemIds: new Set<string>(), locations: rooms, holds: look };
    expect(jobItems.filter((i) => matchesFilters(i, stone, context)).map((i) => i.id)).toEqual(['uppers']);
  });

  it("a company's list and plan say the task and when it comes free", () => {
    const list = companyList('c-sms', jobItems, { ...lookups, visits: [stoneVisit] });
    expect(list.waiting.map((g) => [g.on, g.readyBy])).toEqual([
      ['Install range backsplash (Volcano Stone, Kitchen 109)', '2026-11-05'],
      ['Set upper cabinets (SMS Carpentry, Kitchen 109) and Owner', null],
    ]);
    const plan = companyPlan('c-sms', jobItems, [stoneVisit], lookups, '2026-10-31');
    expect(plan.comingFree.map((g) => [g.date, g.on, g.lines.map((l) => l.item.id)])).toEqual([
      ['2026-11-05', 'Install range backsplash (Volcano Stone, Kitchen 109)', ['uppers']],
    ]);
    expect(plan.noDate.map((g) => g.lines.map((l) => l.item.id))).toEqual([['pulls']]);
    const page = companyPrintout(list, { job: { name: 'Fish', address: '' }, date: new Date(2026, 9, 31) }).body;
    expect(page).toContain('Waiting on Install range backsplash (Volcano Stone, Kitchen 109), ready by November\u00a05');
  });
});
