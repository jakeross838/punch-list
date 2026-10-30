import { describe, expect, it } from 'vitest';
import {
  importCompletionList,
  isAddedScope,
  JOBS,
  readForImport,
  readOnlyTransport,
  splitWaitingOn,
  TASK_FIELDS,
  type BtTask,
  type TaskFieldKey,
} from '../src/index.js';
import { FakeBuildertrend, fishFixture } from './fakeBuildertrend.js';

const FISH = { name: 'Fish', address: '715 North Shore Drive' };
const J = JOBS.fish;

async function importFrom(tasks: BtTask[], job: typeof FISH | null = FISH) {
  const fake = new FakeBuildertrend(tasks);
  const source = await readForImport(fake, J);
  return { fake, source, imported: importCompletionList(source, job ? { job } : {}) };
}

// ---------- a fuller Fish-like list ----------

const base = { jobId: J, taskType: 1, status: 0, hasAttachments: false, description: null };

function group(taskId: number, title: string, more: Partial<BtTask> = {}): BtTask {
  return { ...base, taskId, externalId: `group-${taskId}`, ancestorId: null, title, ...more };
}

function task(
  taskId: number,
  parentId: number,
  title: string,
  more: Partial<BtTask> = {},
  values: Partial<Record<TaskFieldKey, unknown>> = {},
): BtTask {
  const customFieldValues = (Object.keys(values) as TaskFieldKey[]).map((key) => ({ customFieldId: TASK_FIELDS[key], value: values[key] }));
  return { ...base, taskId, externalId: `task-${taskId}`, ancestorId: parentId, title, customFieldValues, ...more };
}

const sub = (id: number, name: string) => ({ assignedToId: id, name, loginType: 3 });
const user = (id: number, name: string) => ({ assignedToId: id, name, loginType: 1 });
const tag = (id: number, name: string) => ({ id, name });
// Stand-in tag ids: 1 Plumbing, 2 Painting, 3 DELETE. Location options: 9001 Kitchen 109, 9002 Master Bathroom 207, 9003 Whole House.

function fullList(): BtTask[] {
  return [
    group(1, '109 kitchen'),
    group(2, 'Laundry 119'),
    group(3, 'Kitchen 109'),
    group(4, 'Old Office 999', { tags: [3] }),
    group(5, 'Whole House'),
    group(6, '123'),
    task(11, 1, 'install pendant lights.', { assignments: [sub(501, 'Metro Electric')], tags: [tag(10, 'Electrical')] }, { ready: false, waitingOn: 'owner and Volcano Stone', readyBy: '10/30/2026' }),
    task(12, 1, 'Set upper cabinets', { assignments: [sub(502, 'SMS Carpentry')], tags: [tag(11, 'Carpentry')] }, { location: 9002, ready: false, waitingOn: 'Owner, SMS carpentry & ross built / owner' }),
    task(13, 3, 'Install closet system', { assignments: [sub(502, 'SMS Carpentry')], tags: [tag(11, 'Carpentry')] }, { ready: true, boughtOut: true, poOrCo: 'CO-14' }),
    task(21, 2, 'Install shower glass', { status: 1, completedDate: '2026-10-20T15:04:00', assignments: [sub(503, 'Bay and Gulf Glass')], tags: [tag(12, 'Glass')] }, { ready: true, boughtOut: true }),
    task(22, 2, 'Paint laundry cabinets', { assignments: [sub(504, 'Triple H Painting')], tags: [2, tag(11, 'Carpentry')] }, { ready: false, waitingOn: 'Bay and Gulf Glass and owner', readyBy: 'next week' }),
    task(23, 2, 'Clean laundry', { assignments: [user(601, 'Jake Ross')], tags: [tag(13, 'Ross Built Crew')] }, { ready: true, waitingOn: 'Owner' }),
    task(24, 2, 'Install hose bib', { assignments: [sub(505, 'Gator Plumbing'), sub(501, 'Metro Electric')], tags: [1] }, { ready: true }),
    task(25, 2, 'Fix leak', { status: 1, assignments: [sub(505, 'Gator Plumbing')], tags: [1] }, { ready: false }),
    task(26, 2, 'Install towel bar', { assignments: [sub(502, 'SMS Carpentry')], tags: [3] }),
    task(27, 2, 'Seal grout', { assignments: [{ assignedToId: 777 }], tags: [99] }, { ready: true }),
    task(41, 4, 'Patch drywall', { assignments: [sub(504, 'Triple H Painting')], tags: [2] }, { location: 9003, ready: true }),
    task(42, 4, 'Replace outlet cover', { assignments: [sub(501, 'Metro Electric')], tags: [tag(10, 'Electrical')] }, { ready: true }),
    task(51, 5, 'Mount thermostats', { assignments: [sub(506, 'Climatic')], tags: [tag(14, 'Air Conditioning')], descriptionPlainText: 'Added scope, all zones.' }, { ready: false, waitingOn: 'Ross Built', boughtOut: true }),
    task(61, 6, 'Hang mirror', { assignments: [sub(502, 'SMS Carpentry')], tags: [tag(11, 'Carpentry')] }, { location: 9001, ready: true }),
    task(71, 22, 'Adjust cabinet door', { assignments: [sub(502, 'SMS Carpentry')], tags: [tag(11, 'Carpentry')] }, { ready: true }),
    task(81, 999, 'Clean windows', { assignments: [user(601, 'Jake Ross')], tags: [tag(13, 'Ross Built Crew')] }, { ready: true }),
  ];
}

