import { describe, expect, it } from 'vitest';
import {
  customPrintout,
  DEFAULT_LIST_DESIGN,
  filterChips,
  filteredLines,
  listTitle,
  matchesFilters,
  NO_FILTERS,
  type FilterContext,
  type Item,
  type ListDesign,
  type Location,
} from '../src/index';

const rooms: Location[] = [
  { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null },
  { id: 'b', jobId: 'j', name: 'Bathroom', number: '207', label: 'Bathroom 207', floor: 'Level 2', kind: 'room', sortOrder: 2, active: true, walkedAt: null },
];
const lookups = {
  locations: rooms,
  trades: [
    { id: 't-carp', name: 'Carpentry', sortOrder: 1 },
    { id: 't-paint', name: 'Painting', sortOrder: 2 },
  ],
  companies: [
    { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
    { id: 'c-hhh', name: 'Triple H Painting', defaultTradeId: 't-paint', phone: null, email: null, active: true },
  ],
};
const names = {
  companies: new Map(lookups.companies.map((c) => [c.id, c.name])),
  trades: new Map(lookups.trades.map((t) => [t.id, t.name])),
  people: new Map([['jake', 'Jake Ross']]),
  locations: new Map(rooms.map((l) => [l.id, l.label])),
};

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'typed', extra: {}, unfinished: false, visitId: null,
    hours: null, btExternalId: null, createdBy: 'jake', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

const items = [
  item({ id: 'a', title: 'Install baseboard', locationId: 'b', hours: 2, description: 'Both long walls.' }),
  item({ id: 'b', title: 'Touch up paint', companyId: 'c-hhh', tradeId: 't-paint', hours: 0.5, kind: 'deficiency' }),
  item({ id: 'c', title: 'Set upper cabinets', hours: 4, ready: false, waitingOn: ['Volcano Stone'], readyBy: '2026-11-02' }),
  item({ id: 'd', title: 'Install closet system', locationId: 'b', kind: 'added_scope', boughtOut: false }),
  item({ id: 'e', title: 'Grout shower floor', locationId: 'b', status: 'complete', completedBy: 'jake', completedAt: '2026-10-28T15:00:00Z', hours: 3 }),
  item({ id: 'f', title: 'Draft', unfinished: true }),
  item({ id: 'g', title: 'Removed', status: 'removed' }),
];
const today = new Date(2026, 9, 31);
const settings = { job: { name: 'Fish', address: '715 North Shore Drive' }, date: today };
const design = (over: Partial<ListDesign> = {}): ListDesign => ({ ...DEFAULT_LIST_DESIGN, details: DEFAULT_LIST_DESIGN.details.filter((d) => d !== 'photo'), ...over });

describe('a list made to order', () => {
  it('takes the items that pass the filters, in floor order, completed ones only when asked', () => {
    expect(filteredLines(items, NO_FILTERS, lookups).map((l) => l.item.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(filteredLines(items, NO_FILTERS, lookups, { completed: true }).map((l) => l.item.id)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(filteredLines(items, { ...NO_FILTERS, companyIds: ['c-sms'], states: ['ready'] }, lookups).map((l) => l.item.id)).toEqual(['a', 'd']);
  });

  it('filters by single locations too', () => {
    const f = { ...NO_FILTERS, locationIds: ['b'] };
    expect(items.filter((i) => matchesFilters(i, f)).map((i) => i.id)).toEqual(['a', 'd', 'e']);
    expect(filterChips(f, names).map((c) => c.label)).toEqual(['Bathroom 207']);
  });

  it('suggests a title from the filters', () => {
    expect(listTitle({ ...NO_FILTERS, companyIds: ['c-sms'], states: ['ready'] }, names)).toBe('SMS Carpentry');
    expect(listTitle({ ...NO_FILTERS, companyIds: ['c-sms', 'c-hhh'] }, names)).toBe('SMS Carpentry and Triple H Painting');
    expect(listTitle({ ...NO_FILTERS, floors: ['Level 1'] }, names)).toBe('Level 1');
    expect(listTitle({ ...NO_FILTERS, locationIds: ['k'] }, names)).toBe('Kitchen 109');
    expect(listTitle({ ...NO_FILTERS, floors: ['Level 2'] }, names)).toBe('Level 2');
    expect(listTitle({ ...NO_FILTERS, states: ['ready'] }, names)).toBe('Whole Job');
  });

  it('goes level by level and location by location, the details on every line, each group with its time', () => {
    const lines = filteredLines(items, NO_FILTERS, lookups, { completed: true });
    const page = customPrintout(lines, design({ title: 'Fish Open Work' }), { ...settings, filters: ['Ready', 'SMS Carpentry'] });
    expect(page.title).toBe('Fish Open Work');
    expect(page.fileName).toBe('Fish Fish Open Work, October 31 2026.pdf');
    const body = page.body;
    expect(body).toContain('4 open items in 2 locations: 2 ready now, 1 waiting and 1 to be quoted.');
    expect(body).toContain('About 6.5 hours of work, or 1 day, with 1 not estimated.');
    expect(body).toContain('Also 1 completed item.');
    expect(body).toContain('Filters: Ready, SMS Carpentry.');
    expect(body).toContain('<h2 class="rb-section">Level 1</h2>');
    expect(body).toContain('Kitchen 109 · 2 items · 4.5 hours');
    expect(body).toContain('Bathroom 207 · 3 items · 2 hours, 1 not estimated');
    // The company and type on every line, never only on the first one of a group.
    expect(body.match(/SMS Carpentry · Incomplete/g)?.length).toBe(3);
    expect(body).toContain('Triple H Painting · Deficiency');
    expect(body).toContain('SMS Carpentry · Additional, to be quoted');
    expect(body).toContain('Waiting on Volcano Stone, ready by November\u00a02');
    expect(body).toContain('Completed October\u00a028');
    expect(body).toContain('<span class="rb-quiet">Not estimated</span>');
    expect(body).toContain('Both long walls.');
    // The completed item comes after the open ones in its location.
    expect(body.indexOf('Install closet system')).toBeLessThan(body.indexOf('Grout shower floor'));
  });

  it('shows only the details picked, and leaves the time and status columns off when they are off', () => {
    const lines = filteredLines(items, NO_FILTERS, lookups);
    const body = customPrintout(lines, design({ details: ['location'] }), settings).body;
    expect(body).not.toContain('<th>Ready</th>');
    expect(body).not.toContain('<th>Time</th>');
    expect(body).not.toContain('Both long walls.');
    expect(body).not.toContain('About ');
    expect(body).toContain('<div class="rb-meta">Kitchen 109</div>');
    // Additional work always says whether it is priced.
    expect(body).toContain('<div class="rb-note">Additional, to be quoted</div>');
    expect(customPrintout(lines, design(), settings).title).toBe('Whole Job');
  });

  it('groups by company or what it waits on, with lines for the days and to add items', () => {
    const lines = filteredLines(items, NO_FILTERS, lookups, { completed: true });
    const byCompany = customPrintout(lines, design({ groupBy: 'company', daysLines: true, blankLines: true }), settings).body;
    expect(byCompany).toContain('SMS Carpentry · 4 items');
    expect(byCompany).toContain('How many days for these 3 items?');
    expect(byCompany).toContain('How many days for this item?');
    expect(byCompany.match(/rb-blank/g)?.length).toBe(4);
    const byWaiting = customPrintout(lines, design({ groupBy: 'waiting' }), settings).body;
    const order = ['Ready · 2 items', 'Waiting on Volcano Stone · 1 item', 'To Be Quoted · 1 item', 'Completed · 1 item'].map((x) => byWaiting.indexOf(x));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('says so when nothing matches, and keeps text safe on the page', () => {
    const page = customPrintout([], design({ title: 'Doors <and> trim' }), settings);
    expect(page.body).toContain('Nothing matches right now.');
    expect(page.body).toContain('Doors &lt;and&gt; trim');
    expect(page.fileName).toBe('Fish Doors and trim, October 31 2026.pdf');
  });
});

describe('filters for a list', () => {
  it('reads the location filter back from a saved view', () => {
    const context: FilterContext = { today: '2026-10-31', visits: [], photoItemIds: new Set(), locations: rooms };
    expect(items.filter((i) => matchesFilters(i, { ...NO_FILTERS, locationIds: ['k'], floors: ['Level 2'] }, context))).toEqual([]);
  });
});
