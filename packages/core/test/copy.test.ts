import { describe, expect, it } from 'vitest';
import {
  activityLines,
  activityLookups,
  dropAt,
  locationsFor,
  pastePlan,
  placeLabel,
  placeOf,
  sortItems,
  templateFromItems,
  templatePlan,
  type Activity,
  type Item,
  type JobCompany,
  type Location,
  type TemplateItem,
} from '../src/index';

let n = 0;
const item = (over: Partial<Item>): Item => {
  n += 1;
  return {
    id: `i${n}`,
    jobId: 'fish',
    locationId: 'bath1',
    number: n,
    assignedTo: null,
    title: `Task ${n}`,
    description: '',
    tradeId: 'plumbing',
    companyId: 'gator',
    kind: 'completion',
    ready: true,
    waitingOn: [],
    waitingOnItems: [],
    readyBy: null,
    boughtOut: true,
    poOrCo: null,
    status: 'open',
    completedBy: null,
    completedAt: null,
    source: 'typed',
    extra: {},
    unfinished: false,
    visitId: null,
    hours: null,
    btExternalId: null,
    createdBy: 'jake',
    createdAt: '2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
    ...over,
  };
};

const location = (id: string, label: string, sortOrder: number, kind: Location['kind'] = 'room'): Location => ({
  id,
  jobId: 'fish',
  name: label,
  number: null,
  label,
  floor: kind === 'room' ? 'Level 1' : null,
  kind,
  sortOrder,
  active: true,
  walkedAt: null,
});

const ids = () => {
  let k = 0;
  return () => `new${++k}`;
};

describe('copy and paste', () => {
  it('pastes open copies into a location, keeps the waits between them, and leaves out what is already there', () => {
    const glass = item({ title: 'Install shower glass', locationId: 'bath1', ready: false, waitingOnItems: [] });
    const caulk = item({ title: 'Caulk shower corner', locationId: 'bath1', status: 'complete', completedBy: 'jake', completedAt: '2026-11-01T10:00:00Z', visitId: 'v1' });
    glass.waitingOnItems = [caulk.id];
    const towel = item({ title: 'Install towel bar', locationId: 'bath1', assignedTo: 'sam' });
    const already = item({ title: 'install towel bar ', locationId: 'bath2' });
    const plan = pastePlan([glass, caulk, towel], { jobId: 'fish', locationId: 'bath2' }, [glass, caulk, towel, already], ids());
    expect(plan.skipped.map((i) => i.title)).toEqual(['Install towel bar']);
    // The caulk comes first: the glass waits on it.
    expect(plan.items.map((i) => [i.title, i.locationId, i.status, i.visitId, i.source])).toEqual([
      ['Caulk shower corner', 'bath2', 'open', null, 'copy'],
      ['Install shower glass', 'bath2', 'open', null, 'copy'],
    ]);
    // The glass copy waits on the caulk copy, not on the caulk back in Bathroom 1.
    const [caulkCopy, glassCopy] = plan.items;
    expect(glassCopy!.waitingOnItems).toEqual([caulkCopy!.id]);
    expect(glassCopy!.ready).toBe(false);
    expect(caulkCopy!.completedBy).toBeNull();
  });

  it('a wait on a task left behind becomes a wait on the same task in the new location, or drops', () => {
    const caulk1 = item({ title: 'Caulk shower corner', locationId: 'bath1' });
    const glass1 = item({ title: 'Install shower glass', locationId: 'bath1', ready: false, waitingOnItems: [caulk1.id] });
    const caulk2 = item({ title: 'Caulk shower corner', locationId: 'bath2' });
    const existing = [caulk1, glass1, caulk2];
    const [toBath2] = pastePlan([glass1], { jobId: 'fish', locationId: 'bath2' }, existing, ids()).items;
    expect(toBath2!.waitingOnItems).toEqual([caulk2.id]);
    const [toKitchen] = pastePlan([glass1], { jobId: 'fish', locationId: 'kitchen' }, existing, ids()).items;
    expect(toKitchen).toMatchObject({ waitingOnItems: [], ready: true });
  });

  it('to another job: waits on items left behind drop, and so do who it is assigned to and its Ready By', () => {
    const first = item({ title: 'Set vanity tops' });
    const second = item({ title: 'Install faucet', ready: false, waitingOnItems: [first.id], readyBy: '2026-11-09', assignedTo: 'jake' });
    const plan = pastePlan([second], { jobId: 'gavin', locationId: 'g-bath' }, [], ids());
    expect(plan.items[0]).toMatchObject({ jobId: 'gavin', ready: true, waitingOnItems: [], readyBy: null, assignedTo: null });
  });

  it('a copy of additional work is to be quoted again', () => {
    const extra = item({ title: 'Add outlet', kind: 'added_scope', poOrCo: 'CO 14', boughtOut: true });
    const [copy] = pastePlan([extra], { jobId: 'fish', locationId: 'bath2' }, [], ids()).items;
    expect(copy).toMatchObject({ poOrCo: null, boughtOut: false });
  });
});