const SHARED_AFTER_WHOLE_HOUSE = ['North Elevation', 'South Elevation', 'East Elevation', 'West Elevation', 'Roof', 'Pool', 'Driveway', 'Site'];

describe('import of the Fish list from the stand-in', () => {
  it('reads only, and the counts match the list', async () => {
    const tasks = fishFixture(J);
    const { fake, imported } = await importFrom(tasks);
    expect(fake.calls).toEqual([
      'GET /api/jobpicker/GetExistingJobList',
      'GET /apix/v2/CustomFields/15/definitions',
      'GET /apix/v2/Tasks/tags',
      'POST /apix/v2/Tasks/list',
    ]);
    expect(fake.tasks).toEqual(tasks);

    expect(imported.job).toEqual(FISH);
    expect(imported.locations.filter((l) => l.kind === 'room').map((l) => l.label)).toEqual(['Kitchen 109', 'Master Bathroom 207']);
    expect(imported.locations.filter((l) => l.kind === 'shared')).toHaveLength(9);
    expect(imported.items.map((i) => [i.locationLabel, i.title, i.status])).toEqual([
      ['Kitchen 109', 'Install toilet', 'open'],
      ['Kitchen 109', 'Touch up paint', 'complete'],
      ['Master Bathroom 207', 'Adjust latch', 'open'],
    ]);
    expect(imported.companies).toEqual([
      { name: 'Gator Plumbing', tradeName: 'Plumbing' },
      { name: 'Triple H Painting', tradeName: 'Painting' },
    ]);
    expect(imported.trades).toEqual(['Painting', 'Plumbing']);
  });

  it('carries every field of an item the way the app keeps it', async () => {
    const { imported } = await importFrom(fishFixture(J));
    expect(imported.items[0]).toEqual({
      btExternalId: 'item-11',
      locationLabel: 'Kitchen 109',
      title: 'Install toilet',
      description: 'Toilet room, left of the vanity.',
      tradeName: 'Plumbing',
      companyName: 'Gator Plumbing',
      ready: false,
      waitingOn: ['Volcano Stone'],
      readyBy: '2026-11-02',
      boughtOut: true,
      poOrCo: 'PO-0090',
      kind: 'completion',
      status: 'open',
      completedAt: null,
    });
  });

  it('reports what does not fit the standard in plain sentences, with counts', async () => {
    const { imported } = await importFrom(fishFixture(J));
    expect(imported.problems).toEqual([
      '1 item tagged DELETE was skipped.',
      '1 item was nested more than one level deep; it was imported into its room as a regular item.',
      '1 item is not in a room in Buildertrend and was left out: Clean windows.',
      '1 item has no company assigned; each item needs one.',
      '1 item has no trade tag; each item needs one.',
      '1 open item is not ready but says nothing in Waiting On; say what it is waiting on, or mark it ready.',
      '3 items came in as Incomplete, since Buildertrend does not say which are deficiencies; change any that are.',
      '1 complete item has no completion date from Buildertrend; the app will date it the day it is loaded.',
    ]);
  });
});

