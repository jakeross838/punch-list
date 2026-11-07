import { describe, expect, it } from 'vitest';
import {
  inWalkOrder,
  jsonIn,
  levelName,
  levelNames,
  locationGroups,
  moveLevel,
  moveToLevel,
  newLocation,
  outsideAreas,
  planChange,
  planPieces,
  picturesNote,
  planJobFields,
  planLocations,
  planPrompt,
  plansAsText,
  readingOrder,
  readPlanAnswer,
  SHARED_AREAS,
  SHARED_GROUP,
  type Location,
  type PageText,
} from '../src/index';

let n = 0;
function loc(label: string, floor: string | null, over: Partial<Location> = {}): Location {
  n += 1;
  const m = label.match(/^(.*?) (\d+[A-Z]?)$/);
  return {
    id: over.id ?? `l${n}`,
    jobId: 'j1',
    name: m ? m[1]! : label,
    number: m ? m[2]! : null,
    label,
    floor,
    kind: 'room',
    sortOrder: n,
    active: true,
    walkedAt: null,
    ...over,
  };
}

describe('the walk order in Job Setup', () => {
  it('keeps each level together and the outside and whole house areas last', () => {
    n = 0;
    const list = [
      loc('Garage 101', 'Level 1'),
      loc('North Elevation', null, { kind: 'shared' }),
      loc('Office 301', 'Level 3'),
      loc('Kitchen 109', 'Level 1'),
      loc('Roof', null, { kind: 'shared' }),
    ];
    expect(locationGroups(list).map((g) => [g.name, g.locations.map((l) => l.label)])).toEqual([
      ['Level 1', ['Garage 101', 'Kitchen 109']],
      ['Level 3', ['Office 301']],
      [SHARED_GROUP, ['North Elevation', 'Roof']],
    ]);
    expect(inWalkOrder(list).map((l) => l.label)).toEqual(['Garage 101', 'Kitchen 109', 'Office 301', 'North Elevation', 'Roof']);
    expect(levelNames(list)).toEqual(['Level 1', 'Level 3']);
  });

  it('moves a level up or down past the next one, never past the outside areas', () => {
    n = 0;
    const list = [loc('Garage 101', 'Level 1'), loc('Bed 201', 'Level 2'), loc('Roof', null, { kind: 'shared' })];
    expect(moveLevel(list, 'Level 2', -1)?.map((l) => l.label)).toEqual(['Bed 201', 'Garage 101', 'Roof']);
    expect(moveLevel(list, 'level 1', 1)?.map((l) => l.label)).toEqual(['Bed 201', 'Garage 101', 'Roof']);
    expect(moveLevel(list, 'Level 2', 1)).toBeNull();
    expect(moveLevel(list, 'Level 1', -1)).toBeNull();
  });

  it('moves a location to the end of another level, or outside', () => {
    n = 0;
    const list = [loc('Garage 101', 'Level 1'), loc('Kitchen 109', 'Level 1'), loc('Bed 201', 'Level 2'), loc('Roof', null, { kind: 'shared' })];
    const kitchen = list[1]!.id;
    const moved = moveToLevel(list, kitchen, { floor: 'Level 2', kind: 'room' });
    expect(moved.map((l) => [l.label, l.floor])).toEqual([
      ['Garage 101', 'Level 1'],
      ['Bed 201', 'Level 2'],
      ['Kitchen 109', 'Level 2'],
      ['Roof', null],
    ]);
    const outside = moveToLevel(list, kitchen, { floor: 'Level 1', kind: 'shared' });
    expect(outside.map((l) => l.label)).toEqual(['Garage 101', 'Bed 201', 'Roof', 'Kitchen 109']);
    expect(outside.find((l) => l.id === kitchen)).toMatchObject({ kind: 'shared', floor: null });
    // A new level comes before the outside areas.
    expect(moveToLevel(list, kitchen, { floor: 'Roof Deck', kind: 'room' }).map((l) => l.label)).toEqual(['Garage 101', 'Bed 201', 'Kitchen 109', 'Roof']);
  });

  it('reads a level name and says why one cannot be used', () => {
    expect(levelName('  level 3: ', ['Level 1'])).toEqual({ name: 'Level 3' });
    expect(levelName('LEVEL 1', ['Level 1'], 'Level 1')).toEqual({ name: 'LEVEL 1' });
    expect(levelName('level 1', ['Level 1', 'Level 2'], 'Level 2')).toEqual({ problem: 'Level 1 is already a level on this job.' });
    expect(levelName(' ', [])).toEqual({ problem: 'Type a name, like Level 2.' });
    expect(levelName('outside and whole house', [])).toEqual({ problem: `${SHARED_GROUP} is for the areas outside, not a level.` });
  });

  it('reads a location typed at the end of a level, and brings back one removed before', () => {
    const rooms = [
      { id: 'a', label: 'Kitchen 109', active: true },
      { id: 'b', label: 'Study 303', active: false },
    ];
    expect(newLocation('110 pantry', rooms)).toEqual({ name: 'Pantry', number: '110', label: 'Pantry 110', restore: null });
    expect(newLocation('kitchen 109', rooms)).toEqual({ problem: 'Kitchen 109 is already a location on this job.' });
    expect(newLocation('Study 303', rooms)).toEqual({ name: 'Study', number: '303', label: 'Study 303', restore: 'b' });
    expect(newLocation('  ', rooms)).toEqual({ problem: 'Type a name, like Kitchen 109.' });
  });
});

