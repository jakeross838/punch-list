import { describe, expect, it } from 'vitest';
import { searchAll, searchWords, wordRank, type Comment, type Item, type Job, type Location } from '../src/index';

const item = (over: Partial<Item>): Item => ({
  id: 'i', jobId: 'fish', locationId: 'kitchen', number: 1, assignedTo: null, title: 'Adjust cabinet door', description: '', tradeId: null, companyId: 'sms',
  kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null, status: 'open', completedBy: null,
  completedAt: null, extra: {}, unfinished: false, visitId: null, hours: null, source: 'typed', btExternalId: null, createdBy: 'jake',
  createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', ...over,
});
const location = (id: string, label: string, jobId = 'fish'): Location => ({ id, jobId, name: label, number: null, label, floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null });
const job = (id: string, name: string, closed = false): Job => ({ id, name, address: `${name} Road`, closed });
const comment = (over: Partial<Comment>): Comment => ({ id: 'c', jobId: 'fish', itemId: 'i1', companyId: 'sms', body: '', personId: 'jake', fromCompany: false, authorName: null, internal: false, removed: false, createdAt: '2026-11-02T12:00:00.000Z', ...over });

describe('search everything', () => {
  const sources = {
    jobs: [job('fish', 'Fish Residence'), job('old', 'Old House', true)],
    items: [
      item({ id: 'i1', number: 12, title: 'Adjust cabinet door', locationId: 'kitchen' }),
      item({ id: 'i2', number: 13, title: 'Install towel bar', locationId: 'bath', companyId: 'gator' }),
      item({ id: 'i3', number: 14, title: 'Touch up paint', description: 'Cabinet side by the fridge', locationId: 'kitchen', status: 'complete' }),
      item({ id: 'i4', number: 15, title: 'Paint the cabinet', locationId: 'bath', status: 'removed' }),
      item({ id: 'i5', number: 3, title: 'Caulk the sink', jobId: 'old', locationId: 'old-kitchen' }),
      item({ id: 'i6', number: 16, title: '', description: 'Water stain on the ceiling', source: 'owner', unfinished: true, locationId: 'bath' }),
    ],
    locations: [location('kitchen', 'Kitchen 109'), location('bath', 'Bathroom 116'), location('old-kitchen', 'Kitchen 101', 'old')],
    companies: [
      { id: 'sms', name: 'SMS Carpentry', defaultTradeId: null, phone: null, email: 'office@smscarpentry.example', active: true },
      { id: 'gator', name: 'Gator Plumbing', defaultTradeId: null, phone: '941-555-0101', email: null, active: true },
    ],
    people: [{ id: 'jake', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true, role: 'admin' as const, sees: 'all' as const, phone: null }],
    comments: [comment({ id: 'c1', body: 'The cabinet hinge came today' }), comment({ id: 'c2', body: 'Gone', removed: true })],
    photoWords: new Map([['i2', 'chrome towel bar left of the vanity, wall outlet']]),
  };

  it('reads words the way they are typed', () => {
    expect(searchWords('  #12 Cabinet-door, Kitchen 109 ')).toEqual(['12', 'cabinet', 'door', 'kitchen', '109']);
    expect(searchWords('Baño')).toEqual(['bano']);
    expect(wordRank(['cab'], 'Adjust cabinet door')).toBe(1);
    expect(wordRank(['adj', 'cab'], 'Adjust cabinet door')).toBe(0);
    expect(wordRank(['binet'], 'Adjust cabinet door')).toBeNull();
  });

  it('finds items by title first, then by where and whose, then by their details; finished work last, removed work never', () => {
    const found = searchAll('cabinet', sources).filter((f) => f.kind === 'item');
    expect(found.map((f) => f.id)).toEqual(['i1', 'i3']);
    expect(found[0]).toMatchObject({ title: 'Adjust cabinet door', detail: 'Item 12 · Kitchen 109 · SMS Carpentry · Fish Residence', done: false });
    expect(found[1]!.done).toBe(true);
  });

  it('finds work by its words across fields, by its number, by what is in its photos, and what the owner sent', () => {
    expect(searchAll('kitchen adjust', sources).find((f) => f.kind === 'item')?.id).toBe('i1');
    expect(searchAll('#13', sources).filter((f) => f.kind === 'item').map((f) => f.id)).toEqual(['i2']);
    expect(searchAll('outlet', sources).filter((f) => f.kind === 'item').map((f) => f.id)).toEqual(['i2']);
    expect(searchAll('water stain', sources).find((f) => f.kind === 'item')).toMatchObject({ id: 'i6', title: 'Water stain on the ceiling' });
  });

  it('finds jobs, locations, companies, people and comments, closed jobs and their work after the rest', () => {
    const kitchen = searchAll('kitchen', sources);
    expect(kitchen.filter((f) => f.kind === 'location').map((f) => f.title)).toEqual(['Kitchen 109', 'Kitchen 101']);
    expect(kitchen.find((f) => f.title === 'Kitchen 101')?.done).toBe(true);
    expect(searchAll('gator', sources).find((f) => f.kind === 'company')).toMatchObject({ id: 'gator', detail: '941-555-0101' });
    expect(searchAll('jake', sources).find((f) => f.kind === 'person')?.title).toBe('Jake Ross');
    expect(searchAll('hinge', sources).filter((f) => f.kind === 'comment')).toEqual([
      expect.objectContaining({ id: 'c1', itemId: 'i1', detail: 'Jake Ross · Adjust cabinet door · Fish Residence' }),
    ]);
    expect(searchAll('gone', sources).filter((f) => f.kind === 'comment')).toEqual([]);
    expect(searchAll('fish', sources).find((f) => f.kind === 'job')?.id).toBe('fish');
    expect(searchAll('   ', sources)).toEqual([]);
  });
});