describe('import of a fuller list', () => {
  it('builds the rooms with the app room rules, in Buildertrend order, then the shared areas', async () => {
    const { imported } = await importFrom(fullList());
    expect(imported.locations.slice(0, 3)).toEqual([
      { label: 'Kitchen 109', name: 'Kitchen', number: '109', floor: null, kind: 'room', sortOrder: 1 },
      { label: 'Laundry 119', name: 'Laundry', number: '119', floor: null, kind: 'room', sortOrder: 2 },
      { label: 'Whole House', name: 'Whole House', number: null, floor: null, kind: 'shared', sortOrder: 3 },
    ]);
    expect(imported.locations.slice(3).map((l) => [l.label, l.kind])).toEqual(SHARED_AFTER_WHOLE_HOUSE.map((name) => [name, 'shared']));
  });

  it('places every item it can and counts open, complete, companies and trades', async () => {
    const { imported } = await importFrom(fullList());
    expect(imported.items.map((i) => `${i.locationLabel}: ${i.title}`)).toEqual([
      'Kitchen 109: Install pendant lights',
      'Kitchen 109: Set upper cabinets',
      'Kitchen 109: Install closet system',
      'Kitchen 109: Hang mirror',
      'Laundry 119: Install shower glass',
      'Laundry 119: Paint laundry cabinets',
      'Laundry 119: Clean laundry',
      'Laundry 119: Install hose bib',
      'Laundry 119: Fix leak',
      'Laundry 119: Seal grout',
      'Laundry 119: Adjust cabinet door',
      'Whole House: Mount thermostats',
      'Whole House: Patch drywall',
    ]);
    expect(imported.items.filter((i) => i.status === 'open')).toHaveLength(11);
    expect(imported.items.filter((i) => i.status === 'complete')).toHaveLength(2);
    expect(imported.companies).toEqual([
      { name: 'Bay and Gulf Glass', tradeName: 'Glass' },
      { name: 'Climatic', tradeName: 'Air Conditioning' },
      { name: 'Gator Plumbing', tradeName: 'Plumbing' },
      { name: 'Metro Electric', tradeName: 'Electrical' },
      { name: 'Ross Built', tradeName: 'Ross Built Crew' },
      { name: 'SMS Carpentry', tradeName: 'Carpentry' },
      { name: 'Triple H Painting', tradeName: 'Painting' },
    ]);
    expect(imported.trades).toEqual(['Air Conditioning', 'Carpentry', 'Electrical', 'Glass', 'Painting', 'Plumbing', 'Ross Built Crew']);
  });

  it('skips anything tagged DELETE, item or room group', async () => {
    const { imported } = await importFrom(fullList());
    const ids = imported.items.map((i) => i.btExternalId);
    expect(ids).not.toContain('task-26');
    expect(imported.locations.map((l) => l.label)).not.toContain('Old Office 999');
    // The items in the DELETE room group are not tagged themselves: one goes by its Location field, one is left out.
    expect(imported.items.find((i) => i.btExternalId === 'task-41')?.locationLabel).toBe('Whole House');
    expect(ids).not.toContain('task-42');
  });

  it('keeps complete items complete, with the completion date when Buildertrend has one', async () => {
    const { imported } = await importFrom(fullList());
    const byId = (id: string) => imported.items.find((i) => i.btExternalId === id);
    expect(byId('task-21')).toMatchObject({ status: 'complete', completedAt: '2026-10-20T15:04:00', ready: true });
    // Complete, not ready and waiting on nothing: the work is done, so it comes in ready.
    expect(byId('task-25')).toMatchObject({ status: 'complete', completedAt: null, ready: true, waitingOn: [] });
    expect(byId('task-11')).toMatchObject({ status: 'open', completedAt: null });
  });

  it('splits Waiting On into names, with the companies on the job spelled their own way', async () => {
    const { imported } = await importFrom(fullList());
    const waiting = (id: string) => imported.items.find((i) => i.btExternalId === id)?.waitingOn;
    expect(waiting('task-11')).toEqual(['Owner', 'Volcano Stone']);
    expect(waiting('task-12')).toEqual(['Owner', 'SMS Carpentry', 'Ross Built']);
    expect(waiting('task-22')).toEqual(['Bay and Gulf Glass', 'Owner']);
    expect(waiting('task-51')).toEqual(['Ross Built']);
    // Ready items wait on nothing, as in the app.
    expect(waiting('task-23')).toEqual([]);
  });

  it('reads company, trade, kind and Ready By by the standard', async () => {
    const { imported } = await importFrom(fullList());
    const byId = (id: string) => imported.items.find((i) => i.btExternalId === id);
    expect(byId('task-11')).toMatchObject({ title: 'Install pendant lights', readyBy: '2026-10-30', kind: 'completion' });
    expect(byId('task-12')?.locationLabel).toBe('Kitchen 109');
    expect(byId('task-13')).toMatchObject({ kind: 'added_scope', poOrCo: 'CO-14', boughtOut: true });
    expect(byId('task-51')).toMatchObject({ kind: 'added_scope', poOrCo: null, boughtOut: false });
    expect(byId('task-22')).toMatchObject({ tradeName: 'Painting', readyBy: null });
    expect(byId('task-23')?.companyName).toBe('Ross Built');
    expect(byId('task-24')?.companyName).toBe('Gator Plumbing');
    expect(byId('task-27')).toMatchObject({ companyName: null, tradeName: null });
    expect(byId('task-71')?.locationLabel).toBe('Laundry 119');
  });

  it('reports each kind of problem once, with counts', async () => {
    const { imported } = await importFrom(fullList());
    expect(imported.problems).toEqual([
      '1 room group tagged DELETE was skipped (Old Office 999); the 2 items in it are treated as not in a room.',
      'Kitchen 109 appears as 2 room groups in Buildertrend; their items were put together under one room.',
      '1 room group has no room name (123), so its items are treated as not in a room.',
      '1 item tagged DELETE was skipped.',
      '1 item was nested more than one level deep; it was imported into its room as a regular item.',
      '4 items are not in a room in Buildertrend: 2 were placed using their Location field, and 2 were left out (Replace outlet cover and Clean windows).',
      '1 item has a Location field that names a different room than its room group; the room group was used.',
      '1 item is assigned to a company whose name Buildertrend did not return, so it has no company.',
      '1 item is assigned to a Ross Built user rather than a company, so the company was set to Ross Built.',
      '1 item is assigned to more than one company; the first company was used.',
      '1 item has a trade tag whose name Buildertrend did not return, so it has no trade.',
      '1 item has more than one trade tag; the first tag was used.',
      '1 complete item had Ready unchecked and nothing in Waiting On; it was imported as ready, since the work is done.',
      '1 open item is marked Ready but also has Waiting On or Ready By filled in; those were left empty, as the app does for ready items.',
      '1 item has a Ready By that is not a date; it was left empty.',
      '2 items were set to Additional because the PO / CO field holds a change order number or the item says added scope; check that these are right.',
      '1 item marked Additional is Bought Out in Buildertrend with no order number; the app shows it under Needs a Price until it has one.',
      '11 items came in as Incomplete, since Buildertrend does not say which are deficiencies; change any that are.',
      '1 complete item has no completion date from Buildertrend; the app will date it the day it is loaded.',
    ]);
  });

  it('is pure: the same answer every time, plain JSON, and the read is left as it was', async () => {
    const { source, imported } = await importFrom(fullList());
    const before = structuredClone(source.list);
    expect(importCompletionList(source, { job: FISH })).toEqual(imported);
    expect(source.list).toEqual(before);
    expect(JSON.parse(JSON.stringify(imported))).toEqual(imported);
  });
});