describe("reading Claude's answer about the plans", () => {
  it('reads the answer however it comes, tidies the names and numbers, and keeps the walk order', () => {
    const answer =
      'Here is what I found:\n```json\n' +
      JSON.stringify({
        name: 'SMITH RESIDENCE',
        address: '  123 Gulf Drive,   Holmes Beach, Florida 34217 ',
        floors: [
          { level: 'Level 1', rooms: [{ name: 'GARAGE', number: '101' }, 'Kitchen 109', { name: 'ODK', number: 'abc 9' }, { name: '12', number: '7' }] },
          { name: 'Level 2', locations: [{ name: 'master bedroom', number: '201' }] },
          { name: 'level 1', rooms: [{ name: 'Pantry', number: '110' }] },
          { name: 'Level 3', rooms: [] },
        ],
        outside: ['Driveway', 'dock', 'Pool', 'North Elevation', 'Outside and Whole House'],
        notes: 'null',
      }) +
      '\n```';
    const reading = readPlanAnswer(answer);
    expect(reading).toEqual({
      name: 'Smith Residence',
      address: '123 Gulf Drive, Holmes Beach, Florida 34217',
      levels: [
        {
          name: 'Level 1',
          rooms: [
            { name: 'Garage', number: '101' },
            { name: 'Kitchen', number: '109' },
            { name: 'ODK', number: null },
            { name: 'Pantry', number: '110' },
          ],
        },
        { name: 'Level 2', rooms: [{ name: 'Master Bedroom', number: '201' }] },
      ],
      outside: ['North Elevation', 'South Elevation', 'East Elevation', 'West Elevation', 'Roof', 'Pool', 'Driveway', 'Site', 'Whole House', 'Dock'],
      notes: null,
    });
  });

  it('leaves out Pool and Driveway only when the answer leaves them out of outside', () => {
    expect(outsideAreas(null)).toEqual([...SHARED_AREAS]);
    expect(outsideAreas([])).toEqual(['North Elevation', 'South Elevation', 'East Elevation', 'West Elevation', 'Roof', 'Site', 'Whole House']);
    expect(outsideAreas(['Spa', 'SEAWALL', 'spa'])).toEqual(['North Elevation', 'South Elevation', 'East Elevation', 'West Elevation', 'Roof', 'Site', 'Whole House', 'Spa', 'Seawall']);
  });

  it('says nothing came back when there is nothing to use', () => {
    expect(readPlanAnswer('I could not open the file.')).toBeNull();
    expect(readPlanAnswer({ levels: [{ name: 'Level 1', rooms: [] }] })).toBeNull();
    expect(readPlanAnswer({ address: '9 Bay Lane' })).toMatchObject({ address: '9 Bay Lane', levels: [] });
    expect(jsonIn('{"a": 1} and then {"b": 2}')).toBeNull();
    expect(jsonIn('Sure: {"a": 1}')).toEqual({ a: 1 });
  });
});

