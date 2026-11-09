// The import against the shapes the live account sends, found on the first real read (9 November 2026):
// every tag on the account on every task with a selected flag, dropdowns by option id with -1 for
// nothing picked, no Location field, Duration and Priority, a last status change in place of a
// completion date, and the builder's own Action Items beside the list. All of it here is made up.

import { describe, expect, it } from 'vitest';
import {
  importCompletionList,
  NOT_SAID,
  parseDefinitions,
  tagIndex,
  type BtTask,
  type ImportOptions,
  type ImportSource,
} from '../src/index.js';

const J = 777;

const DEFS = [
  { customFieldId: 553297, label: 'Ready', dataType: 'CheckBox', isRequired: false, options: [] },
  {
    customFieldId: 553668,
    label: 'Waiting On',
    dataType: 'DropDownList',
    isRequired: false,
    options: [
      { id: 71, text: 'Owner', sortOrder: 1 },
      { id: 72, text: 'Subcontractor', sortOrder: 2 },
      { id: 73, text: 'Supplier', sortOrder: 3 },
      { id: 74, text: 'Ross Built', sortOrder: 4 },
    ],
  },
  { customFieldId: 554342, label: 'Ready By', dataType: 'Date', isRequired: false, options: [] },
  { customFieldId: 554343, label: 'Bought Out', dataType: 'CheckBox', isRequired: false, options: [] },
  { customFieldId: 554344, label: 'Purchase or Change Order', dataType: 'Text', isRequired: false, options: [] },
  {
    customFieldId: 554457,
    label: 'Duration',
    dataType: 'DropDownList',
    isRequired: false,
    options: [
      { id: 81, text: '0.5 day', sortOrder: 1 },
      { id: 82, text: '1 day', sortOrder: 2 },
      { id: 83, text: '2.5 days', sortOrder: 3 },
      { id: 84, text: '15 days', sortOrder: 4 },
    ],
  },
  {
    customFieldId: 554538,
    label: 'Priority',
    dataType: 'DropDownList',
    isRequired: false,
    options: [
      { id: 91, text: '1 High', sortOrder: 1 },
      { id: 92, text: '2 Medium', sortOrder: 2 },
      { id: 93, text: '3 Low', sortOrder: 3 },
    ],
  },
];

/** The account's tags as the tag list sends them. */
const ACCOUNT_TAGS = ['Plumbing', 'Painting', 'Stucco', 'Carpentry', 'Pool', 'DELETE', 'Garage 003', 'Kitchen 109', 'Pump Room', 'Site', 'Office'];
const TAG_LIST = ACCOUNT_TAGS.map((tagTitle, i) => ({ tagId: i + 1, tagTitle }));

/** Every tag on the account, the task's own marked selected: how the live task list sends them. */
const tags = (...own: string[]) => ACCOUNT_TAGS.map((name, i) => ({ key: null, id: i + 1, name, secondaryName: null, selected: own.includes(name), disabled: false }));

const sub = (id: number, name: string) => ({ assignedToId: id, name, loginType: 3 });
const user = (id: number, name: string) => ({ assignedToId: id, name, loginType: 1 });
const JAKE = user(900, 'Jake Ross');

interface Fields {
  ready?: boolean;
  waitingOn?: number;
  readyBy?: string;
  order?: string;
  duration?: number;
  priority?: number;
}

/** The field entries as the live list sends them: check boxes and text by value, dropdowns by option id, -1 for none. */
function fields(f: Fields): unknown[] {
  return [
    { customFieldId: 553297, dataType: 'CheckBox', value: f.ready ?? false },
    { customFieldId: 553668, dataType: 'DropDownList', selectedOptionId: f.waitingOn ?? -1 },
    { customFieldId: 554342, dataType: 'Date', value: f.readyBy ?? '' },
    { customFieldId: 554343, dataType: 'CheckBox', value: false },
    { customFieldId: 554344, dataType: 'Text', value: f.order ?? '' },
    { customFieldId: 554457, dataType: 'DropDownList', selectedOptionId: f.duration ?? -1 },
    { customFieldId: 554538, dataType: 'DropDownList', selectedOptionId: f.priority ?? -1 },
  ];
}