describe('dragging in a list', () => {
  it('puts an item where it was dropped, keeping the list in step with items added later', () => {
    const a = item({ number: 3 });
    const b = item({ number: 7 });
    const c = item({ number: 12 });
    const list = [a, b, c];
    const changes = dropAt(list, [c], a.id);
    expect(changes).toEqual([
      { id: c.id, position: 3 },
      { id: a.id, position: 7 },
      { id: b.id, position: 12 },
    ]);
    const moved = list.map((i) => ({ ...i, position: changes.find((x) => x.id === i.id)?.position ?? i.position }));
    const later = item({ number: 13 });
    expect(sortItems([...moved, later]).map((i) => i.id)).toEqual([c.id, a.id, b.id, later.id]);
  });

  it('drops several at once, in their order, and takes in items from another list', () => {
    const a = item({ number: 1 });
    const b = item({ number: 2 });
    const c = item({ number: 3 });
    const other = item({ number: 9, locationId: 'kitchen' });
    const changes = dropAt([a, b, c], [other, a], null);
    const order = [a, b, c, other]
      .map((i) => ({ ...i, position: changes.find((x) => x.id === i.id)?.position ?? i.position }))
      .sort((x, y) => (x.position ?? x.number!) - (y.position ?? y.number!))
      .map((i) => i.id);
    expect(order).toEqual([b.id, c.id, a.id, other.id]);
  });
});

