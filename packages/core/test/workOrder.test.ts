import { describe, expect, it } from 'vitest';
import { companyList, companyListEmail, companyPrintout, doFirst, freedWork, freesText, FREES_NOTHING, type Item, type Location } from '../src/index';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, assignedTo: null, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: 2,
    btExternalId: null, createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

const rooms: Location[] = [
  { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null },
  { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true, walkedAt: null },
];
const lookups = {
  locations: rooms,
  trades: [{ id: 't-carp', name: 'Carpentry', sortOrder: 1 }, { id: 't-stone', name: 'Stone', sortOrder: 2 }, { id: 't-paint', name: 'Painting', sortOrder: 3 }],
  companies: [
    { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
    { id: 'c-vs', name: 'Volcano Stone', defaultTradeId: 't-stone', phone: null, email: null, active: true },
    { id: 'c-hhh', name: 'Triple H Painting', defaultTradeId: 't-paint', phone: null, email: null, active: true },
  ],
};

// SMS Carpentry's work. The base cabinets hold up the stone tops, which hold up the backsplash and
// then the paint: three items down the chain, across two other companies. The shoe molding holds up
// the paint in the living room. The crown holds up nothing.
const crown = item({ id: 'crown', title: 'Install crown', locationId: 'a' });
const shoe = item({ id: 'shoe', title: 'Install shoe molding', locationId: 'a', hours: 3 });
const bases = item({ id: 'bases', title: 'Set base cabinets' });
const tops = item({ id: 'tops', title: 'Template and set tops', companyId: 'c-vs', tradeId: 't-stone', ready: false, waitingOnItems: ['bases'], hours: 6 });
const splash = item({ id: 'splash', title: 'Install backsplash', companyId: 'c-vs', tradeId: 't-stone', ready: false, waitingOnItems: ['tops'], hours: 4 });
const paintK = item({ id: 'paintK', title: 'Touch up paint', companyId: 'c-hhh', tradeId: 't-paint', ready: false, waitingOnItems: ['splash'], hours: 1 });
const paintA = item({ id: 'paintA', title: 'Paint baseboards', companyId: 'c-hhh', tradeId: 't-paint', locationId: 'a', ready: false, waitingOnItems: ['shoe'], hours: 1 });
const uppers = item({ id: 'uppers', title: 'Set upper cabinets', ready: false, waitingOnItems: ['splash'], readyBy: '2026-11-12' });
const shelves = item({ id: 'shelves', title: 'Install closet shelves', ready: false, waitingOn: ['Owner'], readyBy: '2026-11-09' });
const job = [crown, shoe, bases, tops, splash, paintK, paintA, uppers, shelves];

describe('what finishing an item frees up', () => {
  it('counts everything that waits on it down the chain, across every company, with its hours', () => {
    const freed = freedWork(job);
    expect(freed.get('bases')).toEqual({ items: 4, hours: 6 + 4 + 1 + 2 });
    expect(freed.get('shoe')).toEqual({ items: 1, hours: 1 });
    expect(freed.get('crown')).toEqual(FREES_NOTHING);
    expect(freed.get('splash')).toEqual({ items: 2, hours: 3 });
  });

  it('leaves out what is done or removed, and anything that waits on itself through a chain', () => {
    const done = { ...tops, status: 'complete' as const };
    expect(freedWork([bases, done, splash]).get('bases')).toEqual(FREES_NOTHING);
    const a = item({ id: 'loopA', waitingOnItems: ['loopB'] });
    const b = item({ id: 'loopB', waitingOnItems: ['loopA'] });
    expect(freedWork([a, b]).get('loopA')).toEqual({ items: 1, hours: 2 });
  });

  it('reads as how many it holds up', () => {
    expect(freesText({ items: 1, hours: 2 })).toBe('Holds up 1 item');
    expect(freesText({ items: 4, hours: 13 })).toBe('Holds up 4 items');
    expect(freesText(FREES_NOTHING)).toBe('');
  });
});

describe('the order to do the work', () => {
  const facts = (over: Partial<Parameters<typeof doFirst>[0]>) => ({ ready: true, priority: false, readyBy: null, freed: FREES_NOTHING, ...over });

  it('puts what can be done now first, Priority first, then what frees the most, then the most hours of it', () => {
    expect(doFirst(facts({}), facts({ ready: false }))).toBeLessThan(0);
    expect(doFirst(facts({ freed: { items: 5, hours: 9 } }), facts({ priority: true }))).toBeGreaterThan(0);
    expect(doFirst(facts({ freed: { items: 1, hours: 9 } }), facts({ freed: { items: 2, hours: 1 } }))).toBeGreaterThan(0);
    expect(doFirst(facts({ freed: { items: 2, hours: 1 } }), facts({ freed: { items: 2, hours: 5 } }))).toBeGreaterThan(0);
    expect(doFirst(facts({}), facts({}))).toBe(0);
  });

  it('takes what is not ready yet soonest ready first, then the same way', () => {
    expect(doFirst(facts({ ready: false, readyBy: '2026-11-12' }), facts({ ready: false, readyBy: '2026-11-09' }))).toBeGreaterThan(0);
    expect(doFirst(facts({ ready: false, readyBy: null }), facts({ ready: false, readyBy: '2026-12-01' }))).toBeGreaterThan(0);
    expect(doFirst(facts({ ready: false, freed: { items: 3, hours: 1 } }), facts({ ready: false }))).toBeLessThan(0);
  });
});

describe("a company's list in the order to do it", () => {
  const list = companyList('c-sms', job, lookups);

  it('numbers what is ready first, by what it holds up, then what is waiting, soonest ready first', () => {
    expect(list.ready.map((l) => [l.step, l.item.id, l.freed.items])).toEqual([
      [1, 'bases', 4],
      [2, 'shoe', 1],
      [3, 'crown', 0],
    ]);
    expect(list.waiting.flatMap((g) => g.lines.map((l) => [l.step, l.item.id]))).toEqual([
      [4, 'shelves'],
      [5, 'uppers'],
    ]);
  });

  it('puts an item marked Priority first among what is ready', () => {
    const rush = { ...crown, priority: true };
    const ordered = companyList('c-sms', [rush, ...job.filter((i) => i.id !== 'crown')], lookups);
    expect(ordered.ready.map((l) => l.item.id)).toEqual(['crown', 'bases', 'shoe']);
  });

  it('leaves what the company says is done unnumbered, after the rest, for the builder to check', () => {
    const said = { ...bases, markedDoneAt: '2026-11-05T15:00:00Z' };
    const checked = companyList('c-sms', [said, ...job.filter((i) => i.id !== 'bases')], lookups);
    expect(checked.ready.map((l) => [l.step, l.item.id])).toEqual([
      [1, 'shoe'],
      [2, 'crown'],
      [null, 'bases'],
    ]);
    expect(checked.waiting.flatMap((g) => g.lines.map((l) => l.step))).toEqual([3, 4]);
  });

  it('leaves the work still to be quoted unnumbered', () => {
    const extra = item({ id: 'extra', title: 'Add a shelf', kind: 'added_scope', poOrCo: null, boughtOut: false });
    const quoted = companyList('c-sms', [...job, extra], lookups);
    expect(quoted.needsPrice.map((l) => [l.item.id, l.step])).toEqual([['extra', null]]);
  });

  it('prints the order and what each item holds up', () => {
    const page = companyPrintout(list, { job: { name: 'Fish', address: '' }, builder: 'Ross Built', date: new Date(2026, 10, 6) }).body;
    expect(page).toContain('>Order<');
    expect(page).toContain('Holds up 4 items');
    expect(page).toContain('Start at number 1: the first ones hold up the most other work.');
    const plain = companyPrintout(companyList('c-sms', [crown], lookups), { job: { name: 'Fish', address: '' }, builder: 'Ross Built', date: new Date(2026, 10, 6) }).body;
    expect(plain).toContain('These can be done any time.</p>');
    expect(plain).not.toContain('Holds up');
  });

  it('says in the email that the list is numbered', () => {
    const mail = companyListEmail({ job: { name: 'Fish', address: '' }, contacts: [{ name: 'Dave' }], from: { name: 'Jake Ross' }, ready: 3 });
    expect(mail.body).toContain('It is numbered in the order to do it, starting with what holds up the most other work.');
    expect(mail.body).not.toMatch(/[–—-]{1}\s/);
  });
});