describe('room groups that read as floors', () => {
  it('gives the rooms after a floor name that floor, and says so', async () => {
    const { imported } = await importFrom([
      group(1, 'Level 1:'),
      group(2, 'Kitchen 109'),
      group(3, 'Level 2:'),
      group(4, 'Master Bathroom 207'),
      group(5, 'Roof'),
    ]);
    expect(imported.locations.slice(0, 3).map((l) => [l.label, l.floor, l.kind])).toEqual([
      ['Kitchen 109', 'Level 1', 'room'],
      ['Master Bathroom 207', 'Level 2', 'room'],
      ['Roof', null, 'shared'],
    ]);
    expect(imported.problems).toEqual([
      '2 room groups read as floor names (Level 1: and Level 2:), so the rooms after each were given its floor.',
    ]);
  });
});

describe('room spelling', () => {
  it('spells each room and shared area one way, on the room list and on every item', async () => {
    const { imported } = await importFrom([
      group(1, 'kitchen 109'),
      group(2, 'KITCHEN 109'),
      group(3, 'WHOLE HOUSE'),
      task(11, 1, 'Install pendant lights', { assignments: [sub(501, 'Metro Electric')], tags: [tag(10, 'Electrical')] }, { ready: true }),
      task(12, 2, 'Set upper cabinets', { assignments: [sub(502, 'SMS Carpentry')], tags: [tag(11, 'Carpentry')] }, { ready: true }),
      task(13, 3, 'Mount thermostats', { assignments: [sub(506, 'Climatic')], tags: [tag(14, 'Air Conditioning')] }, { ready: true }),
    ]);
    expect(imported.locations.slice(0, 2)).toEqual([
      { label: 'Kitchen 109', name: 'Kitchen', number: '109', floor: null, kind: 'room', sortOrder: 1 },
      { label: 'Whole House', name: 'Whole House', number: null, floor: null, kind: 'shared', sortOrder: 2 },
    ]);
    expect(imported.locations.filter((l) => l.label.toLowerCase() === 'whole house')).toHaveLength(1);
    expect(imported.items.map((i) => i.locationLabel)).toEqual(['Kitchen 109', 'Kitchen 109', 'Whole House']);
  });
});