describe('templates', () => {
  const locations = [
    location('bath1', 'Bathroom 116', 1),
    location('bath2', 'Master Bathroom 207', 2),
    location('kitchen', 'Kitchen 109', 3),
    location('roof', 'Roof', 10, 'shared'),
    location('house', 'Whole House', 11, 'shared'),
  ];
  const jobCompanies: JobCompany[] = [
    { jobId: 'fish', companyId: 'gator', tradeId: 'plumbing' },
    { jobId: 'fish', companyId: 'sms', tradeId: 'carpentry' },
    { jobId: 'fish', companyId: 'crew-a', tradeId: 'cleaning' },
    { jobId: 'fish', companyId: 'crew-b', tradeId: 'cleaning' },
  ];
  const task = (id: string, title: string, place: TemplateItem['place'], over: Partial<TemplateItem> = {}): TemplateItem => ({
    id,
    templateId: 'every-house',
    title,
    description: '',
    kind: 'completion',
    tradeId: 'plumbing',
    hours: 1,
    place,
    waitsOn: [],
    sortOrder: Number(id.slice(1)),
    active: true,
    ...over,
  });

  it('says where each task goes, from the location name', () => {
    expect(placeOf(locations[1]!)).toBe('bathroom');
    expect(placeOf(locations[3]!)).toBe('Roof');
    expect(placeLabel('bathroom')).toBe('Every Bathroom');
    expect(placeLabel('Whole House')).toBe('Whole House');
    expect(locationsFor('bathroom', locations).map((l) => l.id)).toEqual(['bath1', 'bath2']);
  });

  it('puts each task in every location it fits, with its company, waits and time, and leaves out what is there', () => {
    const tasks = [
      task('t1', 'Caulk shower corner', 'bathroom'),
      task('t2', 'Install shower glass', 'bathroom', { waitsOn: ['t1'], tradeId: 'carpentry' }),
      task('t3', 'Final clean', 'Whole House', { tradeId: 'cleaning', hours: 8 }),
      task('t4', 'Install mirror', 'bathroom', { waitsOn: ['t3'], tradeId: 'carpentry' }),
      task('t5', 'Pressure wash', 'Driveway', { tradeId: 'cleaning' }),
      task('t6', 'Old task', 'kitchen', { active: false }),
    ];
    const done = item({ title: 'Caulk shower corner', locationId: 'bath2', status: 'complete' });
    const plan = templatePlan(tasks, { jobId: 'fish', locations, items: [done], jobCompanies }, ids());
    expect(plan.items.map((i) => `${i.locationId}: ${i.title}`)).toEqual([
      'bath1: Caulk shower corner',
      'bath1: Install shower glass',
      'bath2: Install shower glass',
      'house: Final clean',
      'bath1: Install mirror',
      'bath2: Install mirror',
    ]);
    expect(plan.skipped).toBe(1);
    expect(plan.missing).toEqual(['Driveway']);
    const by = (loc: string, title: string) => plan.items.find((i) => i.locationId === loc && i.title === title)!;
    // In Bathroom 116 the glass waits on the new caulk; in the master bath, on the caulk already done there.
    expect(by('bath1', 'Install shower glass').waitingOnItems).toEqual([by('bath1', 'Caulk shower corner').id]);
    expect(by('bath2', 'Install shower glass').waitingOnItems).toEqual([done.id]);
    // The mirrors wait on the one Final clean in the Whole House.
    expect(by('bath2', 'Install mirror').waitingOnItems).toEqual([by('house', 'Final clean').id]);
    expect(by('bath1', 'Install shower glass')).toMatchObject({ companyId: 'sms', ready: false, source: 'template', unfinished: false });
    // Two companies clean on this job: Final clean waits in Drafts for its company.
    expect(by('house', 'Final clean')).toMatchObject({ companyId: null, unfinished: true, hours: 8 });
    expect(plan.needCompany).toBe(1);
    expect(plan.byLocation).toEqual([
      { locationId: 'bath1', count: 3 },
      { locationId: 'bath2', count: 2 },
      { locationId: 'house', count: 1 },
    ]);
    // Just one location: only what fits there.
    const one = templatePlan(tasks, { jobId: 'fish', locations, items: [done], jobCompanies }, ids(), { onlyLocationId: 'bath1' });
    expect(one.items.map((i) => i.title)).toEqual(['Caulk shower corner', 'Install shower glass', 'Install mirror']);
    expect(one.missing).toEqual([]);
     // The locations the plans just added: only what fits them, and the waits still find the work they wait on.
    const added = templatePlan(tasks, { jobId: 'fish', locations, items: [done], jobCompanies }, ids(), { onlyLocationIds: ['bath2'] });
    expect(added.items.map((i) => `${i.locationId}: ${i.title}`)).toEqual(['bath2: Install shower glass', 'bath2: Install mirror']);
    expect(added.items[0]!.waitingOnItems).toEqual([done.id]);
    expect(added.missing).toEqual([]);
  });

  it('saves a template from items: each title once for each place, with the waits between them', () => {
    const caulk1 = item({ title: 'Caulk shower corner', locationId: 'bath1' });
    const glass1 = item({ title: 'Install shower glass', locationId: 'bath1', ready: false, waitingOnItems: [caulk1.id], tradeId: 'carpentry', hours: 2 });
    const caulk2 = item({ title: 'Caulk shower corner', locationId: 'bath2' });
    const thermostats = item({ title: 'Mount thermostats', locationId: 'house', tradeId: 'air' });
    const out = templateFromItems([glass1, caulk1, caulk2, thermostats], locations, ids());
    expect(out.map((t) => [t.title, t.place])).toEqual([
      ['Caulk shower corner', 'bathroom'],
      ['Install shower glass', 'bathroom'],
      ['Mount thermostats', 'Whole House'],
    ]);
    expect(out[1]).toMatchObject({ tradeId: 'carpentry', hours: 2, waitsOn: [out[0]!.key] });
  });
});

