import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  changeText,
  commonPlaces,
  commonTasks,
  companyList,
  companyListEmail,
  companyListText,
  companyPrintout,
  contactProblem,
  greeting,
  lastScheduleSend,
  listRecipients,
  scheduleChanges,
  scheduleEmail,
  schedulePrintout,
  scheduleRecipients,
  scheduleSnapshot,
  templatePlan,
  tidyContact,
  workingDaysBetween,
  type Company,
  type Contact,
  type Item,
  type ListSend,
  type Location,
  type Template,
  type TemplateItem,
  type Visit,
} from '../src/index';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, assignedTo: null, title: `Item ${n}`, description: '', tradeId: 't',
    companyId: 'sms', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: 2,
    btExternalId: null, createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}
function visit(over: Partial<Visit>): Visit {
  return {
    id: 'v1', jobId: 'j', companyId: 'sms', start: '2026-11-03', days: 1, confirmed: false, note: '', removed: false, askedStart: null, askedDays: null, askedName: null, askedAt: null,
    createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}
const location = (id: string, label: string, sortOrder: number, kind: Location['kind'] = 'room'): Location => ({
  id, jobId: 'j', name: label, number: null, label, floor: kind === 'room' ? 'Level 1' : null, kind, sortOrder, active: true, walkedAt: null,
});
const company = (id: string, name: string): Company => ({ id, name, defaultTradeId: null, phone: null, email: null, active: true });
const contact = (over: Partial<Contact>): Contact => ({ id: `c${++n}`, companyId: 'sms', name: '', email: null, phone: null, getsLists: true, sortOrder: n, active: true, ...over });

const locations = [location('k', 'Kitchen 109', 1), location('b', 'Bathroom 116', 2), location('house', 'Whole House', 9, 'shared')];
const companies = [company('sms', 'SMS Carpentry'), company('hhh', 'Triple H Painting'), company('gator', 'Gator Plumbing')];
const friday = '2026-10-30';

describe('since the schedule went out', () => {
  it('counts working days, leaving out weekends and holidays', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-02')).toBe(0);
    // Friday to Monday is one working day.
    expect(workingDaysBetween('2026-10-30', '2026-11-02')).toBe(1);
    expect(workingDaysBetween('2026-11-02', '2026-10-30')).toBe(-1);
    // Wednesday before Thanksgiving to the Monday after: the holidays and the weekend do not count.
    expect(workingDaysBetween('2026-11-25', '2026-11-30')).toBe(1);
  });

  it('says who moved later or earlier, who is new, who confirmed, who is done and who has no date now', () => {
    const was = scheduleSnapshot(
      buildTimeline(
        [
          item({ id: 'a', companyId: 'sms', visitId: 'v-sms' }),
          item({ id: 'b', companyId: 'hhh', visitId: 'v-hhh' }),
          item({ id: 'c', companyId: 'gator', visitId: 'v-gator' }),
          item({ id: 'd', companyId: 'stone', visitId: 'v-stone' }),
          item({ id: 'e', companyId: 'glass', visitId: 'v-glass' }),
        ],
        [
          visit({ id: 'v-sms', companyId: 'sms', start: '2026-11-03' }),
          visit({ id: 'v-hhh', companyId: 'hhh', start: '2026-11-04', days: 2 }),
          visit({ id: 'v-gator', companyId: 'gator', start: '2026-11-05' }),
          visit({ id: 'v-stone', companyId: 'stone', start: '2026-11-05' }),
          visit({ id: 'v-glass', companyId: 'glass', start: '2026-11-06' }),
        ],
        locations,
        friday,
      ),
    );
    expect(was.bars.map((b) => [b.companyId, b.start, b.end, b.confirmed])).toEqual([
      ['sms', '2026-11-03', '2026-11-03', false],
      ['hhh', '2026-11-04', '2026-11-05', false],
      ['gator', '2026-11-05', '2026-11-05', false],
      ['stone', '2026-11-05', '2026-11-05', false],
      ['glass', '2026-11-06', '2026-11-06', false],
    ]);
    expect(was.finish).toBe('2026-11-06');
    const now = scheduleSnapshot(
      buildTimeline(
        [
          item({ id: 'a', companyId: 'sms', visitId: 'v-sms' }),
          item({ id: 'b', companyId: 'hhh', visitId: 'v-hhh' }),
          item({ id: 'c', companyId: 'gator', visitId: 'v-gator' }),
          // The stone is done; the glass waits on the owner now, with no date.
          item({ id: 'd', companyId: 'stone', visitId: 'v-stone', status: 'complete' }),
          item({ id: 'e', companyId: 'glass', ready: false, waitingOn: ['Owner'] }),
          item({ id: 'f', companyId: 'tile', visitId: 'v-tile' }),
        ],
        [
          // Four working days later, past the weekend.
          visit({ id: 'v-sms', companyId: 'sms', start: '2026-11-09' }),
          // Same first day, a day longer.
          visit({ id: 'v-hhh', companyId: 'hhh', start: '2026-11-04', days: 3 }),
          visit({ id: 'v-gator', companyId: 'gator', start: '2026-11-05', confirmed: true }),
          visit({ id: 'v-stone', companyId: 'stone', start: '2026-11-05' }),
          visit({ id: 'v-tile', companyId: 'tile', start: '2026-11-10', days: 2 }),
        ],
        locations,
        friday,
      ),
    );
    const open = new Set(['sms', 'hhh', 'gator', 'glass', 'tile']);
    const moved = scheduleChanges(was, now, '2026-10-30T16:00:00Z', (id) => open.has(id));
    expect(moved.changes.map((c) => [c.companyId, c.kind, c.days])).toEqual([
      ['sms', 'later', 4],
      ['hhh', 'longer', 1],
      ['tile', 'new', 0],
      ['gator', 'confirmed', 0],
      ['glass', 'off', 0],
      ['stone', 'done', 0],
    ]);
    expect(moved.changes.map(changeText)).toEqual([
      'Starts 4 working days later',
      'Finishes 1 working day later',
      'New on the schedule',
      'Confirmed a visit',
      'No date now',
      'All done',
    ]);
    expect(moved.finish).toEqual({ was: '2026-11-06', now: '2026-11-11', days: 3 });
    // Nothing moved: nothing to say.
    expect(scheduleChanges(was, was, '2026-10-30T16:00:00Z').changes).toEqual([]);
    // One visit of two confirmed, the dates the same: that counts, though the other is a best guess still.
    const two = { finish: '2026-11-10', bars: [
      { key: 'a', companyId: 'hhh', start: '2026-11-04', end: '2026-11-05', confirmed: false },
      { key: 'b', companyId: 'hhh', start: '2026-11-09', end: '2026-11-10', confirmed: false },
    ] };
    const one = { ...two, bars: [{ ...two.bars[0]!, confirmed: true }, two.bars[1]!] };
    expect(scheduleChanges(two, one, '2026-10-30T16:00:00Z').changes.map((c) => [c.kind, c.visits, changeText(c)])).toEqual([['confirmed', 1, 'Confirmed a visit']]);
  });

  it('tracks against the last time the schedule went out, with what it was', () => {
    const send = (id: string, list: string, sentAt: string, kept: boolean, removed = false): ListSend => ({
      id, jobId: 'j', list, itemIds: [], sentAt, sentBy: 'p1', removed, snapshot: kept ? { finish: null, bars: [] } : null,
    });
    const sends = [
      send('old', 'schedule', '2026-10-23T16:00:00Z', true),
      send('ahead', 'lookahead', '2026-10-28T16:00:00Z', true),
      send('company', 'company:sms', '2026-10-29T16:00:00Z', false),
      send('undone', 'schedule', '2026-10-30T16:00:00Z', true, true),
    ];
    expect(lastScheduleSend(sends)?.id).toBe('ahead');
    expect(lastScheduleSend([])).toBeUndefined();
  });
});