const base = { jobId: J, status: 0, hasAttachments: false, description: null, isDeleted: false };

function group(taskId: number, title: string, more: Partial<BtTask> = {}): BtTask {
  return { ...base, taskType: 1, taskId, externalId: `g-${taskId}`, ancestorId: null, title, tags: tags(), ...more };
}

function item(taskId: number, parentId: number | null, title: string, more: Partial<BtTask> = {}, f: Fields = {}): BtTask {
  return { ...base, taskType: 1, taskId, externalId: `t-${taskId}`, ancestorId: parentId, title, tags: tags(), customFieldValues: fields(f), ...more };
}

function source(tasks: BtTask[]): ImportSource {
  return { jobId: J, list: { tasks, jobs: [{ jobId: J, name: 'Sample-1 Shore Dr' }] }, definitions: parseDefinitions(DEFS), tagNames: tagIndex(TAG_LIST) };
}

const JOB = { name: 'Sample', address: '1 Shore Drive' };
const run = (tasks: BtTask[], options: ImportOptions = {}) => importCompletionList(source(tasks), { job: JOB, ...options });
const by = (list: ReturnType<typeof run>, id: string) => list.items.find((i) => i.btExternalId === id);

const GATOR = sub(501, 'Harbor Plumbing');
const HHH = sub(502, 'North Shore Painting, LLC');
const WATTS = sub(503, 'Bay Plastering and Stucco');
const SANGER = sub(504, 'Shoreline Pool and Spa LLC');

describe('the shapes the live account sends', () => {
  const tasks = [
    group(1, 'Kitchen 109'),
    item(11, 1, 'Install faucet', { assignments: [GATOR], tags: tags('Plumbing') }, { ready: true, order: 'PO-0006', duration: 81, priority: 91 }),
    item(12, 1, 'Paint ceiling', { assignments: [HHH], tags: tags('Painting') }, { waitingOn: 72, readyBy: '2026-12-01T00:00:00', order: 'None', duration: 83, priority: 93 }),
    item(13, 1, 'Paint trim', { assignments: [HHH], tags: tags('Painting') }, { order: 'Ross Built' }),
    item(14, 1, 'Remove old sink', { assignments: [GATOR], tags: tags('Plumbing', 'DELETE') }, { ready: true }),
    item(15, 1, 'Trim out disposal', { assignments: [GATOR], tags: tags('Plumbing'), status: 1, statusLastChangedById: 900, statusLastChangedDateUtc: '2026-10-08T14:45:58.153Z', addedByDateUtc: '2026-09-24T16:40:30.34Z' }, { ready: true, duration: 84 }),
  ];

  it('reads a task\'s own tags from the selected flags, and the tag list by tagTitle', () => {
    const imported = run(tasks);
    expect(tagIndex(TAG_LIST).get(1)).toBe('Plumbing');
    expect(imported.items.map((i) => [i.title, i.tradeName])).toEqual([
      ['Install faucet', 'Plumbing'],
      ['Paint ceiling', 'Painting'],
      ['Paint trim', 'Painting'],
      ['Trim out disposal', 'Plumbing'],
    ]);
    expect(imported.trades).toEqual(['Painting', 'Plumbing']);
    expect(imported.problems).toContain('1 item tagged DELETE was skipped.');
  });

  it('reads a dropdown by its option, and nothing picked as nothing', () => {
    const imported = run(tasks);
    expect(by(imported, 't-12')).toMatchObject({ ready: false, waitingOn: ['Subcontractor'], readyBy: '2026-12-01' });
    expect(by(imported, 't-11')).toMatchObject({ ready: true, waitingOn: [], readyBy: null });
    // Not ready and nothing picked: the app takes no item that waits on nothing.
    expect(by(imported, 't-13')).toMatchObject({ ready: false, waitingOn: [NOT_SAID] });
    expect(imported.problems).toContain(
      '1 open item is not ready but says nothing in Waiting On; it came in waiting on Not Said. Say what it is waiting on, or mark it ready.',
    );
  });

  it('turns Duration into hours at 8 a day, and Priority 1 High into wanted first', () => {
    const imported = run(tasks);
    expect(by(imported, 't-11')).toMatchObject({ hours: 4, priority: true });
    expect(by(imported, 't-12')).toMatchObject({ hours: 20, priority: false });
    expect(by(imported, 't-13')).toMatchObject({ hours: null, priority: false });
    expect(by(imported, 't-15')).toMatchObject({ hours: 120 });
  });

  it('keeps an order number and leaves out words written in its place', () => {
    const imported = run(tasks);
    expect(by(imported, 't-11')?.poOrCo).toBe('PO-0006');
    expect(by(imported, 't-12')?.poOrCo).toBeNull();
    expect(by(imported, 't-13')?.poOrCo).toBeNull();
    expect(imported.problems).toContain('2 items have words where the order number goes (None and Ross Built); those were left empty.');
  });

  it('dates a complete item by its last status change, and says when it was added', () => {
    const imported = run(tasks);
    expect(by(imported, 't-15')).toMatchObject({ status: 'complete', completedAt: '2026-10-08T14:45:58.153Z', addedAt: '2026-09-24T16:40:30.34Z', markedDoneAt: null });
    expect(imported.problems.some((p) => p.includes('no completion date'))).toBe(false);
  });

  it('does not ask for the Location field, which left Buildertrend with the room groups', () => {
    expect(run(tasks).problems.some((p) => p.includes('Location'))).toBe(false);
  });

  it('is pure and plain JSON', () => {
    const src = source(tasks);
    const before = structuredClone(src.list);
    const imported = importCompletionList(src, { job: JOB });
    expect(importCompletionList(src, { job: JOB })).toEqual(imported);
    expect(src.list).toEqual(before);
    expect(JSON.parse(JSON.stringify(imported))).toEqual(imported);
  });
});