describe('the job', () => {
  it('uses the name and address it is given', async () => {
    expect((await importFrom(fishFixture(J))).imported.job).toEqual(FISH);
  });

  it('takes them from the jobs list Buildertrend sends with the tasks', async () => {
    const { source } = await importFrom(fishFixture(J), null);
    const withJob = { ...source, list: { ...source.list, jobs: [{ jobId: J, jobName: 'Fish Residence', address: '715 North Shore Drive' }] } };
    const imported = importCompletionList(withJob);
    expect(imported.job).toEqual({ name: 'Fish Residence', address: '715 North Shore Drive' });
    expect(imported.problems.some((p) => p.includes("job's name"))).toBe(false);
  });

  it('says so when Buildertrend has no name for it', async () => {
    const { imported } = await importFrom(fishFixture(J), null);
    expect(imported.job).toEqual({ name: `Buildertrend job ${J}`, address: null });
    expect(imported.problems[0]).toBe(`Buildertrend did not return the job's name, so it is called "Buildertrend job ${J}" until it is renamed in the app.`);
  });
});

describe('Waiting On text', () => {
  it('splits at commas, "and", "&" and "/", each name once, with proper capitals', () => {
    expect(splitWaitingOn('Owner and Volcano Stone')).toEqual(['Owner', 'Volcano Stone']);
    expect(splitWaitingOn('Owner, SMS Carpentry')).toEqual(['Owner', 'SMS Carpentry']);
    expect(splitWaitingOn('owner & volcano stone/Ross Built')).toEqual(['Owner', 'Volcano Stone', 'Ross Built']);
    expect(splitWaitingOn('Owner, Ross Built, and Volcano Stone')).toEqual(['Owner', 'Ross Built', 'Volcano Stone']);
    expect(splitWaitingOn('Owner; owner , OWNER')).toEqual(['Owner']);
    expect(splitWaitingOn('Owner\nVolcano Stone')).toEqual(['Owner', 'Volcano Stone']);
  });

  it('keeps names whole that hold a separator', () => {
    expect(splitWaitingOn('D&D Air Conditioning and Owner')).toEqual(['D&D Air Conditioning', 'Owner']);
    expect(splitWaitingOn('Owner / A/C Guys')).toEqual(['Owner', 'A/C Guys']);
    expect(splitWaitingOn('bay and gulf glass and owner', ['Owner', 'Bay and Gulf Glass'])).toEqual(['Bay and Gulf Glass', 'Owner']);
  });

  it('uses the first spelling of a known name', () => {
    expect(splitWaitingOn('ross built', ['Ross Built', 'Owner', 'ROSS BUILT'])).toEqual(['Ross Built']);
  });

  it('gives nothing for empty text', () => {
    expect(splitWaitingOn('')).toEqual([]);
    expect(splitWaitingOn(null)).toEqual([]);
    expect(splitWaitingOn(' , & ')).toEqual([]);
  });
});

