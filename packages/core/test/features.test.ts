// The app as it goes out, with the parts in packages/core/src/features.ts switched off: Type and
// Order, Hours, Visits and the Owner's Page. Every other test file runs with them on (vitest.config.ts
// sets EXPO_PUBLIC_FEATURES to "all"), so those parts stay checked; this one checks that with them off
// nothing of them shows on a screen, a list, a page, in Activity or in what Claude is told, and that
// what an item already has of them is kept as it was.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activityLines,
  activityLookups,
  companyList,
  companyListEmail,
  companyListText,
  companyPrintout,
  customPrintout,
  DEFAULT_FORM,
  DEFAULT_LIST_DESIGN,
  doFirst,
  FEATURES,
  featureOn,
  featuresFrom,
  filteredLines,
  filterStates,
  findPrompt,
  formFields,
  formShows,
  foundToFilters,
  FREES_NOTHING,
  groupItems,
  hasOrder,
  help,
  howPrompt,
  isPriced,
  itemsCsv,
  itemsSheet,
  kindText,
  listDetails,
  NO_FILTERS,
  readFilters,
  readFind,
  readHow,
  readSuggestion,
  readViewSettings,
  resetFeatures,
  searchHelp,
  setFeatures,
  sheetColumns,
  SHIPPED,
  startKind,
  templatePlan,
  tidyItem,
  todayPlan,
  type Activity,
  type Item,
  type JobCompany,
  type Location,
  type TemplateItem,
  type Visit,
} from '../src/index';

beforeAll(() => resetFeatures());
// The files after this one in the same worker, if any, get every part back on.
afterAll(() => setFeatures(featuresFrom('all')));

let n = 0;
function item(over: Partial<Item> = {}): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, assignedTo: null, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: null,
    btExternalId: null, createdBy: 'jake', createdAt: '2026-11-09T10:00:00Z', updatedAt: '2026-11-09T10:00:00Z', ...over,
  };
}