describe('work a company marked complete itself', () => {
  it('comes in open, marked done that day, for the builder to check', () => {
    const imported = run([
      group(1, 'Kitchen 109'),
      item(11, 1, 'Grout backsplash', { assignments: [GATOR], tags: tags('Plumbing'), status: 1, statusLastChangedById: 501, statusLastChangedDateUtc: '2026-10-23T18:00:00Z' }, { ready: false }),
      item(12, 1, 'Seal backsplash', { assignments: [GATOR], tags: tags('Plumbing'), status: 1, statusLastChangedById: 900, statusLastChangedDateUtc: '2026-10-24T18:00:00Z' }, { ready: true }),
    ]);
    expect(by(imported, 't-11')).toMatchObject({ status: 'open', completedAt: null, markedDoneAt: '2026-10-23T18:00:00Z', ready: true, waitingOn: [] });
    expect(by(imported, 't-12')).toMatchObject({ status: 'complete', completedAt: '2026-10-24T18:00:00Z', markedDoneAt: null });
    expect(imported.problems).toContain(
      '1 item was marked complete in Buildertrend by the company itself; it came in open, marked done that day, for Ross Built to check and complete.',
    );
  });
});

describe("the job's own room list", () => {
  const ROOMS = [
    'Ground Level:',
    'Garage 003',
    'Level 1:',
    'Kitchen 109',
    'Dining 108',
    'Outside and Whole House:',
    'Tiki Deck',
    'Pool',
    'Site',
  ].join('\n');

  const tasks = [
    // Left from before the standard: a group named for the trade, each item's place a tag and the end of its title.
    group(1, 'Stucco', { status: 1, assignments: [WATTS] }),
    item(11, 1, 'Stucco around hose bib, SW corner, Garage 003', { assignments: [WATTS], tags: tags('Garage 003', 'Stucco'), status: 1, statusLastChangedById: 900, statusLastChangedDateUtc: '2026-10-08T14:00:00Z' }, { ready: true }),
    item(12, 1, 'Stucco pool walls, Pump Room', { assignments: [WATTS], tags: tags('Pump Room', 'Stucco') }, { ready: true }),
    item(13, 1, 'Patch stucco by the gate', { assignments: [WATTS], tags: tags('Stucco') }, { ready: true }),
    // A location that is also the name of a trade.
    group(2, 'Pool'),
    item(21, 2, 'Plaster pool', { assignments: [SANGER], tags: tags('Pool') }, { ready: true }),
    item(22, 2, 'Seal pool tile', { assignments: [HHH], tags: tags('Painting') }, { ready: true }),
    group(3, 'Kitchen 109'),
    item(31, 3, 'Install faucet', { assignments: [GATOR], tags: tags('Plumbing') }, { ready: true }),
    // Typed Task, but in a room group: work on the house all the same.
    { ...item(32, 3, 'Hook up hood power', { assignments: [GATOR] }, { ready: true }), taskType: 0 },
    group(4, 'Tiki Deck'),
    item(41, 4, 'Install hose bib', { assignments: [GATOR], tags: tags('Plumbing') }, { ready: true }),
  ];
  const options: ImportOptions = { rooms: ROOMS, places: { 'Pump Room': 'Garage 003' } };

  it('makes the locations from the list: its levels, its order, and the areas outside', () => {
    const imported = run(tasks, options);
    expect(imported.locations.map((l) => [l.label, l.floor, l.kind, l.sortOrder])).toEqual([
      ['Garage 003', 'Ground Level', 'room', 1],
      ['Kitchen 109', 'Level 1', 'room', 2],
      ['Dining 108', 'Level 1', 'room', 3],
      ['Tiki Deck', null, 'shared', 4],
      ['Pool', null, 'shared', 5],
      ['Site', null, 'shared', 6],
      ['North Elevation', null, 'shared', 7],
      ['South Elevation', null, 'shared', 8],
      ['East Elevation', null, 'shared', 9],
      ['West Elevation', null, 'shared', 10],
      ['Roof', null, 'shared', 11],
      ['Driveway', null, 'shared', 12],
      ['Whole House', null, 'shared', 13],
    ]);
  });

  it('places the items of a group that is not a location by the tag that names one, and takes the place off the title', () => {
    const imported = run(tasks, options);
    expect(imported.items.map((i) => `${i.locationLabel}: ${i.title} (${i.tradeName})`)).toEqual([
      'Garage 003: Stucco around hose bib, SW corner (Stucco)',
      'Garage 003: Stucco pool walls, Pump Room (Stucco)',
      'Kitchen 109: Install faucet (Plumbing)',
      'Kitchen 109: Hook up hood power (Plumbing)',
      'Tiki Deck: Install hose bib (Plumbing)',
      'Pool: Plaster pool (Pool)',
      'Pool: Seal pool tile (Painting)',
    ]);
    expect(by(imported, 't-11')).toMatchObject({ status: 'complete', completedAt: '2026-10-08T14:00:00Z' });
    expect(imported.problems).toEqual([
      "1 group in Buildertrend is not on the job's room list (Stucco), so its 3 items are treated as not in a room.",
      '1 task of type Task sits in a room group; it came in as a regular item.',
      '3 items are not in a room in Buildertrend: 2 were placed using their tags that name a location, and 1 was left out (Patch stucco by the gate).',
      '1 item has no trade tag; each item needs one.',
      '7 items came in as Incomplete, since Buildertrend does not say which are deficiencies; change any that are.',
    ]);
  });

  it('keeps a tag as the trade when it is the only one, even where it also names a location', () => {
    expect(by(run(tasks, options), 't-21')).toMatchObject({ locationLabel: 'Pool', tradeName: 'Pool', companyName: 'Shoreline Pool and Spa LLC' });
  });

  it('without a room list, makes every group a room, as before', () => {
    const imported = run(tasks);
    expect(imported.locations.filter((l) => l.kind === 'room').map((l) => l.label)).toEqual(['Stucco', 'Kitchen 109', 'Tiki Deck']);
    expect(by(imported, 't-13')?.locationLabel).toBe('Stucco');
  });
});

