import { describe, expect, it } from 'vitest';
import {
  canChange,
  canSetUpJobs,
  CLAUDE_TASKS,
  exportEntries,
  fileSafe,
  getStarted,
  HELP,
  HELP_TOPICS,
  isAdmin,
  readHow,
  ROLE_HINTS,
  ROLE_LABELS,
  ROLES,
  SAMPLE_JOB,
  searchHelp,
  seesJob,
  taskPrompt,
  type Comment,
  type Item,
  type Job,
  type Person,
  type Photo,
  type Role,
} from '../src/index';

const job = (id: string, over: Partial<Job> = {}): Job => ({ id, name: id, address: `${id} Road`, closed: false, ...over });

describe('Get Started', () => {
  const base = { meId: 'me', jobs: [] as Job[], photos: [], companies: [], sends: [], people: [{ id: 'me', active: true }] };

  it('starts with nothing done for a new company', () => {
    const rows = getStarted(base);
    expect(rows.map((r) => r.step)).toEqual(['job', 'walk', 'companies', 'send', 'people']);
    expect(rows.every((r) => !r.done)).toBe(true);
  });

  it('does not count the Sample Job, a closed job or anything removed', () => {
    const sample = job('sample', { address: SAMPLE_JOB.address });
    const rows = getStarted({
      ...base,
      jobs: [sample, job('old', { closed: true })],
      photos: [{ jobId: 'sample', removed: false }],
      sends: [{ jobId: 'sample', removed: false }],
      companies: [{ active: false }],
      people: [{ id: 'me', active: true }, { id: 'gone', active: false }],
    });
    expect(rows.every((r) => !r.done)).toBe(true);
  });

  it('ticks each step off from what the company did', () => {
    const rows = getStarted({
      ...base,
      jobs: [job('fish')],
      photos: [{ jobId: 'fish', removed: true }, { jobId: 'fish', removed: false }],
      companies: [{ active: true }],
      sends: [{ jobId: 'fish', removed: true }],
      people: [{ id: 'me', active: true }, { id: 'sam', active: true }],
    });
    expect(Object.fromEntries(rows.map((r) => [r.step, r.done]))).toEqual({ job: true, walk: true, companies: true, send: false, people: true });
  });
});

describe('Help, and Ask Claude how', () => {
  it('has one entry per id, each under a known topic, in plain words', () => {
    expect(new Set(HELP.map((h) => h.id)).size).toBe(HELP.length);
    for (const h of HELP) {
      expect(HELP_TOPICS).toContain(h.topic);
      expect(h.question.endsWith('?')).toBe(true);
      // No dashes, and no abbreviations for days or months.
      expect(`${h.question} ${h.answer}`).not.toMatch(/ [-–—] |\b(Mon|Tue|Wed|Thu|Fri|Jan|Feb|Aug|Sept|Oct|Nov|Dec)\b/);
    }
  });

  it('finds entries by every word typed, the question first', () => {
    const found = searchHelp('send list');
    expect(found[0]?.id).toBe('send-lists');
    expect(searchHelp('zzqx')).toEqual([]);
    expect(searchHelp('  ')).toHaveLength(HELP.length);
  });

  it('asks Claude from the help alone, on the quick model', () => {
    expect(CLAUDE_TASKS.how.tier).toBe('quick');
    expect(CLAUDE_TASKS.how.enough({ question: '  ' })).toBe(false);
    const words = taskPrompt('how', { question: 'How do I   send a list?' });
    expect(words).toContain('They asked: "How do I send a list?"');
    for (const h of HELP) expect(words).toContain(`[${h.id}] ${h.question}`);
  });

  it("reads Claude's answer, keeping only the help's own entries", () => {
    expect(readHow('{"answer": "Tap Send at the bottom of the job - then pick the company.", "topics": ["send-lists", "made-up", "send-lists", "nudge"]}')).toEqual({
      answer: 'Tap Send at the bottom of the job, then pick the company.',
      topics: ['send-lists', 'nudge'],
    });
    expect(readHow('{"topics": []}')).toBeNull();
    expect(readHow('not json')).toBeNull();
  });
});