const rooms: Location[] = [
  { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null },
  { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true, walkedAt: null },
];
const trades = [{ id: 't-carp', name: 'Carpentry', sortOrder: 1 }, { id: 't-paint', name: 'Painting', sortOrder: 2 }];
const companies = [
  { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
  { id: 'c-hhh', name: 'Triple H Painting', defaultTradeId: 't-paint', phone: null, email: null, active: true },
];
const lookups = { locations: rooms, trades, companies };
const settings = { job: { name: 'Smith Residence', address: '123 Gulf Drive' }, date: new Date(2026, 10, 10) };

// What the list had before the parts were switched off: a deficiency, extra work with no order yet,
// extra work with its change order, and work with a time and a purchase order from Buildertrend.
const scratch = item({ id: 'scratch', title: 'Fix scratched door', kind: 'deficiency' });
const shelf = item({ id: 'shelf', title: 'Add a shelf', kind: 'added_scope', boughtOut: false });
const niche = item({ id: 'niche', title: 'Frame a niche', kind: 'added_scope', poOrCo: 'CO 14' });
const crown = item({ id: 'crown', title: 'Install crown', locationId: 'a', hours: 2.5, poOrCo: 'PO-0006' });
const list = [scratch, shelf, niche, crown];

describe('what goes out', () => {
  it('has all four parts switched off', () => {
    expect(SHIPPED).toEqual({ types: false, hours: false, visits: false, ownerPage: false });
    expect(FEATURES.map((f) => featureOn(f))).toEqual([false, false, false, false]);
  });

  it('reads the parts a build names to switch on, and nothing else', () => {
    expect(featuresFrom('all')).toEqual({ types: true, hours: true, visits: true, ownerPage: true });
    expect(featuresFrom(' types, HOURS ,ownerpage')).toEqual({ types: true, hours: true, ownerPage: true });
    expect(featuresFrom('schedule, everything')).toEqual({});
    expect(featuresFrom(undefined)).toEqual({});
    expect(featuresFrom('')).toEqual({});
  });

  it('comes back a part at a time when one is switched on again', () => {
    setFeatures({ types: true });
    expect(isPriced(shelf)).toBe(false);
    expect(kindText(niche)).toBe('Additional, Change Order 14');
    expect(featureOn('hours')).toBe(false);
    resetFeatures();
    expect(isPriced(shelf)).toBe(true);
    expect(kindText(niche)).toBe('');
  });
});

describe('with Type and Order switched off', () => {
  it('treats every item as just an item: nothing waits to be quoted, and no type is said', () => {
    expect(list.map((i) => isPriced(i))).toEqual([true, true, true, true]);
    expect(list.map((i) => kindText(i))).toEqual(['', '', '', '']);
  });

  it('keeps what an item has: its type, its order number, and Bought Out as the database keeps it', () => {
    expect(hasOrder(shelf)).toBe(false);
    expect(hasOrder(niche)).toBe(true);
    const saved = tidyItem({ ...shelf, title: '  Add a shelf  ' });
    expect([saved.kind, saved.poOrCo, saved.boughtOut, saved.title]).toEqual(['added_scope', null, false, 'Add a shelf']);
    const ordered = tidyItem(niche);
    expect([ordered.kind, ordered.poOrCo, ordered.boughtOut]).toEqual(['added_scope', 'CO 14', true]);
    expect(tidyItem(crown).poOrCo).toBe('PO-0006');
  });

  it('takes Type off the item form and starts every new item the same way', () => {
    expect(formFields().map((f) => f.field)).toEqual(['description', 'company', 'ready', 'waitingOn']);
    expect(formShows(DEFAULT_FORM, 'kind')).toBe(false);
    expect(formShows(DEFAULT_FORM, 'ready')).toBe(true);
    expect(startKind({ ...DEFAULT_FORM, startKind: 'added_scope' })).toBe('completion');
  });

  it("puts extra work on a company's list with the rest, numbered, and prints no type, order or To Be Quoted", () => {
    const made = companyList('c-sms', list, lookups);
    expect(made.needsPrice).toEqual([]);
    expect(made.ready.map((l) => l.item.id).sort()).toEqual(['crown', 'niche', 'scratch', 'shelf']);
    expect(made.ready.every((l) => l.step !== null)).toBe(true);
    const page = companyPrintout(made, settings).body;
    expect(page).toContain('Add a shelf');
    for (const word of ['To Be Quoted', 'to be quoted', 'Additional', 'Deficiency', 'Change Order', 'Purchase Order', 'PO-0006', 'CO 14']) expect(page).not.toContain(word);
  });

  it('leaves Type out of a list made to order, even one saved with it', () => {
    expect(listDetails().map((d) => d.detail)).toEqual(['description', 'location', 'company', 'status', 'comments', 'photo']);
    expect(DEFAULT_LIST_DESIGN.details).toContain('type');
    const page = customPrintout(filteredLines(list, NO_FILTERS, lookups), DEFAULT_LIST_DESIGN, settings).body;
    expect(page).toContain('Frame a niche');
    for (const word of ['Deficiency', 'Incomplete', 'Additional', 'Change Order', 'to be quoted']) expect(page).not.toContain(word);
  });

  it('leaves the Type column out of the spreadsheet, with a cell under every column', () => {
    const look = { locations: new Map(rooms.map((r) => [r.id, { label: r.label, floor: r.floor }])), companies: new Map(companies.map((c) => [c.id, c.name])), people: new Map<string, string>(), items: new Map(list.map((i) => [i.id, i])) };
    const columns = sheetColumns();
    expect(columns).not.toContain('Type');
    expect(columns.slice(0, 8)).toEqual(['Number', 'Title', 'Description', 'Level', 'Location', 'Assigned To', 'Status', 'Ready']);
    const rows = itemsSheet(list, look);
    expect(rows.every((r) => r.length === columns.length)).toBe(true);
    const shelfRow = rows.find((r) => r[1] === 'Add a shelf')!;
    expect(shelfRow[columns.indexOf('Assigned To')]).toBe('SMS Carpentry');
    expect(shelfRow[columns.indexOf('Status')]).toBe('Open');
    const csv = itemsCsv(list, look);
    expect(csv.split('\r\n')[0]).toBe(columns.join(','));
    expect(csv).not.toContain('Additional');
  });

  it('offers no filter by type or To Be Quoted, and drops them from anything saved or found', () => {
    expect(filterStates()).toEqual(['ready', 'not_ready']);
    const read = readFilters({ states: ['ready', 'needs_price', 'past_due'], kinds: ['deficiency', 'added_scope'], companyIds: ['c-sms'] });
    expect([read.states, read.kinds, read.companyIds]).toEqual([['ready'], [], ['c-sms']]);
    expect(readViewSettings({ filter: 'added_scope' }).filters.kinds).toEqual([]);
    const found = foundToFilters(
      { states: ['needs_price', 'not_ready'], kinds: ['deficiency'], companies: [], people: [], floors: [], locations: [], waitingOn: [], photo: null, scheduled: true, estimated: false, groupBy: null, showCompleted: false },
      { companies: new Map(), people: new Map(), locations: new Map() },
    );
    expect([found.states, found.kinds, found.scheduled, found.estimated]).toEqual([['not_ready'], [], null, null]);
  });

  it('groups by what items wait on with nothing set apart to be quoted', () => {
    const groups = groupItems(list, 'waiting', lookups);
    expect(groups.find((g) => g.key === 'price')?.items ?? []).toEqual([]);
    expect(groups.find((g) => g.key === 'ready')!.items.map((i) => i.id).sort()).toEqual(['crown', 'niche', 'scratch', 'shelf']);
  });

  it('asks Claude for no types when finding things by what was said, and takes none back', () => {
    const input = { words: 'extra work on level 2', locations: ['Kitchen 109'], floors: ['Level 1'], companies: ['SMS Carpentry'], people: [], waitingOn: [] };
    const prompt = findPrompt(input);
    for (const word of ['needs_price', 'added_scope', 'deficiency', 'on a visit', 'with a time']) expect(prompt).not.toContain(word);
    expect(prompt).toContain('"not_ready"');
    const read = readFind('{"states": ["needs_price", "ready"], "kinds": ["added_scope"], "companies": ["SMS Carpentry"], "scheduled": true, "estimated": true, "photo": true}', input)!;
    expect([read.states, read.kinds, read.companies, read.scheduled, read.estimated, read.photo]).toEqual([['ready'], [], ['SMS Carpentry'], null, null, true]);
  });
});

const look = activityLookups({
  people: [{ id: 'jake', email: 'jake@example.com', name: 'Jake Ross', active: true, role: 'admin', sees: 'all', phone: null }],
  items: list,
  locations: rooms,
  companies,
  trades,
  visits: [],
  customFields: [],
  today: new Date(2026, 10, 10),
});
let a = 0;
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 10, 13, minutes)).toISOString();
const entry = (over: Partial<Activity> & Pick<Activity, 'kind'>): Activity => ({ id: `a${String(++a).padStart(3, '0')}`, jobId: 'j', itemId: 'shelf', personId: 'jake', at: at(0), ...over });
const change = (minutes: number, field: string, before: string | null, after: string | null): Activity => entry({ kind: 'item_changed', field, before, after, at: at(minutes) });

