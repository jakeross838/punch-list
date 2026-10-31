import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  buildTimeline,
  earliestStart,
  holidayGroups,
  holidaysBetween,
  holidaysOf,
  isWorkingDay,
  lookAheadPrintout,
  timelineRows,
  visitEnd,
  workingIndex,
  type Item,
  type Location,
  type Visit,
} from '../src/index';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, title: `Item ${n}`, description: '', tradeId: 't',
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
const rooms: Pick<Location, 'id' | 'sortOrder'>[] = [
  { id: 'a', sortOrder: 1 },
  { id: 'k', sortOrder: 2 },
  { id: 'm', sortOrder: 3 },
];
// A Friday: the earliest new start, with notice, is Tuesday November 3.
const friday = '2026-10-30';
const shape = (bars: ReturnType<typeof buildTimeline>['bars']) => bars.map((b) => [b.companyId, b.kind, b.start, b.days, b.items.map((i) => i.id)]);

describe('the schedule the list builds', () => {
  it("packs a company's ready work into full days from the first day with notice, location by location", () => {
    const work = [
      item({ id: 'k1', locationId: 'k', hours: 6 }),
      item({ id: 'a1', locationId: 'a', hours: 4 }),
      item({ id: 'a2', locationId: 'a', hours: 3 }),
      item({ id: 'm1', locationId: 'm', hours: 1 }),
      item({ id: 'k2', locationId: 'k', hours: null }),
    ];
    const t = buildTimeline(work, [], rooms, friday);
    // Living's 7 hours and the hour upstairs fill Tuesday; the kitchen goes Wednesday, its unestimated item with it.
    expect(shape(t.bars)).toEqual([['sms', 'auto', '2026-11-03', 2, ['a1', 'a2', 'm1', 'k1', 'k2']]]);
    expect(t.finish).toBe('2026-11-04');
    // Longer than a day: whole days of its own.
    const long = buildTimeline([item({ id: 'big', hours: 20 })], [], rooms, friday);
    expect(shape(long.bars)).toEqual([['sms', 'auto', '2026-11-03', 3, ['big']]]);
  });

  it('follows the work each item waits on, however far back the chain goes, with a day of handoff', () => {
    const stone = item({ id: 'stone', companyId: 'vs', hours: 4 });
    const uppers = item({ id: 'uppers', ready: false, waitingOnItems: ['stone'], hours: 4 });
    const paint = item({ id: 'paint', companyId: 'hhh', ready: false, waitingOnItems: ['uppers'], hours: 3 });
    const t = buildTimeline([paint, uppers, stone, item({ id: 'other', companyId: 'gator', hours: 2 })], [], rooms, friday);
    expect(shape(t.bars)).toEqual([
      ['gator', 'auto', '2026-11-03', 1, ['other']],
      ['vs', 'auto', '2026-11-03', 1, ['stone']],
      ['sms', 'auto', '2026-11-04', 1, ['uppers']],
      ['hhh', 'auto', '2026-11-05', 1, ['paint']],
    ]);
    expect(t.finish).toBe('2026-11-05');
    // The painting sets the finish date, after the cabinets, after the stone; the plumber does not.
    expect(t.critical.map((b) => b.companyId)).toEqual(['vs', 'sms', 'hhh']);
  });

  it('never puts work on a holiday, and a visit counts working days past one', () => {
    expect(holidaysOf(2026).map((h) => h.day)).toEqual(['2026-01-01', '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-11-27', '2026-12-25']);
    // New Year's Day 2028 is a Saturday: taken on Friday, December 31, 2027.
    expect(isWorkingDay('2027-12-31')).toBe(false);
    expect(isWorkingDay('2026-11-26')).toBe(false);
    expect(addWorkingDays('2026-11-25', 1)).toBe('2026-11-30');
    expect(earliestStart('2026-11-24')).toBe('2026-11-30');
    // Three days from the Wednesday before Thanksgiving run to the Tuesday after; one booked on the holiday keeps its day.
    expect(visitEnd({ start: '2026-11-25', days: 3 })).toBe('2026-12-01');
    expect(visitEnd({ start: '2026-11-26', days: 1 })).toBe('2026-11-26');
    const t = buildTimeline([item({ id: 'big', hours: 24 })], [], rooms, '2026-11-23');
    expect(shape(t.bars)).toEqual([['sms', 'auto', '2026-11-25', 3, ['big']]]);
    expect(t.bars[0]!.end).toBe('2026-12-01');
    expect(holidayGroups(holidaysBetween('2026-11-23', '2026-12-31')).map((h) => [h.name, h.days])).toEqual([
      ['Thanksgiving', ['2026-11-26', '2026-11-27']],
      ['Christmas Day', ['2026-12-25']],
    ]);
  });

  it('shades the holidays on the look ahead and says them under the chart', () => {
    const t = buildTimeline([item({ id: 'big', hours: 24 })], [], rooms, '2026-11-20');
    const page = lookAheadPrintout(t, { locations: [{ id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true, walkedAt: null }], companies: [{ id: 'sms', name: 'SMS Carpentry', defaultTradeId: null, phone: null, email: null, active: true }] }, { job: { name: 'Fish', address: '' }, date: new Date(2026, 10, 20) }, '2026-11-20');
    expect(page.body.match(/<th class="rb-g-day rb-g-off">/g)?.length).toBe(2);
    expect(page.body).toMatch(/No work on Thanksgiving, Thursday, November.26 and Friday, November.27\./);
    expect(page.body).toContain('That date is set by SMS Carpentry.');
  });

  it('counts drafts with a company only when asked, for the finish date on a walk', () => {
    const work = [item({ id: 'done', hours: 8 }), item({ id: 'draft', companyId: 'hhh', unfinished: true, hours: 8, ready: true }), item({ id: 'blank', companyId: null, unfinished: true })];
    expect(buildTimeline(work, [], rooms, friday).finish).toBe('2026-11-03');
    const walk = buildTimeline(work, [], rooms, friday, { drafts: true });
    expect(shape(walk.bars)).toEqual([
      ['hhh', 'auto', '2026-11-03', 1, ['draft']],
      ['sms', 'auto', '2026-11-03', 1, ['done']],
    ]);
  });

  it('keeps what is on the schedule where it is, and works around it', () => {
    const booked = visit({ id: 'v-sms', start: '2026-11-03', days: 1, confirmed: true });
    const on = item({ id: 'on', visitId: 'v-sms', hours: 8 });
    const more = item({ id: 'more', hours: 2 });
    const after = item({ id: 'after', companyId: 'hhh', ready: false, waitingOnItems: ['on'] });
    const t = buildTimeline([on, more, after], [booked], rooms, friday);
    expect(shape(t.bars)).toEqual([
      ['sms', 'confirmed', '2026-11-03', 1, ['on']],
      ['hhh', 'auto', '2026-11-04', 1, ['after']],
      ['sms', 'auto', '2026-11-04', 1, ['more']],
    ]);
  });

  it('gives work left open on a visit that is over a new best guess, and the visit shows past due', () => {
    const over = visit({ id: 'v-old', start: '2026-10-26', days: 1 });
    const left = item({ id: 'left', visitId: 'v-old' });
    const t = buildTimeline([left], [over], rooms, friday);
    expect(t.bars.map((b) => [b.key, b.pastDue])).toEqual([
      ['v-old', true],
      ['auto:sms:2026-11-03', false],
    ]);
    expect(t.finish).toBe('2026-11-03');
  });

  it('lists what has no date yet and what is to be quoted', () => {
    const owner = item({ id: 'owner', ready: false, waitingOn: ['Owner'] });
    const dated = item({ id: 'dated', ready: false, waitingOn: ['Owner'], readyBy: '2026-11-09' });
    const after = item({ id: 'after', ready: false, waitingOnItems: ['owner'] });
    const extra = item({ id: 'extra', kind: 'added_scope', poOrCo: null });
    const loopA = item({ id: 'loopA', ready: false, waitingOnItems: ['loopB'] });
    const loopB = item({ id: 'loopB', ready: false, waitingOnItems: ['loopA'] });
    // Its Ready By has passed and it is still not ready: what it waits on is late.
    const late = item({ id: 'late', ready: false, waitingOn: ['Owner'], readyBy: '2026-10-26' });
    const t = buildTimeline([owner, dated, after, extra, loopA, loopB, late], [], rooms, friday);
    expect(shape(t.bars)).toEqual([['sms', 'auto', '2026-11-10', 1, ['dated']]]);
    expect(t.noDate.map((i) => i.id)).toEqual(['owner', 'after', 'loopA', 'loopB', 'late']);
    expect(t.needsPrice.map((i) => i.id)).toEqual(['extra']);
  });

  it('lays the companies out in the order their work starts, on working days from a Monday', () => {
    const t = buildTimeline([item({ id: 'late', companyId: 'z', ready: false, readyBy: '2026-11-12' }), item({ id: 'soon', companyId: 'y' })], [], rooms, friday);
    expect(timelineRows(t, '2026-11-02').map((r) => r.companyId)).toEqual(['y', 'z']);
    expect(workingIndex('2026-11-02', '2026-11-02')).toBe(0);
    expect(workingIndex('2026-11-02', '2026-11-06')).toBe(4);
    expect(workingIndex('2026-11-02', '2026-11-09')).toBe(5);
    expect(workingIndex('2026-11-02', '2026-11-07')).toBe(5);
  });

  it('prints the three week look ahead: the chart, what each visit covers with the location on every line, and what has no date', () => {
    const booked = visit({ id: 'v-hhh', companyId: 'hhh', start: '2026-11-03', days: 2, confirmed: true });
    const work = [
      item({ id: 'paint', companyId: 'hhh', title: 'Touch up paint', visitId: 'v-hhh', locationId: 'k' }),
      item({ id: 'shoe', title: 'Install shoe molding', locationId: 'a' }),
      item({ id: 'mirror', title: 'Set mirror', ready: false, waitingOn: ['Owner'], locationId: 'm' }),
    ];
    const t = buildTimeline(work, [booked], rooms, friday);
    const lookups = {
      locations: [
        { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room' as const, sortOrder: 1, active: true, walkedAt: null },
        { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room' as const, sortOrder: 2, active: true, walkedAt: null },
        { id: 'm', jobId: 'j', name: 'Master Bathroom', number: '207', label: 'Master Bathroom 207', floor: 'Level 2', kind: 'room' as const, sortOrder: 3, active: true, walkedAt: null },
      ],
      trades: [],
      companies: [
        { id: 'sms', name: 'SMS Carpentry', defaultTradeId: null, phone: null, email: null, active: true },
        { id: 'hhh', name: 'Triple H Painting', defaultTradeId: null, phone: null, email: null, active: true },
      ],
      items: work,
      visits: [booked],
    };
    const page = lookAheadPrintout(t, lookups, { job: { name: 'Fish', address: '' }, date: new Date(2026, 9, 30) }, friday);
    expect(page.title).toBe('Three Week Look Ahead');
    expect(page.fileName).toBe('Fish Three Week Look Ahead, October 30 2026.pdf');
    expect(page.body).toContain('Week of November\u00a02');
    expect(page.body).toContain('Everything with a date is done by Wednesday, November\u00a04.');
    // Triple H confirmed for two days from Tuesday; SMS Carpentry our best guess on Tuesday.
    expect(page.body).toContain('<td class="rb-g-name">Triple H Painting</td><td class="rb-g-cell rb-g-wk"></td><td colspan="2" class="rb-g-cell"><div class="rb-g-bar rb-g-ok rb-g-sets"></div></td>');
    expect(page.body).toContain('<td class="rb-g-name">SMS Carpentry</td><td class="rb-g-cell rb-g-wk"></td><td colspan="1" class="rb-g-cell"><div class="rb-g-bar"></div></td>');
    expect(page.body).toContain('<b>Install shoe molding</b>, Living 107');
    expect(page.body).toContain('2 days, confirmed');
    expect(page.body).toContain('Waiting on Owner');
  });
});