describe('Export Everything', () => {
  const item = (over: Partial<Item>): Item => ({
    id: 'i', jobId: 'fish', locationId: 'kitchen', number: 1, assignedTo: null, title: 'Adjust cabinet door', description: '', tradeId: null, companyId: 'sms',
    kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null, status: 'open', completedBy: null,
    completedAt: null, extra: {}, unfinished: false, visitId: null, hours: null, source: 'typed', btExternalId: null, createdBy: 'jake',
    createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', ...over,
  });
  const photo = (over: Partial<Photo>): Photo => ({ id: 'p', jobId: 'fish', itemId: 'i1', uri: 'file:///p.jpg', storagePath: null, width: 10, height: 10, marks: [], sortOrder: 1, removed: false, done: false, createdBy: 'jake', createdAt: '2026-11-01T12:00:00.000Z', ...over });
  const comment = (over: Partial<Comment>): Comment => ({ id: 'c', jobId: 'fish', itemId: 'i1', companyId: 'sms', body: 'Will do', personId: null, fromCompany: true, authorName: 'Mike', internal: false, removed: false, createdAt: '2026-11-02T15:30:00.000Z', ...over });
  const made = exportEntries({
    company: 'Ross Built',
    day: '2026-11-09',
    jobs: [job('fish', { name: 'Fish: Main/House' }), job('fish2', { name: 'Fish: Main/House' }), job('old', { name: 'Old', closed: true })],
    items: [
      item({ id: 'i1', number: 12, title: 'Adjust cabinet door' }),
      item({ id: 'i2', number: 13, title: 'Touch up paint', status: 'removed' }),
      item({ id: 'i3', number: 14, title: '=SUM(A1)', status: 'complete', completedAt: '2026-11-03T12:00:00.000Z', completedBy: 'jake' }),
    ],
    locations: [{ id: 'kitchen', jobId: 'fish', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null }],
    companies: [{ id: 'sms', name: 'SMS Carpentry', defaultTradeId: null, phone: null, email: 'office@sms.example', active: true }],
    people: [{ id: 'jake', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true, role: 'admin', sees: 'all', phone: null }],
    comments: [comment({}), comment({ id: 'c2', removed: true, body: 'gone' }), comment({ id: 'c3', jobId: 'fish', itemId: null, fromCompany: false, personId: 'jake', authorName: null, internal: true, body: 'Check the hinges' })],
    photos: [photo({ id: 'a', sortOrder: 1 }), photo({ id: 'b', sortOrder: 2, done: true }), photo({ id: 'c', removed: true }), photo({ id: 'd', itemId: 'i3', uri: '' })],
  });
  const paths = made.entries.map((e) => e.path);

  it('puts the company, the jobs and the people at the top, then a folder for each job', () => {
    expect(made.folder).toBe('Ross Built Export 2026-11-09');
    expect(paths.slice(0, 3)).toEqual(['Ross Built Export 2026-11-09/Jobs.csv', 'Ross Built Export 2026-11-09/Companies.csv', 'Ross Built Export 2026-11-09/People.csv']);
    // Two jobs with the same name each get their own folder, named so any computer takes it.
    expect(paths).toContain('Ross Built Export 2026-11-09/Fish Main House/Items.csv');
    expect(paths).toContain('Ross Built Export 2026-11-09/Fish Main House 2/Items.csv');
    expect(fileSafe('  ..  ', 'Job')).toBe('Job');
  });

  it("has every item, removed ones too, and every comment that is not taken back", () => {
    const items = made.entries.find((e) => e.path.endsWith('Fish Main House/Items.csv'))?.text ?? '';
    expect(items.startsWith('\uFEFFNumber,Title,')).toBe(true);
    expect(items).toContain('12,Adjust cabinet door');
    expect(items).toMatch(/13,Touch up paint,.*,Removed,/);
    // A title that looks like a formula stays text.
    expect(items).toContain("'=SUM(A1)");
    const said = made.entries.find((e) => e.path.endsWith('Fish Main House/Comments.csv'))?.text ?? '';
    expect(said).toContain('12,Adjust cabinet door,SMS Carpentry,Mike,2026-11-02 15:30,Will do,No');
    expect(said).toContain(',The whole list,SMS Carpentry,Jake Ross,');
    expect(said).not.toContain('gone');
  });

  it("names each photo for its item, the done photo after, leaving out removed photos and ones not on the phone", () => {
    const photos = made.entries.filter((e) => e.photo).map((e) => e.path.split('/').slice(-2).join('/'));
    expect(photos).toEqual(['Photos/12 Adjust cabinet door 1.jpg', 'Photos/12 Adjust cabinet door 2 Done.jpg']);
  });
});

describe('Roles', () => {
  const person = (role: Role, over: Partial<Person> = {}): Person => ({ id: role, name: role, email: `${role}@example.com`, phone: null, role, sees: 'assigned', active: true, ...over });

  it('offers four roles, each named and explained', () => {
    expect(ROLES).toEqual(['admin', 'project_manager', 'team', 'view_only']);
    expect(ROLES.map((r) => ROLE_LABELS[r])).toEqual(['Admin', 'Project Manager', 'Superintendent', 'View Only']);
    expect(ROLES.every((r) => ROLE_HINTS[r].endsWith('.'))).toBe(true);
  });

  it('says who runs the company, who sets up jobs and who changes anything', () => {
    const rows = ROLES.map((r) => [r, isAdmin(person(r)), canSetUpJobs(person(r)), canChange(person(r))]);
    expect(rows).toEqual([
      ['admin', true, true, true],
      ['project_manager', false, true, true],
      ['team', false, false, true],
      ['view_only', false, false, false],
    ]);
    // Switched off: nothing.
    expect([isAdmin, canSetUpJobs, canChange].some((f) => f(person('admin', { active: false })))).toBe(false);
    expect(canChange(null)).toBe(false);
  });

  it('lets admins and project managers see every job, and the others only their own unless Sees says every job', () => {
    const team = [{ jobId: 'mine', personId: 'team' }, { jobId: 'mine', personId: 'view_only' }];
    expect(seesJob(person('project_manager'), 'other', team)).toBe(true);
    expect(seesJob(person('team'), 'other', team)).toBe(false);
    expect(seesJob(person('team'), 'mine', team)).toBe(true);
    expect(seesJob(person('view_only'), 'mine', team)).toBe(true);
    expect(seesJob(person('view_only', { sees: 'all' }), 'other', team)).toBe(true);
  });
});