describe('the people at each company', () => {
  it('keeps a contact tidy and says what keeps one from saving', () => {
    expect(tidyContact({ name: '  Mike   Smith ', email: ' Mike@SMS.com ', phone: ' 941  555 0123 ' })).toEqual({ name: 'Mike Smith', email: 'mike@sms.com', phone: '941 555 0123' });
    expect(tidyContact({ name: 'Dave', email: '  ', phone: '' })).toEqual({ name: 'Dave', email: null, phone: null });
    expect(contactProblem({ name: ' ', email: null, phone: null })).toBe('Give them a name, an email or a phone.');
    expect(contactProblem({ name: 'Mike', email: 'mike at sms', phone: null })).toBe('That email does not look right.');
    expect(contactProblem({ name: '', email: null, phone: '941 555 0123' })).toBeNull();
  });

  it('sends a company its list by email, and by text to anyone with only a phone', () => {
    const people = [
      contact({ name: 'Mike Smith', email: 'mike@sms.com', sortOrder: 1 }),
      contact({ name: 'Dave', phone: '941 555 0100', sortOrder: 2 }),
      contact({ name: 'Office', email: 'office@sms.com', getsLists: false }),
      contact({ name: 'Old', email: 'old@sms.com', active: false }),
      contact({ name: 'Sue', email: 'sue@hhh.com', companyId: 'hhh' }),
    ];
    const r = listRecipients(people, 'sms');
    expect(r.emails).toEqual(['mike@sms.com']);
    expect(r.phones).toEqual(['941 555 0100']);
    expect(r.people.map((c) => c.name)).toEqual(['Mike Smith', 'Dave']);
  });

  it('sends the Schedule Email to me, copies the team and blind copies every company', () => {
    const people = [
      { id: 'jake', email: 'jake@rossbuilt.com', active: true },
      { id: 'lee', email: 'lee@rossbuilt.com', active: true },
      { id: 'gone', email: 'gone@rossbuilt.com', active: false },
    ];
    const team = [
      { jobId: 'j', personId: 'jake' },
      { jobId: 'j', personId: 'lee' },
      { jobId: 'j', personId: 'gone' },
      { jobId: 'other', personId: 'lee' },
    ];
    const contacts = [contact({ name: 'Mike', email: 'mike@sms.com' }), contact({ name: 'Sue', email: 'sue@hhh.com', companyId: 'hhh' }), contact({ name: 'Al', phone: '941', companyId: 'gator' })];
    expect(scheduleRecipients({ me: people[0]!, jobId: 'j', team, people, companyIds: ['sms', 'hhh', 'gator'], contacts })).toEqual({
      to: ['jake@rossbuilt.com'],
      cc: ['lee@rossbuilt.com'],
      bcc: ['mike@sms.com', 'sue@hhh.com'],
      without: ['gator'],
    });
  });
});