describe('titles', () => {
  const long = 'After the final: the welder hangs the mechanical room doors and pulls the temporary pool gate';
  const tasks = [group(1, 'Kitchen 109'), item(11, 1, long, { assignments: [GATOR], tags: tags('Plumbing'), descriptionPlainText: 'The louvered doors.' }, { ready: true })];

  it('cuts one over 80 characters at a whole word and keeps the full wording in the description', () => {
    const imported = run(tasks);
    const got = by(imported, 't-11');
    expect(got?.title).toBe('After the final: the welder hangs the mechanical room doors and pulls the');
    expect(got!.title.length).toBeLessThanOrEqual(80);
    expect(got?.description).toBe(`${long}\n\nThe louvered doors.`);
    expect(imported.problems).toContain(
      "1 title is longer than the app's 80 characters; it was cut at a whole word, with the full wording at the top of the description.",
    );
  });

  it('uses the title the job gives for a task instead', () => {
    const imported = run(tasks, { titles: { 't-11': 'After the final: hang the mechanical room doors and pull the pool gate' } });
    expect(by(imported, 't-11')).toMatchObject({ title: 'After the final: hang the mechanical room doors and pull the pool gate', description: 'The louvered doors.' });
    expect(imported.problems.some((p) => p.includes('longer than'))).toBe(false);
  });
});