describe('added scope', () => {
  it('is a change order number in PO / CO, or the words added scope on the item', () => {
    expect(isAddedScope('CO-14', 'Install closet system', '')).toBe(true);
    expect(isAddedScope('Change Order #3', 'Install wine racks', '')).toBe(true);
    expect(isAddedScope('PO-0090 / CO 2', 'Install toilet', '')).toBe(true);
    expect(isAddedScope(null, 'Install outdoor shower', 'Added scope per the owner.')).toBe(true);
    expect(isAddedScope(null, 'Added-scope wine room racks', '')).toBe(true);
  });

  it('is in scope otherwise', () => {
    expect(isAddedScope('PO-0090', 'Install toilet', '')).toBe(false);
    expect(isAddedScope('ECO 12', 'Install toilet', '')).toBe(false);
    expect(isAddedScope('COI 2026', 'Install toilet', '')).toBe(false);
    expect(isAddedScope(null, 'Add grab bar', 'Scope of work as drawn.')).toBe(false);
  });
});

describe('read only', () => {
  it('refuses every write before it goes out', async () => {
    const fake = new FakeBuildertrend(fishFixture(J));
    const reader = readOnlyTransport(fake);
    const writes: Array<[Parameters<typeof reader.request>[0], string]> = [
      ['POST', '/apix/v2/Tasks'],
      ['POST', '/apix/v2/Tasks/bulk-delete'],
      ['PATCH', '/apix/v2/Tasks/item-11'],
      ['PUT', '/apix/v2/Tasks/status/item-11'],
      ['PUT', '/apix/v2/Tasks/item-11/tags'],
      ['DELETE', '/apix/v2/Tasks/item-11'],
    ];
    for (const [method, path] of writes) {
      await expect(reader.request(method, path, {})).rejects.toThrow(/refused, the import only reads/);
    }
    expect(fake.calls).toEqual([]);
    await expect(reader.request('GET', '/apix/v2/Tasks/tags')).resolves.toMatchObject({ status: 200 });
    await expect(reader.request('POST', '/apix/v2/Tasks/list', { jobIds: [J] })).resolves.toMatchObject({ status: 200 });
  });
});