describe('what goes out', () => {
  const job = { name: 'Fish', address: '715 North Shore Drive' };
  const noDashes = (text: string) => text.replace(/https?:\/\/\S+/g, '').match(/[-‐-―]/g);

  it('greets the people by first name', () => {
    expect(greeting([{ name: 'Mike Smith' }])).toBe('Hi Mike,');
    expect(greeting([{ name: 'Mike Smith' }, { name: 'Dave Jones' }])).toBe('Hi Mike and Dave,');
    expect(greeting([{ name: 'A' }, { name: 'B' }, { name: 'C' }])).toBe('Hi everyone,');
    expect(greeting([{ name: '' }])).toBe('Hi,');
  });

  it('writes a company its list, short, with the link to its page and no dashes', () => {
    const link = 'https://link.rossbuilt.com/c/abc123';
    const mail = companyListEmail({ job, contacts: [{ name: 'Mike Smith' }], link, from: { name: 'Jake Ross' }, ready: 3 });
    expect(mail.subject).toBe('715 North Shore Drive Completion List');
    expect(mail.body.startsWith('Hi Mike,\n\nHere is your current list for 715 North Shore Drive.')).toBe(true);
    expect(mail.body).toContain('Anything marked ready can be done any time');
    expect(mail.body).toContain(link);
    expect(mail.body.endsWith('Thanks,\nJake')).toBe(true);
    expect(noDashes(mail.body)).toBeNull();
    // Nothing ready, no link: none of that is said.
    const plain = companyListEmail({ job: { name: 'Fish', address: '' }, contacts: [], link: null, from: null, ready: 0 });
    expect(plain.subject).toBe('Fish Completion List');
    expect(plain.body).not.toContain('marked ready');
    expect(plain.body).not.toContain('your page');
    expect(plain.body.endsWith('Thanks,\nRoss Built')).toBe(true);
    const text = companyListText({ job, contacts: [{ name: 'Dave' }], link, from: { name: 'Jake Ross' } });
    expect(text).toBe(`Hi Dave, here is your current list for 715 North Shore Drive. Your dates and photos are on your page: ${link} Thanks, Jake`);
  });

  it('writes the Schedule Email to every company', () => {
    const mail = scheduleEmail({ job, from: { name: 'Jake Ross' } });
    expect(mail.subject).toBe('715 North Shore Drive Construction Schedule');
    expect(mail.body).toContain('Attached are the Three Week Look Ahead and the Whole Schedule for 715 North Shore Drive.');
    expect(mail.body).toContain('Green is confirmed and blue is our best guess');
    expect(noDashes(mail.body)).toBeNull();
  });
});