describe('Action Items', () => {
  const tasks = [
    group(1, 'Kitchen 109'),
    item(11, 1, 'Install faucet', { assignments: [GATOR], tags: tags('Plumbing') }, { ready: true }),
    // The builder's own to-do list: type Task, in no room, a place as a tag, a due date.
    { ...item(51, null, 'Get the change order signed', { assignments: [JAKE], tags: tags('Office'), endDate: '2026-11-20T00:00:00', descriptionPlainText: 'Three are pending.' }), taskType: 0 },
    { ...item(52, null, 'Walk the lighting with the owners', { assignments: [user(901, 'Pat Lee'), JAKE], tags: tags('Site'), endDate: '2026-11-06T00:00:00' }), taskType: 0 },
    { ...item(53, null, 'Confirm which hallway is missing a fixture', { assignments: [JAKE], tags: tags() }), taskType: 0 },
    { ...item(54, null, 'Order the permit board', { assignments: [JAKE], tags: tags('Office'), status: 1 }), taskType: 0 },
    // A group of to-dos: its head is not one of them.
    { ...item(60, null, 'Permit checklist', { assignments: [JAKE] }), taskType: 0 },
    { ...item(61, 60, 'Post the permit', { assignments: [JAKE], endDate: '2026-11-01T00:00:00' }), taskType: 0 },
  ];

  it('stay in Buildertrend unless they are asked for', () => {
    const imported = run(tasks);
    expect(imported.items.map((i) => i.title)).toEqual(['Install faucet']);
    expect(imported.problems.some((p) => p.includes('Action Item'))).toBe(false);
  });

  it('come in open and ready, assigned to their own people, each where its tag says or at the desk', () => {
    const imported = run(tasks, { actionItems: { place: 'Office' } });
    const actions = imported.items.filter((i) => i.actionItem);
    expect(actions.map((i) => [i.locationLabel, i.title, i.due, i.assignedTo])).toEqual([
      ['Site', 'Walk the lighting with the owners', '2026-11-06', ['Pat Lee', 'Jake Ross']],
      ['Office', 'Post the permit', '2026-11-01', ['Jake Ross']],
      ['Office', 'Get the change order signed', '2026-11-20', ['Jake Ross']],
      ['Office', 'Confirm which hallway is missing a fixture', null, ['Jake Ross']],
    ]);
    for (const a of actions) expect(a).toMatchObject({ status: 'open', ready: true, waitingOn: [], companyName: null, tradeName: null, kind: 'completion' });
    expect(by(imported, 't-51')?.description).toBe('Three are pending.');
    // The desk is a location of its own, after the areas outside.
    expect(imported.locations[imported.locations.length - 1]).toEqual({ label: 'Office', name: 'Office', number: null, floor: null, kind: 'shared', sortOrder: 11 });
    expect(imported.problems).toContain(
      '4 open Action Items came in, assigned to the people they are assigned to in Buildertrend. 3 have a due date in Buildertrend, which the app has no place for yet.',
    );
    // The companies and trades are the list's own.
    expect(imported.companies).toEqual([{ name: 'Harbor Plumbing', tradeName: 'Plumbing' }]);
  });
});