describe('what reading the plans adds to a job', () => {
  const reading = {
    name: 'Smith Residence',
    address: '123 Gulf Drive',
    levels: [
      {
        name: 'Level 1',
        rooms: [
          { name: 'Garage', number: '101' },
          { name: 'Kitchen', number: '109' },
          { name: 'Closet', number: null },
        ],
      },
      {
        name: 'Level 2',
        rooms: [
          { name: 'Closet', number: null },
          { name: 'Closet', number: null },
          { name: 'Pool', number: null },
        ],
      },
    ],
    outside: ['North Elevation', 'Pool', 'Dock'],
    notes: null,
  };

  it('tells repeated names apart by their level, and matches what the job has', () => {
    n = 0;
    const onJob = [
      loc('Kitchen', null),
      loc('Garage 101', 'Level 1'),
      loc('North Elevation', null, { kind: 'shared' }),
      loc('Dock', null, { active: false }),
    ];
    const rows = planLocations(reading, onJob);
    expect(rows.map((r) => [r.label, r.floor, r.kind, planChange(r)])).toEqual([
      ['Garage 101', 'Level 1', 'room', 'same'],
      ['Kitchen 109', 'Level 1', 'room', 'update'],
      ['Closet', 'Level 1', 'room', 'new'],
      ['Level 2 Closet', 'Level 2', 'room', 'new'],
      ['Level 2 Closet 2', 'Level 2', 'room', 'new'],
      ['Pool', 'Level 2', 'room', 'new'],
      ['North Elevation', null, 'shared', 'same'],
      ['Dock', null, 'shared', 'new'],
    ]);
    expect(rows[1]!.existing).toMatchObject({ label: 'Kitchen', floor: null });
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('matches the same name and number first, and leaves a removed name to come back as itself', () => {
    n = 0;
    const onJob = [loc('Kitchen', null, { id: 'k' }), loc('Kitchen 109', 'Level 1', { id: 'old', active: false })];
    const rows = planLocations(
      { ...reading, outside: [], levels: [{ name: 'Level 1', rooms: [{ name: 'Kitchen', number: '109' }, { name: 'Kitchen', number: null }] }] },
      onJob,
    );
    expect(rows.map((r) => [r.label, r.existing?.id ?? null, planChange(r)])).toEqual([
      ['Kitchen 109', null, 'new'],
      ['Kitchen', 'k', 'update'],
    ]);
  });

  it("offers the title block's name and address only where they differ from the job's", () => {
    expect(planJobFields(reading, { name: 'Smith', address: '' })).toEqual({ name: 'Smith Residence', address: '123 Gulf Drive' });
    expect(planJobFields(reading, { name: 'SMITH RESIDENCE', address: '123 Gulf Drive.' })).toEqual({ name: null, address: null });
  });

  it("puts the plans' new locations among the job's by the plans' order, levels and all", () => {
    n = 0;
    const before = [
      loc('Garage 101', 'Level 1', { id: 'g' }),
      loc('Kitchen 109', 'Level 1', { id: 'k' }),
      loc('Punch Notes', 'Level 2', { id: 'x' }),
      loc('Office', null, { id: 'o' }),
      loc('Roof', null, { kind: 'shared', id: 'r' }),
    ];
    const after = [
      ...before.map((l) => (l.id === 'o' ? { ...l, label: 'Office 301', floor: 'Level 3' } : l)),
      loc('Ground Storage', 'Ground Level', { id: 'gs' }),
      loc('Foyer 102', 'Level 1', { id: 'f' }),
      loc('Bed 201', 'Level 2', { id: 'b' }),
      loc('Bunk 302', 'Level 3', { id: 'bk' }),
      loc('Dock', null, { kind: 'shared', id: 'd' }),
    ];
    const read = ['gs', 'g', 'f', 'k', 'b', 'o', 'bk', 'd', 'r'];
    expect(readingOrder(before, after, read).map((l) => l.id)).toEqual(['gs', 'g', 'f', 'k', 'b', 'x', 'o', 'bk', 'd', 'r']);
    // A level the plans do not have keeps its place; the job's own order on a level stays.
    const kept = readingOrder(before, before, ['k', 'g']);
    expect(kept.map((l) => l.id)).toEqual(['g', 'k', 'x', 'o', 'r']);
  });
});

describe('asking Claude about the plans', () => {
  it('names the levels already on the job and carries the text when there is no file', () => {
    const prompt = planPrompt({ levels: ['Level 1', 'Level 2'], text: 'Page 1 of 1\n450,300 KITCHEN' });
    expect(prompt).toContain('The job already has these levels: Level 1, Level 2.');
    expect(prompt).toContain('The plans are below as the text on each page.');
    expect(prompt.endsWith('The plans:\nPage 1 of 1\n450,300 KITCHEN')).toBe(true);
    expect(planPrompt()).toContain('The plans are attached.');
    expect(planPrompt()).not.toContain('already has these levels');
  });

  it("turns a PDF's text into lines with where they sit, floor plans first when there is not room for all", () => {
    const page = (title: string, words: string[]): PageText => ({
      width: 2592,
      height: 1728,
      items: [
        { text: title, x: 100, y: 1600, width: 400, size: 24 },
        ...words.flatMap((w, i) => [
          { text: w, x: 500 + i * 300, y: 400, width: 120, size: 12 },
          { text: `${101 + i}`, x: 500 + i * 300, y: 418, width: 30, size: 12 },
          { text: `12'-6"`, x: 500 + i * 300, y: 436, width: 40, size: 9 },
        ]),
      ],
    });
    const pages = [
      page('ELECTRICAL PLAN', ['KITCHEN', 'BATH']),
      page('FIRST FLOOR PLAN', ['KITCHEN', 'MASTER', 'BATH']),
      { width: 612, height: 792, items: [
        { text: 'GENERAL', x: 72, y: 72, width: 60, size: 10 },
        { text: 'NOTES', x: 135, y: 72, width: 40, size: 10 },
      ] },
    ];
    const all = plansAsText(pages);
    expect(all).toContain('Page 2 of 3 (36 by 24 inches)\n193,231 KITCHEN\n309,231 MASTER\n424,231 BATH\n193,242 101');
    expect(all).toContain('Page 3 of 3 (9 by 11 inches)\n118,91 GENERAL NOTES');
    expect(all).not.toContain(`12'-6"`);
    const tight = plansAsText(pages, 160);
    expect(tight).toContain('FIRST FLOOR PLAN');
    expect(tight).not.toContain('ELECTRICAL PLAN');
  });
});

describe('pictures of the plan sheets', () => {
  it('cuts a big picture into overlapping pieces Claude reads at full size, and leaves a small one whole', () => {
    const pieces = planPieces(4032, 3024);
    expect(pieces).toHaveLength(12);
    expect(pieces.every((p) => p.width === 1092 && p.height === 1092 && p.x + p.width <= 4032 && p.y + p.height <= 3024)).toBe(true);
    expect(pieces.slice(0, 4).map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [980, 0],
      [1960, 0],
      [2940, 0],
    ]);
    expect(pieces[11]).toEqual({ x: 2940, y: 1932, width: 1092, height: 1092 });
    expect(planPieces(900, 700)).toEqual([{ x: 0, y: 0, width: 900, height: 700 }]);
    // A screenshot a little wider than a piece is cut only down its length.
    expect(planPieces(1179, 2556).map((p) => [p.x, p.y, p.width, p.height])).toEqual([
      [0, 0, 1179, 1092],
      [0, 732, 1179, 1092],
      [0, 1464, 1179, 1092],
    ]);
  });

  it('tells Claude what the pictures are', () => {
    expect(picturesNote([13, 1])).toBe(
      'The plans are attached as pictures of 2 sheets, in this order. Sheet 1: the whole sheet, then 13 pieces of it at full size, left to right and top to bottom, overlapping a little. Sheet 2: the whole sheet.',
    );
  });
});

describe('the read-plans function', () => {
  it('asks Claude in the same words as the core', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // @ts-expect-error: a plain script, without types
    const { promptFile } = (await import('../../../tools/build-functions.mjs')) as { promptFile: () => Promise<string> };
    const written = readFileSync(join(__dirname, '../../../supabase/functions/read-plans/prompt.js'), 'utf8');
    expect(written, 'supabase/functions/read-plans/prompt.js is out of date: run node tools/build-functions.mjs').toBe(await promptFile());
  });
});