describe('the printed pages', () => {
  const lookups = { locations, companies };

  it("puts the company's page on its list: the scan code and the link", () => {
    const list = companyList('sms', [item({ title: 'Install shoe molding' })], lookups);
    const code = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M0 0h7v7H0z"/></svg>';
    const page = companyPrintout(list, { job: { name: 'Fish', address: '' }, date: new Date(2026, 9, 30), link: { url: 'https://link.rossbuilt.com/c/a<b', code } });
    expect(page.body).toContain('<div class="rb-qr"><svg');
    expect(page.body).toContain('<b>Your Page</b>');
    expect(page.body).toContain('https://link.rossbuilt.com/c/a&lt;b');
    // Anything but a plain drawing is left off; the link still prints.
    const odd = companyPrintout(list, { job: { name: 'Fish', address: '' }, date: new Date(2026, 9, 30), link: { url: 'https://x.test/c/1', code: '<img src=x onerror=alert(1)>' } });
    expect(odd.body).not.toContain('rb-qr');
    expect(odd.body).toContain('https://x.test/c/1');
    // Without a link: no block.
    expect(companyPrintout(list, { job: { name: 'Fish', address: '' }, date: new Date(2026, 9, 30) }).body).not.toContain('Your Page');
  });

  it('prints the Whole Schedule: week by week to the finish, every visit, what moved and what is not on it yet', () => {
    const work = [
      item({ id: 'p1', companyId: 'hhh', visitId: 'v-paint', title: 'Touch up paint' }),
      item({ id: 'p2', companyId: 'hhh', visitId: 'v-paint', title: 'Paint closet' }),
      item({ id: 'p3', companyId: 'hhh', visitId: 'v-paint', title: 'Touch up paint', locationId: 'b' }),
      item({ id: 's1', companyId: 'sms', title: 'Install shoe molding' }),
      item({ id: 'g1', companyId: 'gator', ready: false, waitingOn: ['Owner'] }),
      item({ id: 'q1', companyId: 'sms', kind: 'added_scope', boughtOut: false, poOrCo: null }),
    ];
    const visits = [visit({ id: 'v-paint', companyId: 'hhh', start: '2026-11-16', days: 2, confirmed: true })];
    const t = buildTimeline(work, visits, locations, friday);
    const was = { finish: '2026-11-12', bars: [{ key: 'v-paint', companyId: 'hhh', start: '2026-11-10', end: '2026-11-11', confirmed: false }] };
    const changes = scheduleChanges(was, scheduleSnapshot(t), '2026-10-23T16:00:00Z');
    const page = schedulePrintout(t, { ...lookups, items: work, visits, today: friday }, { job: { name: 'Fish', address: '715 North Shore Drive' }, date: new Date(2026, 9, 30) }, friday, { changes });
    expect(page.title).toBe('Whole Schedule');
    expect(page.fileName).toBe('Fish Whole Schedule, October 30 2026.pdf');
    expect(page.body).toContain('Everything with a date is done by Tuesday, November 17.');
    expect(page.body).toContain('2 visits for 2 companies.');
    // Weeks from this Monday, at least two months of them, the months over the Mondays.
    expect(page.body).toContain('<th colspan="1" class="rb-g-week">October</th><th colspan="5" class="rb-g-week">November</th><th colspan="2" class="rb-g-week">December</th>');
    expect(page.body).toContain('<th class="rb-g-day rb-g-wk rb-g-now">26</th>');
    // Triple H confirmed the week of November 16; SMS Carpentry our best guess next week.
    expect(page.body).toMatch(/<td class="rb-g-name">Triple H Painting<\/td>(<td class="rb-g-cell rb-g-wk( rb-g-now)?"><\/td>){3}<td class="rb-g-cell rb-g-wk"><div class="rb-g-bar rb-g-ok rb-g-sets"><\/div><\/td>/);
    expect(page.body).toContain('<td class="rb-g-name">SMS Carpentry</td><td class="rb-g-cell rb-g-wk rb-g-now"></td><td class="rb-g-cell rb-g-wk"><div class="rb-g-bar"></div></td>');
    expect(page.body).toContain('<tr class="rb-band"><td colspan="3">Triple H Painting</td></tr>');
    // A title in two places says so once.
    expect(page.body).toContain('3 items: Touch up paint (2) and Paint closet');
    expect(page.body).toContain('What Moved Since Friday, October 23');
    expect(page.body).toContain('The finish date moved 3 working days later, from Thursday, November 12 to Tuesday, November 17.');
    expect(page.body).toContain('Starts 4 working days later');
    expect(page.body).toContain('New on the schedule');
    expect(page.body).toContain('Not on the Schedule Yet');
    expect(page.body).toContain('1 waiting on Owner');
    expect(page.body).toContain('1 to be quoted');
  });
});

