import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  checkItem,
  clearHoldup,
  companyList,
  companyPlan,
  companyPrintout,
  complete,
  daysBetween,
  describeMarks,
  duplicatesOf,
  earliestStart,
  freedBy,
  lastSend,
  missingText,
  mondayOf,
  newSince,
  notBooked,
  partiesWaitedOn,
  partyList,
  partyPrintout,
  pastDue,
  pastDueText,
  readSuggestion,
  RuleError,
  startAfter,
  suggestContext,
  suggestionPatch,
  suggestPrompt,
  tidyItem,
  visitEnd,
  weekSection,
  workingDayOnOrAfter,
  type Item,
  type ListSend,
  type Location,
  type SuggestContext,
  type Visit,
} from '../src/index';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'deficiency', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: null,
    btExternalId: null, createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

function visit(over: Partial<Visit>): Visit {
  return {
    id: 'v1', jobId: 'j', companyId: 'c-sms', start: '2026-11-03', days: 2, confirmed: false, note: '', removed: false,
    createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

const rooms: Location[] = [
  { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true },
  { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true },
];
const lookups = {
  locations: rooms,
  trades: [{ id: 't-carp', name: 'Carpentry', sortOrder: 1 }, { id: 't-stone', name: 'Stone', sortOrder: 2 }],
  companies: [
    { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
    { id: 'c-vs', name: 'Volcano Stone', defaultTradeId: 't-stone', phone: null, email: null, active: true },
  ],
};
const TODAY = '2026-10-30'; // a Friday

describe('days on the schedule', () => {
  it('counts working days, Monday to Friday', () => {
    expect(addWorkingDays('2026-10-30', 1)).toBe('2026-11-02');
    expect(workingDayOnOrAfter('2026-10-31')).toBe('2026-11-02');
    expect(daysBetween('2026-10-26', TODAY)).toBe(4);
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(visitEnd({ start: '2026-10-30', days: 3 })).toBe('2026-11-03');
    expect(visitEnd({ start: '2026-10-31', days: 1 })).toBe('2026-11-02');
  });

  it('gives new starts more than a day of notice and a day of handoff after a holdup clears', () => {
    expect(earliestStart(TODAY)).toBe('2026-11-03');
    expect(startAfter('2026-11-02', TODAY)).toBe('2026-11-03');
    expect(startAfter('2026-11-05', TODAY)).toBe('2026-11-06');
    expect(startAfter('2026-10-20', TODAY)).toBe('2026-11-03');
  });

  it('puts each visit in this week, next week, later or past due', () => {
    expect(weekSection({ start: '2026-10-28', days: 1 }, TODAY)).toBe('past');
    expect(weekSection({ start: '2026-10-29', days: 2 }, TODAY)).toBe('this_week');
    expect(weekSection({ start: '2026-11-03', days: 2 }, TODAY)).toBe('next_week');
    expect(weekSection({ start: '2026-11-10', days: 2 }, TODAY)).toBe('later');
  });
});

describe('past due', () => {
  it('lists what is late and by how many days, the latest first', () => {
    const late = item({ ready: false, waitingOn: ['Owner'], readyBy: '2026-10-26' });
    const fine = item({ ready: false, waitingOn: ['Owner'], readyBy: '2026-11-05' });
    const booked = item({ visitId: 'v-old' });
    const done = item({ visitId: 'v-old', status: 'complete', completedBy: 'p1', completedAt: '2026-10-28T12:00:00Z' });
    const draft = item({ unfinished: true, ready: false, waitingOn: ['Owner'], readyBy: '2026-10-01' });
    const result = pastDue([late, fine, booked, done, draft], [visit({ id: 'v-old', start: '2026-10-19', days: 2 })], TODAY);
    expect(result.map((p) => [p.item.id, p.reason, p.days])).toEqual([
      [booked.id, 'visit', 10],
      [late.id, 'ready_by', 4],
    ]);
    expect(pastDueText(1)).toBe('1 day past due');
    expect(pastDueText(10)).toBe('10 days past due');
  });
});

describe('each company plan', () => {
  it('splits work into visits, ready now, coming free by date, no date yet and needs a price', () => {
    const items = [
      item({ id: 'r1', locationId: 'k' }),
      item({ id: 'r2', locationId: 'a' }),
      item({ id: 'b1', visitId: 'v1' }),
      item({ id: 'w1', ready: false, waitingOn: ['Volcano Stone'], readyBy: '2026-11-05' }),
      item({ id: 'w2', ready: false, waitingOn: ['Volcano Stone'], readyBy: '2026-11-05', locationId: 'a' }),
      item({ id: 'w3', ready: false, waitingOn: ['Owner'] }),
      item({ id: 'p1', kind: 'added_scope', boughtOut: false }),
      item({ id: 'u1', unfinished: true, title: '' }),
      item({ id: 'o1', companyId: 'c-vs', tradeId: 't-stone' }),
    ];
    const plan = companyPlan('c-sms', items, [visit({})], lookups, TODAY);
    expect(plan.visits.map((v) => [v.visit.id, v.end, v.lines.map((l) => l.item.id)])).toEqual([['v1', '2026-11-04', ['b1']]]);
    expect(plan.readyNow.map((l) => l.item.id)).toEqual(['r2', 'r1']);
    expect(plan.comingFree.map((g) => [g.date, g.on, g.lines.map((l) => l.item.id)])).toEqual([['2026-11-05', 'Volcano Stone', ['w2', 'w1']]]);
    expect(plan.noDate.map((g) => [g.on, g.lines.length])).toEqual([['Owner', 1]]);
    expect(plan.needsPrice.map((l) => l.item.id)).toEqual(['p1']);
    expect(notBooked(items, [visit({})], lookups, TODAY)).toEqual([
      { companyId: 'c-sms', company: 'SMS Carpentry', readyNow: 2, readyTime: { hours: 0, timed: 0, untimed: 2 }, nextFree: '2026-11-05', comingFree: 2, needsPrice: 1 },
      { companyId: 'c-vs', company: 'Volcano Stone', readyNow: 1, readyTime: { hours: 0, timed: 0, untimed: 1 }, nextFree: null, comingFree: 0, needsPrice: 0 },
    ]);
  });
});

describe('keeping the list current', () => {
  it('clears one holdup: ready when nothing else is left', () => {
    expect(clearHoldup({ ready: false, waitingOn: ['Owner', 'Volcano Stone'], waitingOnItems: [], readyBy: '2026-11-02' }, 'owner')).toEqual({
      ready: false,
      waitingOn: ['Volcano Stone'],
      waitingOnItems: [],
      readyBy: '2026-11-02',
    });
    expect(clearHoldup({ ready: false, waitingOn: ['Owner'], waitingOnItems: [], readyBy: '2026-11-02' }, 'Owner')).toEqual({ ready: true, waitingOn: [], waitingOnItems: [], readyBy: null });
  });

  it("frees what waits on a company once its work in the room is done", () => {
    const tops = item({ id: 'tops', companyId: 'c-vs', tradeId: 't-stone', locationId: 'k' });
    const backsplash = item({ id: 'bs', companyId: 'c-vs', tradeId: 't-stone', locationId: 'k' });
    const cabinets = item({ id: 'cab', locationId: 'k', ready: false, waitingOn: ['Volcano Stone'] });
    const elsewhere = item({ id: 'liv', locationId: 'a', ready: false, waitingOn: ['Volcano Stone'] });
    expect(freedBy(tops, [tops, backsplash, cabinets, elsewhere], 'Volcano Stone')).toEqual([]);
    const doneBacksplash = { ...backsplash, status: 'complete' as const };
    expect(freedBy(tops, [tops, doneBacksplash, cabinets, elsewhere], 'Volcano Stone').map((i) => i.id)).toEqual(['cab']);
  });

  it('finds the same item already in the room', () => {
    const a = item({ id: 'd1', title: 'Adjust cabinet door', locationId: 'k' });
    const b = item({ id: 'd2', title: 'Adjust cabinet door', locationId: 'a' });
    const c = item({ id: 'd3', title: 'Adjust cabinet door', locationId: 'k', status: 'complete', completedBy: 'p1', completedAt: '2026-10-28T12:00:00Z' });
    expect(duplicatesOf('adjust cabinet door.', 'k', [a, b, c]).map((i) => i.id)).toEqual(['d1']);
    expect(duplicatesOf('Adjust cabinet door', 'k', [a, b, c], 'd1')).toEqual([]);
  });
});

describe('unfinished items', () => {
  it('may wait for a title, company and trade, and finish themselves once they have them', () => {
    const draft = item({ unfinished: true, title: '', companyId: null, tradeId: null });
    expect(checkItem(draft)).toEqual([]);
    expect(missingText(draft)).toBe('Needs a title, company and trade');
    expect(tidyItem({ ...draft, title: 'Install toilet' }).unfinished).toBe(true);
    expect(tidyItem({ ...draft, title: 'Install toilet', companyId: 'c-sms', tradeId: 't-carp' }).unfinished).toBe(false);
    expect(() => complete(draft, { id: 'p1', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true })).toThrow(RuleError);
  });
});

describe('the owner and design team list', () => {
  it('lists who else work waits on, and what Ross Built needs from them by when', () => {
    const items = [
      item({ id: 'o1', ready: false, waitingOn: ['Owner'], readyBy: '2026-11-09', locationId: 'a' }),
      item({ id: 'o2', ready: false, waitingOn: ['Owner', 'Volcano Stone'], readyBy: '2026-11-02', locationId: 'k' }),
      item({ id: 'd1', ready: false, waitingOn: ['Cortney Bishop Design'] }),
      item({ id: 'rb', ready: false, waitingOn: ['Ross Built'] }),
    ];
    expect(partiesWaitedOn(items, lookups)).toEqual([
      { party: 'Owner', lines: 2 },
      { party: 'Cortney Bishop Design', lines: 1 },
    ]);
    const lines = partyList('owner', items, lookups);
    expect(lines.map((l) => l.item.id)).toEqual(['o2', 'o1']);
    const page = partyPrintout('Owner', lines, { job: { name: 'Fish', address: '715 North Shore Drive' }, date: new Date(2026, 9, 30) });
    expect(page.fileName).toBe('Fish Decisions Needed for Owner, October 30 2026.pdf');
    expect(page.body).toContain('These 2 items are waiting on your answer.');
    expect(page.body).toContain('<th>Needed By</th>');
    expect(page.body).toContain('November\u00a02');
  });
});

describe('what is new since the last list', () => {
  it('marks items that were not on the list last time, and nothing on the first list', () => {
    const sends: ListSend[] = [
      { id: 's1', jobId: 'j', list: 'company:c-sms', itemIds: ['a'], sentAt: '2026-10-16T12:00:00Z', sentBy: 'p1', removed: false },
      { id: 's2', jobId: 'j', list: 'company:c-sms', itemIds: ['a', 'b'], sentAt: '2026-10-23T12:00:00Z', sentBy: 'p1', removed: false },
      { id: 's3', jobId: 'j', list: 'company:c-sms', itemIds: [], sentAt: '2026-10-29T12:00:00Z', sentBy: 'p1', removed: true },
    ];
    const last = lastSend(sends, 'company:c-sms');
    expect(last?.id).toBe('s2');
    expect([...newSince(['a', 'b', 'c'], last)]).toEqual(['c']);
    expect([...newSince(['a'], undefined)]).toEqual([]);
  });
});

describe('filling in from the photo', () => {
  const ctx: SuggestContext = {
    room: 'Kitchen 109',
    titles: [
      { title: 'Adjust cabinet door', trade: 'Carpentry', hours: 0.5 },
      { title: 'Touch up paint', trade: 'Painting', hours: null },
    ],
    companies: [
      { name: 'SMS Carpentry', trade: 'Carpentry' },
      { name: 'Triple H Painting', trade: 'Painting' },
    ],
    trades: ['Carpentry', 'Painting', 'Stone'],
    marks: [{ tool: 'circle', color: 'red', from: [0.2, 0.15], to: [0.6, 0.5] }],
  };

  it('tells Claude the room, the marks and the job, and asks for JSON', () => {
    expect(describeMarks(ctx.marks)).toEqual(['A red circle around the area from 20% to 60% across and 15% to 50% down.']);
    const prompt = suggestPrompt(ctx);
    expect(prompt).toContain('The photo was taken in Kitchen 109.');
    expect(prompt).toContain('- Adjust cabinet door (Carpentry, usually 30 minutes)');
    expect(prompt).toContain('- Touch up paint (Painting)');
    expect(prompt).toContain('- hours: about how long the work takes');
    expect(prompt).toContain('- Triple H Painting (Painting)');
    expect(prompt).toContain('Reply with only JSON');
    expect(prompt).not.toContain('numbered spots');
  });

  it('tells Claude the sizes and the numbered spots marked on the photo', () => {
    const marked = {
      ...ctx,
      marks: [
        { tool: 'measure', color: 'red', from: [0.1, 0.5], to: [0.4, 0.5], text: '24 inches' },
        { tool: 'number', color: 'yellow', at: [0.2, 0.3], n: 1 },
        { tool: 'number', color: 'yellow', at: [0.6, 0.35], n: 2 },
        { tool: 'number', color: 'yellow', at: [0.7, 0.8], n: 3 },
      ],
    } satisfies typeof ctx;
    expect(describeMarks(marked.marks)).toEqual([
      'A red measurement from 10% across and 50% down to 40% across and 50% down, marked "24 inches".',
      'Spot 1, a yellow numbered dot at 20% across and 30% down.',
      'Spot 2, a yellow numbered dot at 60% across and 35% down.',
      'Spot 3, a yellow numbered dot at 70% across and 80% down.',
    ]);
    const prompt = suggestPrompt(marked);
    expect(prompt).toContain('The 3 numbered spots are places with the same work: the description says so, like "Three spots, numbered on the photo."');
    expect(prompt).toContain('A size marked on the photo goes in the description as it is written');
  });

  it('reads the answer back: standard titles word for word, only trades and companies on the job', () => {
    // A standard title's usual time wins over Claude's guess.
    expect(readSuggestion({ title: 'adjust cabinet door', description: ' Upper  left door rubs. ', trade: null, company: null, hours: 2 }, ctx)).toEqual({
      title: 'Adjust cabinet door',
      description: 'Upper left door rubs.',
      trade: 'Carpentry',
      company: 'SMS Carpentry',
      hours: 0.5,
    });
    expect(readSuggestion({ title: 'Patch drywall', description: '', trade: 'Drywall', company: 'Someone New', hours: '1.3' }, ctx)).toEqual({
      title: 'Patch drywall',
      description: '',
      trade: null,
      company: null,
      hours: 1.25,
    });
    expect(readSuggestion({ title: 'Touch up paint', hours: -1 }, ctx)?.hours).toBeNull();
    expect(readSuggestion({ title: 'Touch up paint', trade: 'painting' }, ctx)?.company).toBe('Triple H Painting');
    expect(readSuggestion({ nope: true }, ctx)).toBeNull();
  });

  it('builds the context from the job, and fills only what is blank', () => {
    const trades = [
      { id: 't1', name: 'Carpentry', sortOrder: 1 },
      { id: 't2', name: 'Painting', sortOrder: 2 },
    ];
    const companies = [
      { id: 'c1', name: 'SMS Carpentry', defaultTradeId: 't1', phone: null, email: null, active: true },
      { id: 'c2', name: 'Triple H Painting', defaultTradeId: 't2', phone: null, email: null, active: true },
    ];
    const built = suggestContext({
      location: 'Kitchen 109',
      titles: [
        { id: 'a', title: 'Touch up paint', tradeId: 't2', uses: 1, approved: true, hours: null },
        { id: 'b', title: 'Adjust cabinet door', tradeId: 't1', uses: 5, approved: true, hours: 0.5 },
        { id: 'c', title: 'Not approved', tradeId: null, uses: 9, approved: false, hours: null },
      ],
      trades,
      companies,
      jobCompanies: [{ jobId: 'j', companyId: 'c1', tradeId: 't1' }],
      marks: [],
    });
    expect(built.room).toBe('Kitchen 109');
    expect(built.titles.map((t) => t.title)).toEqual(['Adjust cabinet door', 'Touch up paint']);
    expect(built.titles[0]?.hours).toBe(0.5);
    expect(built.companies).toEqual([{ name: 'SMS Carpentry', trade: 'Carpentry' }]);
    const s = { title: 'Adjust cabinet door', description: 'Upper left door rubs.', trade: 'Carpentry', company: 'SMS Carpentry', hours: 0.5 };
    const blank = { title: '', description: '', companyId: null, tradeId: null, hours: null };
    expect(suggestionPatch(s, blank, trades, companies)).toEqual({
      title: 'Adjust cabinet door',
      description: 'Upper left door rubs.',
      companyId: 'c1',
      tradeId: 't1',
      hours: 0.5,
    });
    // What was typed stays, the estimate too.
    expect(suggestionPatch(s, { ...blank, title: 'Fix door', companyId: 'c2', tradeId: 't2', hours: 2 }, trades, companies)).toEqual({ description: 'Upper left door rubs.' });
  });
});

describe('a company list with planned visits', () => {
  it('prints each visit with its items, and keeps them off Ready', () => {
    const items = [
      item({ id: 'b1', number: 1, visitId: 'v1' }),
      item({ id: 'b2', number: 2, visitId: 'v1', locationId: 'a' }),
      item({ id: 'r1', number: 3 }),
      item({ id: 'w1', number: 4, ready: false, waitingOn: ['Owner'] }),
    ];
    const page = companyPrintout(companyList('c-sms', items, lookups), {
      job: { name: 'Fish', address: '715 North Shore Drive' },
      date: new Date(2026, 9, 30),
      visits: [visit({ id: 'v1', start: '2026-11-03', days: 2, confirmed: true })],
      isNew: (id) => id === 'r1',
    });
    expect(page.body).toContain('4 open items, 2 scheduled, 1 ready now and 1 waiting.');
    expect([...page.body.matchAll(/<h2 class="rb-section">(.*?)<\/h2>/g)].map((m) => m[1])).toEqual([
      'Scheduled Visits',
      'Ready, Not Scheduled Yet',
      'Waiting',
      'Anything Missing',
    ]);
    expect(page.body).toContain('Tuesday, November\u00a03 to Wednesday, November\u00a04, 2 days, confirmed');
    // Each item once: the two on the visit, then the ready one, then the waiting one.
    const numbers = [...page.body.matchAll(/<td class="rb-num">(\d+)/g)].map((m) => m[1]);
    expect(numbers).toEqual(['2', '1', '3', '4']);
    expect(page.body.match(/class="rb-new"/g)).toHaveLength(1);
  });
});