describe('Activity for many items at once', () => {
  it('reads as one line on the job, and each item keeps its own History', () => {
    const made = [1, 2, 3].map((k) => item({ id: `t${k}`, title: `Task ${k}`, source: 'template', locationId: k === 3 ? 'kitchen' : 'bath1' }));
    const entries: Activity[] = made.map((m, k) => ({
      id: `a${k}`,
      jobId: 'fish',
      itemId: m.id,
      personId: 'jake',
      at: `2026-11-02T13:00:0${k}.000Z`,
      kind: 'item_created',
      field: 'created',
      before: null,
      after: m.title,
    }));
    const look = activityLookups({
      people: [{ id: 'jake', name: 'Jake Ross', email: 'jake@rossbuilt.com', active: true, role: 'admin', sees: 'all', phone: null }],
      items: made,
      locations: [location('bath1', 'Bathroom 116', 1), location('kitchen', 'Kitchen 109', 3)],
      companies: [],
      trades: [],
      visits: [],
      customFields: [],
      today: new Date(2026, 10, 2),
    });
    expect(activityLines(entries, look).map((l) => `${l.who} ${l.action}. ${l.detail}`)).toEqual(['Jake Ross added 3 items from a template. Bathroom 116 and Kitchen 109.']);
    expect(activityLines([entries[0]!], look, { forItem: true }).map((l) => l.action)).toEqual(['added it']);
  });

  it.each([
    ['said', 'Jake Ross said 2 items. Kitchen 109.'],
    ['import', 'Jake Ross added 2 items from a list. Kitchen 109.'],
  ] as const)('items added at once with Say It or Read a List read as one line too (%s)', (source, line) => {
    const made = [1, 2].map((k) => item({ id: `s${k}`, title: `Task ${k}`, source, locationId: 'kitchen' }));
    const entries: Activity[] = made.map((m, k) => ({
      id: `s${k}`,
      jobId: 'fish',
      itemId: m.id,
      personId: 'jake',
      at: `2026-11-07T13:00:0${k}.000Z`,
      kind: 'item_created',
      field: 'created',
      before: null,
      after: m.title,
    }));
    const look = activityLookups({
      people: [{ id: 'jake', name: 'Jake Ross', email: 'jake@rossbuilt.com', active: true, role: 'admin', sees: 'all', phone: null }],
      items: made,
      locations: [location('kitchen', 'Kitchen 109', 3)],
      companies: [],
      trades: [],
      visits: [],
      customFields: [],
      today: new Date(2026, 10, 7),
    });
    expect(activityLines(entries, look).map((l) => `${l.who} ${l.action}. ${l.detail}`)).toEqual([line]);
  });

  it('the same change to several items at once reads as one line: completed, assigned, moved', () => {
    const made = [1, 2, 3].map((k) => item({ id: `c${k}`, title: `Task ${k}`, locationId: 'bath1' }));
    const change = (k: number, field: string, before: string | null, after: string | null, second = 0): Activity => ({
      id: `${field}${k}`,
      jobId: 'fish',
      itemId: `c${k}`,
      personId: 'jake',
      at: `2026-11-02T13:0${second}:0${k}.000Z`,
      kind: 'item_changed',
      field,
      before,
      after,
    });
    const look = activityLookups({
      people: [
        { id: 'jake', name: 'Jake Ross', email: 'jake@rossbuilt.com', active: true, role: 'admin', sees: 'all', phone: null },
        { id: 'sam', name: 'Sam Rivera', email: 'sam@rossbuilt.com', active: true, role: 'team', sees: 'assigned', phone: null },
      ],
      items: made,
      locations: [location('bath1', 'Bathroom 116', 1), location('kitchen', 'Kitchen 109', 3)],
      companies: [],
      trades: [],
      visits: [],
      customFields: [],
      today: new Date(2026, 10, 2),
    });
    const entries = [
      ...[1, 2, 3].map((k) => change(k, 'assigned_to', null, 'sam', 1)),
      ...[1, 2, 3].map((k) => change(k, 'status', 'open', 'complete', 3)),
      ...[1, 2].map((k) => change(k, 'location_id', 'kitchen', 'bath1', 5)),
    ];
    expect(activityLines(entries, look).map((l) => `${l.action}. ${l.detail}`)).toEqual([
      'moved 2 items to Bathroom 116. From Kitchen 109.',
      'completed 3 items. Bathroom 116.',
      'assigned 3 items to Sam Rivera. Bathroom 116.',
    ]);
  });
});