import { todayPlan, type Visit } from '../src/index';

describe('Today and the day\'s walk', () => {
  const now = new Date(2026, 10, 9, 8, 0); // Monday, November 9
  const visit = (over: Partial<Visit>): Visit => ({
    id: 'v', jobId: 'fish', companyId: 'gator', start: '2026-11-09', days: 1, confirmed: true, note: '', removed: false, askedStart: null, askedDays: null, askedName: null, askedAt: null,
    createdBy: 'jake', createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', ...over,
  });
  const places = [
    { ...location('bath', 'Bathroom 116'), sortOrder: 2 },
    { ...location('kitchen', 'Kitchen 109'), sortOrder: 1 },
  ];
  const sources = {
    meId: 'jake',
    jobs: [job('fish', 'Fish Residence'), job('palm', 'Palm House'), job('old', 'Old House', true)],
    locations: places,
    companies: [{ id: 'gator', name: 'Gator Plumbing', defaultTradeId: null, phone: null, email: null, active: true }],
    visits: [visit({ id: 'v1' }), visit({ id: 'v2', start: '2026-11-12' }), visit({ id: 'v3', removed: true, companyId: 'sms' })],
    items: [
      item({ id: 'check', number: 4, locationId: 'bath', markedDoneAt: '2026-11-08T15:00:00.000Z' }),
      item({ id: 'mine', number: 7, locationId: 'kitchen', assignedTo: 'jake', companyId: null }),
      item({ id: 'gator1', number: 9, locationId: 'bath', companyId: 'gator', visitId: 'v1' }),
      item({ id: 'gator-later', number: 10, locationId: 'kitchen', companyId: 'gator', visitId: 'v2' }),
      item({ id: 'ready', number: 11, locationId: 'kitchen' }),
      item({ id: 'waiting', number: 12, locationId: 'kitchen', ready: false }),
      item({ id: 'done', number: 13, status: 'complete', assignedTo: 'jake' }),
      item({ id: 'draft', number: 14, unfinished: true, assignedTo: 'jake' }),
      item({ id: 'loose', number: 15, locationId: 'gone', assignedTo: 'jake' }),
      item({ id: 'palm1', jobId: 'palm', number: 1, locationId: 'p', ready: true }),
      item({ id: 'old1', jobId: 'old', number: 1, assignedTo: 'jake' }),
    ],
    now,
  };

  it('gathers what to check, what is mine and who is on site today, with the ready count, for each open job with something today', () => {
    const plan = todayPlan(sources);
    expect(plan.map((p) => p.job.id)).toEqual(['fish']);
    const fish = plan[0]!;
    expect(fish.toCheck.map((i) => i.id)).toEqual(['check']);
    expect(fish.mine.map((i) => i.id)).toEqual(['mine', 'loose']);
    expect(fish.onSite).toEqual([{ companyId: 'gator', name: 'Gator Plumbing', items: [expect.objectContaining({ id: 'gator1' })] }]);
    expect(fish.ready).toBe(6);
  });

  it('walks it location by location, in the walk order, each item once, and what has no location last', () => {
    const walk = todayPlan(sources)[0]!.walk;
    expect(walk.map((w) => [w.location?.label ?? null, w.items.map((i) => i.id)])).toEqual([
      ['Kitchen 109', ['mine']],
      ['Bathroom 116', ['check', 'gator1']],
      [null, ['loose']],
    ]);
  });

  it('shows only the jobs you are on, when you are on any', () => {
    expect(todayPlan({ ...sources, jobIds: new Set(['palm']) })).toEqual([]);
    expect(todayPlan({ ...sources, meId: null, visits: [] }).map((p) => p.job.id)).toEqual(['fish']);
  });
});

import { DEFAULT_VIEW, isNamedView, NO_FILTERS, readViewSettings, withNamedView } from '../src/index';

describe('views saved with a name', () => {
  const paint = { groupBy: 'company' as const, showCompleted: false, filters: { ...NO_FILTERS, states: ['ready' as const], companyIds: ['paint'] } };

  it('saves a view by name, newest first, the same name saved again in its place', () => {
    const one = withNamedView(undefined, '  Ready   for Paint ', paint);
    expect(one).toEqual([{ name: 'Ready for Paint', ...paint }]);
    const two = withNamedView(one, 'Punch Walk', DEFAULT_VIEW);
    expect(two.map((v) => v.name)).toEqual(['Punch Walk', 'Ready for Paint']);
    const again = withNamedView(two, 'ready for paint', { ...paint, showCompleted: true });
    expect(again.map((v) => [v.name, v.showCompleted])).toEqual([['ready for paint', true], ['Punch Walk', false]]);
    expect(withNamedView(two, '   ', paint)).toBe(two);
  });

  it('keeps them with the default view, read back checked', () => {
    const read = readViewSettings({ groupBy: 'room', named: [{ name: 'Ready for Paint', ...paint }, { name: '', groupBy: 'room' }, { name: 'ready for paint' }, 'junk'] });
    expect(read.named).toEqual([{ name: 'Ready for Paint', ...paint }]);
    expect(readViewSettings({ groupBy: 'room' }).named).toBeUndefined();
    expect(isNamedView(paint, read.named![0]!)).toBe(true);
    expect(isNamedView(DEFAULT_VIEW, read.named![0]!)).toBe(false);
  });
});
