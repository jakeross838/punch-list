import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEWS_MOST, newsLine, searchAll, searchWords, wordRank, type Comment, type Item, type Job, type Location } from '../src/index';

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

import { CLAUDE_TASKS, foundToFilters, readDayNote, readFind, readPhotoWords, taskPrompt } from '../src/index';

describe("Claude's Round 4 tasks", () => {
  const job = { locations: ['Kitchen 109', 'Bathroom 116'], floors: ['Level 1', 'Level 2'], companies: ['Gator Plumbing', 'SMS Carpentry'], people: ['Sam Rivera'], waitingOn: ['Owner'] };

  it('asks to find with the job\'s own names, and reads only names the job has', () => {
    const words = taskPrompt('find', { ...job, words: 'what is ready for gator on level 2' });
    expect(words).toContain('They said: "what is ready for gator on level 2"');
    expect(words).toContain('Companies: Gator Plumbing; SMS Carpentry');
    expect(CLAUDE_TASKS.find.tier).toBe('quick');
    expect(CLAUDE_TASKS.find.enough({ ...job, words: ' ' })).toBe(false);
    const found = readFind('{"states": ["ready", "soon"], "kinds": [], "companies": ["gator plumbing", "Made Up Co"], "people": [], "levels": ["Level 2"], "locations": ["Garage"], "waitingOn": [], "photo": true, "scheduled": "yes", "estimated": null, "groupBy": "company", "showCompleted": false}', job);
    expect(found).toEqual({ states: ['ready'], kinds: [], companies: ['Gator Plumbing'], people: [], floors: ['Level 2'], locations: [], waitingOn: [], photo: true, scheduled: null, estimated: null, groupBy: 'company', showCompleted: false });
    expect(readFind('not json', job)).toBeNull();
    const filters = foundToFilters(found!, { companies: new Map([['Gator Plumbing', 'gator']]), people: new Map(), locations: new Map() });
    expect(filters).toMatchObject({ states: ['ready'], companyIds: ['gator'], floors: ['Level 2'], photo: true, scheduled: null });
  });

  it('asks for the day\'s note from what was finished, found and said, and reads it with no dashes', () => {
    const input = { job: 'Fish Residence', day: 'Monday, November 9', done: [{ title: 'Install towel bar', location: 'Bath 116', by: 'Gator Plumbing' }], added: [], onSite: [{ name: 'Gator Plumbing', trade: 'Plumbing' }], said: [{ who: 'Mike', words: 'Need the tile by Thursday' }] };
    const words = taskPrompt('day-note', input);
    expect(words).toContain('Monday, November 9');
    expect(words).toContain('- Install towel bar (Bath 116), by Gator Plumbing');
    expect(words).toContain('Nothing was added to the list today.');
    expect(words).toContain('- Mike: Need the tile by Thursday');
    expect(CLAUDE_TASKS['day-note'].enough({ job: 'Fish Residence', done: [], added: [], onSite: [], said: [] })).toBe(false);
    expect(readDayNote('{"note": "Work Completed\\nThe bath is set — towel bars and all.\\n\\n\\n\\nIssues Found\\nNone."}')).toBe('Work Completed\nThe bath is set, towel bars and all.\n\nIssues Found\nNone.');
  });

  it('asks for a photo\'s words with the photo, and reads a few words', () => {
    expect(CLAUDE_TASKS['describe-photo'].minImages).toBe(1);
    expect(taskPrompt('describe-photo', { title: 'Patch drywall', location: 'Living 107' })).toContain('"Patch drywall", in Living 107');
    expect(readPhotoWords('{"words": "Water stain on the ceiling by the vent."}')).toBe('Water stain on the ceiling by the vent');
    expect(readPhotoWords('{}')).toBeNull();
  });
});

describe('what a phone is told', () => {
  it('says what a company did on its page in the words Activity uses', () => {
    expect(newsLine({ kind: 'done', company: 'Gator Plumbing', name: 'Mike', item: 'Install vanity faucets' })).toBe('Mike at Gator Plumbing marked Install vanity faucets done.');
    expect(newsLine({ kind: 'confirmed', company: 'Gator Plumbing', name: null, item: 'Install vanity faucets' })).toBe('Gator Plumbing confirmed Install vanity faucets.');
    expect(newsLine({ kind: 'comment', company: 'Gator Plumbing', name: '  Mike  ', item: 'Install vanity faucets', body: 'Coming Tuesday\n morning' })).toBe(
      'Mike at Gator Plumbing commented on Install vanity faucets: Coming Tuesday morning.',
    );
    expect(newsLine({ kind: 'comment', company: 'Gator Plumbing', name: null, item: null, body: 'All done here?' })).toBe('Gator Plumbing commented on the Gator Plumbing list: All done here?');
    expect(newsLine({ kind: 'done', company: '', name: null, item: '  ' })).toBe('The company marked an item done.');
  });

  it('says what the owner did on their page', () => {
    expect(newsLine({ kind: 'owner_added', name: 'Karen', words: 'Scratch on the pantry door' })).toBe('Karen, the owner, added something to look at: Scratch on the pantry door.');
    expect(newsLine({ kind: 'owner_added', name: null, words: '' })).toBe('The owner added a photo of something to look at.');
    expect(newsLine({ kind: 'owner_signed_off', name: 'Karen Lee', location: 'Kitchen 109' })).toBe('Karen Lee, the owner, signed off Kitchen 109.');
    expect(newsLine({ kind: 'owner_signed_off', name: null, location: null })).toBe('The owner signed off the job.');
  });

  it('keeps a long comment to what a lock screen shows', () => {
    const line = newsLine({ kind: 'comment', company: 'Gator Plumbing', name: 'Mike', item: 'Install vanity faucets', body: 'word '.repeat(80) });
    expect(line.length).toBe(NEWS_MOST);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe("the app's hooks", () => {
  // React's compiler takes a call named use() for something it can keep from the last time, and
  // skips it on the next render: a hook behind that name changes the screen's hooks and crashes it
  // (the job's screen did, with the stars). Every hook is named use and a capital, like useValue.
  it('never hides a hook behind a method named use', () => {
    const src = join(__dirname, '../../../apps/mobile/src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(src);
    const found = files.flatMap((f) => (/\.use\(\)|\buse: \(\) =>/.test(readFileSync(f, 'utf8')) ? [f.slice(src.length + 1)] : []));
    expect(files.length).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });
});