describe('Activity, with the parts switched off', () => {
  it('says nothing about a type, an order, a time or a visit being changed', () => {
    const quiet = activityLines(
      [change(1, 'kind', 'completion', 'added_scope'), change(2, 'po_or_co', null, 'CO 14'), change(3, 'bought_out', 'false', 'true'), change(4, 'hours', null, '2'), change(5, 'visit_id', null, 'v1')],
      look,
    );
    expect(quiet).toEqual([]);
  });

  it('still says the rest of a change made alongside one', () => {
    const lines = activityLines([change(1, 'kind', 'completion', 'deficiency'), change(1, 'description', null, 'At the pantry door.'), change(2, 'hours', null, '4')], look);
    expect(lines).toHaveLength(1);
    const said = `${lines[0]!.action} ${lines[0]!.detail ?? ''}`;
    expect(said).toContain('At the pantry door');
    for (const word of ['Type', 'Deficiency', 'How long', '4 hours']) expect(said).not.toContain(word);
  });

  it("says nothing of a company's time for an item, or of visits made, moved or answered", () => {
    const lines = activityLines(
      [
        entry({ kind: 'item_hours_given', itemId: 'crown', personId: null, at: at(10), detail: { company_id: 'c-sms', hours: 3, author_name: 'Mike' } }),
        entry({ kind: 'visit_added', itemId: null, at: at(20), detail: { visit_id: 'v1', company_id: 'c-sms', start: '2026-11-12', days: 2 } }),
        entry({ kind: 'visit_confirmed_by_company', itemId: null, personId: null, at: at(30), detail: { visit_id: 'v1', company_id: 'c-sms', start: '2026-11-12', days: 2 } }),
        entry({ kind: 'item_confirmed', itemId: 'crown', personId: null, at: at(40), detail: { company_id: 'c-sms', author_name: 'Mike' } }),
      ],
      look,
    );
    expect(lines.map((l) => l.action)).toEqual(['confirmed Install crown']);
  });
});