describe("the companies' people", () => {
  const tasks = [
    group(1, 'Kitchen 109'),
    item(11, 1, 'Install faucet', { assignments: [GATOR], tags: tags('Plumbing') }, { ready: true }),
    item(12, 1, 'Paint ceiling', { assignments: [HHH], tags: tags('Painting') }, { ready: true }),
    item(13, 1, 'Patch stucco', { assignments: [sub(503, 'Bay  Plastering , LLC ')], tags: tags('Stucco') }, { ready: true }),
    item(14, 1, 'Plaster pool', { assignments: [sub(504, 'ALL POOLS INC')], tags: tags('Pool') }, { ready: true }),
    item(15, 1, 'Clean up', { assignments: [sub(505, 'Ross Built Crew')], tags: tags('Carpentry') }, { ready: true }),
  ];
  const subs = [
    { id: 501, company: 'Harbor Plumbing', primaryContact: 'Sam', businessPhone: '9415550100', cellPhone: '(941) 555-0123', emails: [{ emailAddress: 'Sam@HarborPlumbing.example', friendlyName: 'Estimator' }, { emailAddress: 'office@harborplumbing.example', friendlyName: '' }, { emailAddress: 'not an email', friendlyName: '' }] },
    { id: 502, company: 'North Shore Painting, LLC', primaryContact: 'Robin', businessPhone: '1-941-555-0188', cellPhone: '', emails: [{ emailAddress: 'robin@northshorepainting.example', friendlyName: '' }] },
    { id: 503, company: 'Bay Plastering, LLC', primaryContact: '', businessPhone: '941 555 0111 ext 4', cellPhone: '', emails: [] },
    { id: 504, company: 'ALL POOLS INC', primaryContact: '', businessPhone: '', cellPhone: '', emails: [] },
  ];

  it('are one for each email, named by the email or the primary contact, with the phone on the first', () => {
    const imported = run(tasks, { subs, companyNames: { 'ALL POOLS INC': 'All Pools Inc' } });
    expect(imported.companies.map((c) => c.name)).toEqual(['All Pools Inc', 'Bay Plastering, LLC', 'Harbor Plumbing', 'North Shore Painting, LLC', 'Ross Built Crew']);
    expect(imported.contacts).toEqual([
      { companyName: 'Bay Plastering, LLC', name: '', email: null, phone: '941 555 0111 ext 4' },
      { companyName: 'Harbor Plumbing', name: 'Estimator', email: 'sam@harborplumbing.example', phone: '941 555 0123' },
      { companyName: 'Harbor Plumbing', name: '', email: 'office@harborplumbing.example', phone: null },
      { companyName: 'North Shore Painting, LLC', name: 'Robin', email: 'robin@northshorepainting.example', phone: '941 555 0188' },
    ]);
    expect(imported.problems).toContain('2 companies have nobody with an email or a phone in Buildertrend (All Pools Inc and Ross Built Crew), so their lists have nowhere to go yet.');
    expect(imported.problems).toContain('1 email address in Buildertrend does not read as an email; it was left out.');
  });

  it('are left out when the records were not read', () => {
    const imported = run(tasks);
    expect(imported.contacts).toEqual([]);
    expect(imported.problems.some((p) => p.includes('nowhere to go'))).toBe(false);
  });
});