describe('Common Tasks come from the templates', () => {
  const templates: Template[] = [
    { id: 'house', name: 'End of the House', active: true, sortOrder: 1 },
    { id: 'rooms', name: 'Common Tasks by Room', active: true, sortOrder: 2 },
    { id: 'off', name: 'Old', active: false, sortOrder: 3 },
  ];
  const task = (id: string, templateId: string, title: string, place: TemplateItem['place'], over: Partial<TemplateItem> = {}): TemplateItem => ({
    id, templateId, title, description: '', kind: 'completion', tradeId: 't', hours: 1, place, waitsOn: [], sortOrder: Number(id.slice(1)), active: true, ...over,
  });
  const tasks = [
    task('t1', 'house', 'Caulk shower corner', 'bathroom'),
    task('t2', 'house', 'Install shower glass', 'bathroom', { waitsOn: ['t1'] }),
    task('t3', 'house', 'Final clean', 'Whole House'),
    task('t4', 'rooms', 'Install mirror', 'bathroom'),
    task('t5', 'rooms', 'Caulk Shower Corner', 'bathroom'),
    task('t6', 'off', 'Old bath task', 'bathroom'),
    task('t7', 'rooms', 'Gone', 'bathroom', { active: false }),
  ];

  it('offers each place its tasks, template by template, each title once', () => {
    expect(commonTasks('bathroom', templates, tasks).map((g) => [g.template.id, g.tasks.map((t) => t.id)])).toEqual([
      ['house', ['t1', 't2']],
      ['rooms', ['t4']],
    ]);
    expect(commonPlaces(location('b', 'Pool Bath', 1))[0]).toBe('bathroom');
    expect(commonPlaces(location('r', 'Roof', 1, 'shared')).slice(0, 2)).toEqual(['Roof', 'bathroom']);
    expect(commonPlaces(null).at(-1)).toBe('Whole House');
  });

  it('puts the tasks picked in this one location, keeping the waits between them', () => {
    const den = location('den', 'Den 112', 3);
    const jobCompanies = [{ jobId: 'j', companyId: 'sms', tradeId: 't' }];
    let k = 0;
    const plan = templatePlan(tasks, { jobId: 'j', locations: [...locations, den], items: [], jobCompanies }, () => `new${++k}`, { intoLocationId: 'den', taskIds: ['t1', 't2'] });
    expect(plan.items.map((i) => [i.title, i.locationId, i.waitingOnItems, i.companyId, i.unfinished])).toEqual([
      ['Caulk shower corner', 'den', [], 'sms', false],
      ['Install shower glass', 'den', ['new1'], 'sms', false],
    ]);
    // What is there already is left out, and a wait on it holds.
    const there = item({ id: 'there', locationId: 'den', title: 'Caulk shower corner', companyId: 'sms' });
    const again = templatePlan(tasks, { jobId: 'j', locations: [...locations, den], items: [there], jobCompanies }, () => 'x', { intoLocationId: 'den', taskIds: ['t2'] });
    expect(again.items.map((i) => [i.title, i.waitingOnItems])).toEqual([['Install shower glass', ['there']]]);
    expect(again.skipped).toBe(0);
    expect(again.missing).toEqual([]);
  });
});