describe('with Hours switched off', () => {
  it('prints no time on a list and asks no company for one', () => {
    const page = companyPrintout(companyList('c-sms', list, lookups), { ...settings, link: { url: 'https://punch-list.expo.app/c#abc', code: null } }).body;
    expect(page).toContain('Install crown');
    for (const word of ['About 2.5 hours', '2.5 hours', 'how long']) expect(page).not.toContain(word);
    expect(page).toContain('Confirm each item, mark it done and comment on anything.');
    const email = companyListEmail({ job: settings.job, contacts: [{ name: 'Mike Lane' }], from: { name: 'Jake Ross' }, company: 'Ross Built', ready: 2, link: 'https://punch-list.expo.app/c#abc' });
    expect(email.body).toContain('There you can confirm each item, mark it done and comment on anything:');
    expect(email.body).not.toContain('how long');
    const text = companyListText({ job: settings.job, contacts: [{ name: 'Mike Lane' }], from: { name: 'Jake Ross' }, link: 'https://punch-list.expo.app/c#abc' });
    expect(text).toContain('where you can confirm each item and mark it done: https://punch-list.expo.app/c#abc');
    expect(text).not.toContain('how long');
  });

  it("orders a company's work by what can be seen: the hours held up break no tie", () => {
    const facts = (hours: number) => ({ ready: true, priority: false, readyBy: null, freed: { items: 2, hours } });
    expect(doFirst(facts(8), facts(1))).toBe(0);
    expect(doFirst({ ...facts(1), freed: { items: 3, hours: 1 } }, facts(8))).toBeLessThan(0);
    expect(doFirst({ ...facts(0), freed: FREES_NOTHING }, { ...facts(0), freed: FREES_NOTHING })).toBe(0);
  });

  it('fills in no time from a photo, even for a standard title that has one', () => {
    const ctx = { room: 'Kitchen 109', titles: [{ title: 'Install crown', trade: 'Carpentry', hours: 3 }], companies: [{ name: 'SMS Carpentry', trade: 'Carpentry' }], trades: ['Carpentry'], marks: [] };
    const got = readSuggestion({ title: 'Install crown', description: '', trade: 'Carpentry', company: 'SMS Carpentry', hours: 2 }, ctx)!;
    expect([got.title, got.company, got.hours]).toEqual(['Install crown', 'SMS Carpentry', null]);
  });

  it('puts no time and no type on work added from a template', () => {
    const tasks: TemplateItem[] = [
      { id: 't1', templateId: 'tp', title: 'Install mirror', description: '', kind: 'deficiency', tradeId: 't-carp', hours: 1.5, place: 'Whole House', waitsOn: [], sortOrder: 1, active: true },
    ];
    const house: Location[] = [{ id: 'wh', jobId: 'j', name: 'Whole House', number: '', label: 'Whole House', floor: null, kind: 'shared', sortOrder: 1, active: true, walkedAt: null }];
    const jobCompanies: JobCompany[] = [{ jobId: 'j', companyId: 'c-sms', tradeId: 't-carp' }];
    let made = 0;
    const plan = templatePlan(tasks, { jobId: 'j', locations: house, items: [], jobCompanies }, () => `new${++made}`);
    expect(plan.items.map((i) => [i.title, i.kind, i.hours, i.companyId])).toEqual([['Install mirror', 'completion', null, 'c-sms']]);
  });
});

describe('with Visits switched off', () => {
  it('has nobody on site for the day, whatever visits the database still holds', () => {
    const visit: Visit = { id: 'v1', jobId: 'j', companyId: 'c-sms', start: '2026-11-10', days: 1, confirmed: true, note: '', removed: false, askedStart: null, askedDays: null, askedName: null, askedAt: null, createdBy: 'jake', createdAt: '2026-11-09T10:00:00Z', updatedAt: '2026-11-09T10:00:00Z' };
    const mine = item({ id: 'mine', assignedTo: 'jake', companyId: null });
    const booked = item({ id: 'booked', visitId: 'v1' });
    const plan = todayPlan({
      meId: 'jake',
      jobs: [{ id: 'j', name: 'Smith Residence', address: '123 Gulf Drive', closed: false }],
      items: [mine, booked],
      locations: rooms,
      visits: [visit],
      companies,
      now: new Date(2026, 10, 10, 9),
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.onSite).toEqual([]);
    expect(plan[0]!.mine.map((i) => i.id)).toEqual(['mine']);
  });
});

describe("with the Owner's Page switched off", () => {
  it("leaves the owner's page and the update to the owner out of the help, and keeps the Job Station", () => {
    const ids = help().map((h) => h.id);
    expect(ids).not.toContain('owner-page');
    expect(ids).not.toContain('owner-update');
    expect(ids).toContain('station');
    expect(help().some((h) => h.topic === 'The Owner')).toBe(false);
    for (const h of help()) {
      expect(`${h.question} ${h.answer}`).not.toContain("Owner's Page");
      expect(h.answer).not.toContain("owner's update");
      expect(h.answer).not.toContain('signs off');
      expect(h.answer).not.toContain('who is on site');
    }
  });

  it("finds nothing about the owner's page in a search of the help, and tells Claude nothing of it", () => {
    expect(searchHelp("owner's page").map((h) => h.id)).toEqual([]);
    expect(searchHelp('station').map((h) => h.id)).toContain('station');
    const prompt = howPrompt({ question: "How do I send the owner's page?" });
    expect(prompt).not.toContain('[owner-page]');
    expect(prompt).not.toContain('[owner-update]');
    expect(prompt).toContain('[station]');
    expect(readHow('{"answer": "It is not in the app right now.", "topics": ["owner-page", "station"]}')?.topics).toEqual(['station']);
  });
});