describe('done work and stale tags', () => {
  it('brings done work in ready, whatever it was waiting on', () => {
    const imported = run([
      group(1, 'Kitchen 109'),
      item(11, 1, 'Install hood', { assignments: [GATOR], tags: tags('Plumbing'), status: 1, statusLastChangedById: 900, statusLastChangedDateUtc: '2026-10-22T15:00:00Z' }, { ready: false, waitingOn: 74, readyBy: '2026-10-20T00:00:00' }),
    ]);
    expect(by(imported, 't-11')).toMatchObject({ status: 'complete', ready: true, waitingOn: [], readyBy: null });
    expect(imported.problems).toContain('1 complete item still said what it was waiting on; it was imported as ready, since the work is done.');
  });

  it("gives a company its own trade, not the builder's name left on some of its items", () => {
    const DESIGNER = sub(506, 'Shore Interiors');
    const CREW = sub(507, 'Ross Built Crew');
    const account = [...ACCOUNT_TAGS, 'Ross Built', 'Window Treatments'];
    const own = (...names: string[]) => account.map((name, i) => ({ id: i + 1, name, selected: names.includes(name) }));
    const imported = run([
      group(1, 'Kitchen 109'),
      item(11, 1, 'Hang mirrors', { assignments: [DESIGNER], tags: own('Ross Built') }, { ready: true }),
      item(12, 1, 'Hang more mirrors', { assignments: [DESIGNER], tags: own('Ross Built') }, { ready: true }),
      item(13, 1, 'Install draperies', { assignments: [DESIGNER], tags: own('Window Treatments') }, { ready: true }),
      item(14, 1, 'Final clean', { assignments: [CREW], tags: own('Ross Built') }, { ready: true }),
    ]);
    expect(imported.companies).toEqual([
      { name: 'Ross Built Crew', tradeName: 'Ross Built' },
      { name: 'Shore Interiors', tradeName: 'Window Treatments' },
    ]);
    // In the app the trade follows the company, so the mirrors come in under the company's own trade.
    expect(by(imported, 't-11')?.tradeName).toBe('Window Treatments');
    expect(by(imported, 't-14')?.tradeName).toBe('Ross Built');
    expect(imported.trades).toEqual(['Ross Built', 'Window Treatments']);
    expect(imported.problems).toContain(
      "2 items carry a trade tag that is not their company's own trade (Shore Interiors); in the app the trade follows the company, so each came in under its company's trade.",
    );
  });

  it("keeps the builder's name as the trade of its own crew, whatever else a few of its items are tagged", () => {
    const CREW = sub(507, 'Ross Built Crew');
    const account = [...ACCOUNT_TAGS, 'Ross Built'];
    const own = (...names: string[]) => account.map((name, i) => ({ id: i + 1, name, selected: names.includes(name) }));
    const imported = run([
      group(1, 'Kitchen 109'),
      item(11, 1, 'Final clean', { assignments: [CREW], tags: own('Ross Built') }, { ready: true }),
      item(12, 1, 'Install flood vent', { assignments: [CREW], tags: own('Ross Built') }, { ready: true }),
      item(13, 1, 'Install silt fence', { assignments: [CREW], tags: own('Site') }, { ready: true }),
      item(14, 1, 'Store the light', { assignments: [CREW], tags: own() }, { ready: true }),
    ]);
    expect(imported.companies).toEqual([{ name: 'Ross Built Crew', tradeName: 'Ross Built' }]);
    expect(imported.items.map((i) => i.tradeName)).toEqual(['Ross Built', 'Ross Built', 'Ross Built', 'Ross Built']);
  });
});
