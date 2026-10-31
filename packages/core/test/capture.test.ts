import { describe, expect, it } from 'vitest';
import {
  addPenPoint,
  byFloor,
  companiesWithWork,
  companyForTrade,
  companyList,
  companyPrintout,
  jobList,
  jobPrintout,
  printPage,
  tidyWaitingOn,
  waitingOnText,
  DEFAULT_FORM,
  formShows,
  groupItems,
  NO_FILTERS,
  isTooSmall,
  markBounds,
  markShapes,
  measureText,
  neighborRooms,
  nextNumber,
  QUICK_NOTES,
  setFieldShown,
  suggestTitles,
  tidyExtra,
  tidyItem,
  textWidth,
  tidyTitle,
  tradeForCompany,
  tradeForTitle,
  type CustomField,
  type Item,
  type Mark,
  type JobCompany,
  type Location,
  type StandardTitle,
} from '../src/index';

const library: StandardTitle[] = [
  { id: 's1', title: 'Adjust cabinet door', tradeId: 't-carp', uses: 12, approved: true, hours: null },
  { id: 's2', title: 'Adjust closet door', tradeId: 't-carp', uses: 3, approved: true, hours: null },
  { id: 's3', title: 'Adjust thermostat', tradeId: 't-ac', uses: 1, approved: true, hours: null },
  { id: 's4', title: 'Install cabinet hardware', tradeId: 't-carp', uses: 7, approved: true, hours: null },
  { id: 's5', title: 'Touch up paint', tradeId: 't-paint', uses: 40, approved: true, hours: null },
];

const jobCompanies: JobCompany[] = [
  { jobId: 'j', companyId: 'c-sms', tradeId: 't-carp' },
  { jobId: 'j', companyId: 'c-hhh', tradeId: 't-paint' },
  { jobId: 'j', companyId: 'c-a', tradeId: 't-ac' },
  { jobId: 'j', companyId: 'c-b', tradeId: 't-ac' },
];

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'k', number: n, title: `Item ${n}`, description: '', tradeId: 't-carp',
    companyId: 'c-sms', kind: 'deficiency', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: null, btExternalId: null, createdBy: 'p1',
    createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z', ...over,
  };
}

describe('titles', () => {
  it('suggests titles that start with the typing, then ones with a word that does, most used first', () => {
    expect(suggestTitles('adj', library).map((s) => s.title)).toEqual(['Adjust cabinet door', 'Adjust closet door', 'Adjust thermostat']);
    expect(suggestTitles('cab', library).map((s) => s.title)).toEqual(['Adjust cabinet door', 'Install cabinet hardware']);
    expect(suggestTitles('', library)).toEqual([]);
  });

  it('counts titles used on this job and adds ones not on the standard list', () => {
    const items = [item({ title: 'Adjust closet door' }), item({ title: 'Adjust closet door' }), item({ title: 'Adjust closet door' }), item({ title: 'Adjust closet door' }), item({ title: 'Adjust pivot hinge', tradeId: 't-carp' })];
    const got = suggestTitles('adj', library, items).map((s) => s.title);
    expect(got).toContain('Adjust pivot hinge');
    expect(got.indexOf('Adjust cabinet door')).toBeLessThan(got.indexOf('Adjust pivot hinge'));
  });

  it('fills in the trade from the title and the company from the trade, only when there is one', () => {
    expect(tradeForTitle('adjust Cabinet door', library)).toBe('t-carp');
    expect(tradeForTitle('Something new', library)).toBeNull();
    expect(companyForTrade('t-carp', jobCompanies)).toBe('c-sms');
    expect(companyForTrade('t-ac', jobCompanies)).toBeNull();
    expect(tradeForCompany('c-hhh', jobCompanies)).toBe('t-paint');
  });

  it('tidies a typed title to proper capitalization', () => {
    expect(tidyTitle('  install   toilet. ')).toBe('Install toilet');
  });
});

describe('marks', () => {
  it('draws marks at any size, each line with a soft edge under it so it shows on any wall', () => {
    const [boxEdge, box] = markShapes({ tool: 'box', color: 'red', from: [0.5, 0.5], to: [0.25, 0.25] }, 400, 300);
    expect(box).toMatchObject({ type: 'rect', x: 100, y: 75, width: 100, height: 75, rx: 3, stroke: '#D70015' });
    expect(boxEdge).toMatchObject({ type: 'rect', x: 100, y: 75, stroke: 'rgba(0, 0, 0, 0.3)' });
    expect((boxEdge as { strokeWidth: number }).strokeWidth).toBeGreaterThan((box as { strokeWidth: number }).strokeWidth);
    const [circleEdge, circle] = markShapes({ tool: 'circle', color: 'white', from: [0, 0], to: [1, 1] }, 200, 100);
    expect(circle).toMatchObject({ type: 'ellipse', cx: 100, cy: 50, rx: 100, ry: 50, stroke: '#FFFFFF' });
    expect(circleEdge).toMatchObject({ type: 'ellipse', stroke: 'rgba(0, 0, 0, 0.42)' });
    // An arrow: the shaft, then a solid head with its point on the spot.
    const arrow = markShapes({ tool: 'arrow', color: 'yellow', from: [0, 0], to: [0.5, 0.5] }, 100, 100);
    expect(arrow.map((a) => a.type)).toEqual(['path', 'path', 'path', 'path']);
    expect(arrow[3]).toMatchObject({ fill: '#FFD60A' });
    expect((arrow[3] as { d: string }).d).toMatch(/^M50 50L.*Z$/);
  });

  it('sets a note in a tag centered where it was placed', () => {
    const [edge, pill, words] = markShapes({ tool: 'text', color: 'black', at: [0.5, 0.5], text: 'Rubs the hood' }, 390, 520);
    expect(edge).toMatchObject({ type: 'rect', fill: 'rgba(255, 255, 255, 0.6)' });
    expect(pill).toMatchObject({ type: 'rect', fill: '#000000', stroke: 'none' });
    const { x, width } = pill as { x: number; width: number };
    expect(x + width / 2).toBeCloseTo(195, 0);
    expect(width).toBeGreaterThan(textWidth('Rubs the hood', 15.6));
    expect(words).toMatchObject({ type: 'text', x: 195, text: 'Rubs the hood', fill: '#FFFFFF', anchor: 'middle' });
  });

  it('draws a measurement like a dimension on the plans: a bar and an arrowhead at each end, and the size in a tag', () => {
    const shapes = markShapes({ tool: 'measure', color: 'red', from: [0.1, 0.5], to: [0.9, 0.5], text: '24 inches' }, 400, 300);
    expect(shapes.map((s) => s.type)).toEqual(['path', 'path', 'path', 'path', 'path', 'path', 'rect', 'rect', 'text']);
    expect(shapes[1]).toMatchObject({ d: 'M40 150L360 150M40 157.2L40 142.8M360 157.2L360 142.8', stroke: '#D70015' });
    expect(shapes[3]).toMatchObject({ fill: '#D70015' });
    expect((shapes[3] as { d: string }).d).toMatch(/^M40 150L/);
    expect((shapes[5] as { d: string }).d).toMatch(/^M360 150L/);
    expect(shapes[7]).toMatchObject({ type: 'rect', fill: '#D70015' });
    expect(shapes[8]).toMatchObject({ text: '24 inches', anchor: 'middle', x: 200, fill: '#FFFFFF' });
    // With no size typed, just the line, its ends and its arrowheads.
    expect(markShapes({ tool: 'measure', color: 'red', from: [0.1, 0.5], to: [0.9, 0.5], text: ' ' }, 400, 300)).toHaveLength(6);
  });

  it('draws a numbered spot as a pin with its number in the middle', () => {
    const [edge, dot, number] = markShapes({ tool: 'number', color: 'yellow', at: [0.5, 0.5], n: 3 }, 400, 300);
    expect(dot).toMatchObject({ type: 'ellipse', cx: 200, cy: 150, fill: '#FFD60A', stroke: '#FFFFFF' });
    expect(edge).toMatchObject({ type: 'ellipse', cx: 200, cy: 150, fill: 'rgba(0, 0, 0, 0.42)' });
    expect((edge as { rx: number }).rx).toBeGreaterThan((dot as { rx: number }).rx);
    expect(number).toMatchObject({ type: 'text', x: 200, text: '3', anchor: 'middle', fill: '#1C1C1E' });
    const spots: Mark[] = [
      { tool: 'number', color: 'red', at: [0.1, 0.1], n: 1 },
      { tool: 'arrow', color: 'red', from: [0, 0], to: [0.5, 0.5] },
      { tool: 'number', color: 'red', at: [0.3, 0.3], n: 2 },
    ];
    expect(nextNumber([])).toBe(1);
    expect(nextNumber(spots)).toBe(3);
  });

  it('writes a measurement out with no abbreviations', () => {
    expect(measureText('24')).toBe('24 inches');
    expect(measureText('1')).toBe('1 inch');
    expect(measureText('1/4"')).toBe('1/4 inch');
    expect(measureText('3-1/2 in')).toBe('3 1/2 inches');
    expect(measureText('3 1/2')).toBe('3 1/2 inches');
    expect(measureText(`2'6"`)).toBe('2 feet 6 inches');
    expect(measureText(`6' 8`)).toBe('6 feet 8 inches');
    expect(measureText(`2'0"`)).toBe('2 feet');
    expect(measureText('1 ft')).toBe('1 foot');
    expect(measureText('4', 'feet')).toBe('4 feet');
    expect(measureText('36 Inches')).toBe('36 inches');
    expect(measureText('24\u201D')).toBe('24 inches');
    expect(measureText('  out of level ')).toBe('Out of level');
    expect(measureText('  ')).toBe('');
  });

  it('knows the part of the photo the marks are on, so a cropped photo can keep them in view', () => {
    expect(markBounds([])).toBeNull();
    expect(
      markBounds([
        { tool: 'circle', color: 'red', from: [0.2, 0.15], to: [0.6, 0.4] },
        { tool: 'number', color: 'red', at: [0.3, 0.85], n: 1 },
        { tool: 'pen', color: 'red', points: [[0.1, 0.5], [0.15, 0.55]] },
      ]),
    ).toEqual([0.1, 0.15, 0.6, 0.85]);
  });

  it('offers the standard note words, written the way titles are', () => {
    expect(QUICK_NOTES).toContain('Touch up');
    expect(QUICK_NOTES.every((w) => tidyTitle(w) === w)).toBe(true);
  });

  it('treats a tap as no mark, and keeps a pen line light', () => {
    expect(isTooSmall({ tool: 'arrow', color: 'red', from: [0.5, 0.5], to: [0.502, 0.501] })).toBe(true);
    expect(isTooSmall({ tool: 'box', color: 'red', from: [0.1, 0.1], to: [0.4, 0.4] })).toBe(false);
    expect(isTooSmall({ tool: 'text', color: 'red', at: [0.1, 0.1], text: '  ' })).toBe(true);
    expect(isTooSmall({ tool: 'measure', color: 'red', from: [0.5, 0.5], to: [0.501, 0.5], text: '' })).toBe(true);
    expect(isTooSmall({ tool: 'number', color: 'red', at: [0.5, 0.5], n: 1 })).toBe(false);
    const pts = addPenPoint(addPenPoint([[0.1, 0.1]], [0.1005, 0.1]), [0.2, 0.2]);
    expect(pts).toEqual([[0.1, 0.1], [0.2, 0.2]]);
    expect(addPenPoint([], [1.4, -0.2])).toEqual([[1, 0]]);
  });
});

describe('the form and added fields', () => {
  it('turns fields on and off, and starts new items as completion work', () => {
    expect(formShows(DEFAULT_FORM, 'kind')).toBe(true);
    expect(DEFAULT_FORM.startKind).toBe('completion');
    const s = setFieldShown(setFieldShown(DEFAULT_FORM, 'kind', false), 'readyBy', false);
    expect(formShows(s, 'kind')).toBe(false);
    expect(formShows(s, 'readyBy')).toBe(false);
    expect(formShows(setFieldShown(s, 'kind', true), 'kind')).toBe(true);
  });

  it('tidies added field answers by their kind', () => {
    const list: CustomField = { id: 'f1', label: 'Found By', kind: 'list', options: ['Owner', 'Architect'], sortOrder: 1, active: true };
    expect(tidyExtra(list, 'Owner')).toBe('Owner');
    expect(tidyExtra(list, 'Someone else')).toBeNull();
    expect(tidyExtra({ ...list, kind: 'text' }, '  note  ')).toBe('note');
    expect(tidyExtra({ ...list, kind: 'yes_no' }, true)).toBe(true);
    expect(tidyExtra({ ...list, kind: 'date' }, 'soon')).toBeNull();
    expect(tidyItem({ ...item({}), extra: { f1: '  Owner ' } }).extra).toEqual({ f1: 'Owner' });
  });
});

describe('walking the job', () => {
  const rooms: Location[] = [
    { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true },
    { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true },
    { id: 'm', jobId: 'j', name: 'Master Bedroom', number: '206', label: 'Master Bedroom 206', floor: 'Level 2', kind: 'room', sortOrder: 3, active: true },
    { id: 'r', jobId: 'j', name: 'Roof', number: null, label: 'Roof', floor: null, kind: 'shared', sortOrder: 4, active: true },
  ];

  it('lists rooms under their floor and the shared areas last', () => {
    expect(byFloor(rooms, (r) => r).map((f) => [f.floor, f.rows.length])).toEqual([['Level 1', 2], ['Level 2', 1], ['Outside and Whole House', 1]]);
  });

  it('knows the room before and after, in floor order', () => {
    expect(neighborRooms(rooms, 'k')).toMatchObject({ previous: { id: 'a' }, next: { id: 'm' } });
    expect(neighborRooms(rooms, 'a').previous).toBeNull();
  });

  it('groups by what items wait on: ready, to be quoted, then late holdups and the biggest first, with drafts left in Drafts', () => {
    const items = [
      item({ ready: false, waitingOn: ['Owner'] }),
      item({ ready: false, waitingOn: ['Volcano Stone', 'owner'] }),
      item({ ready: false, waitingOn: ['Volcano Stone'] }),
      item({ ready: false, waitingOn: ['Volcano Stone'] }),
      item({}),
      item({ status: 'complete', completedBy: 'p1', completedAt: '2026-10-29T12:00:00Z' }),
      item({ tradeId: 't-paint', companyId: 'c-hhh' }),
      item({ unfinished: true, title: '', companyId: null, tradeId: null }),
      item({ kind: 'added_scope', boughtOut: false }),
      item({ kind: 'added_scope', boughtOut: false, ready: false, waitingOn: ['Owner'] }),
    ];
    const lookups = { locations: rooms, trades: [], companies: [] };
    const groups = groupItems(items, 'waiting', lookups, { showCompleted: true });
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Ready', 2],
      ['To Be Quoted', 2],
      ['Owner', 3],
      ['Volcano Stone', 3],
      ['Completed', 1],
    ]);
    // Drafts stay out of every other list until they are filled in.
    for (const by of ['room', 'trade', 'company'] as const) {
      expect(groupItems(items, by, lookups, { showCompleted: true }).some((g) => g.items.some((i) => i.unfinished))).toBe(false);
    }
    // A holdup past its Ready By goes first, however small.
    const late = [...items, item({ ready: false, waitingOn: ['Gator Plumbing'], readyBy: '2026-10-20' })];
    const context = { today: '2026-10-30', visits: [], photoItemIds: new Set<string>(), locations: rooms };
    const byLate = groupItems(late, 'waiting', lookups, { context }).filter((g) => g.key.startsWith('waiting:'));
    expect(byLate.map((g) => [g.label, g.late])).toEqual([
      ['Gator Plumbing', 10],
      ['Owner', 0],
      ['Volcano Stone', 0],
    ]);
    const painting = groupItems(items, 'room', lookups, { filters: { ...NO_FILTERS, tradeIds: ['t-paint'] } });
    expect(painting.flatMap((g) => g.items).map((i) => i.tradeId)).toEqual(['t-paint']);
  });

  it('reads a Waiting On list as a sentence, and tidies it', () => {
    expect(waitingOnText(['Owner'])).toBe('Owner');
    expect(waitingOnText(['Owner', 'Volcano Stone'])).toBe('Owner and Volcano Stone');
    expect(waitingOnText(['Owner', 'Ross Built', 'Volcano Stone'])).toBe('Owner, Ross Built and Volcano Stone');
    expect(tidyWaitingOn([' Owner ', 'owner', '', 'Volcano  Stone'])).toEqual(['Owner', 'Volcano Stone']);
  });
});

describe('the lists that go to the subs', () => {
  const rooms: Location[] = [
    { id: 'a', jobId: 'j', name: 'Living', number: '107', label: 'Living 107', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true },
    { id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true },
  ];
  const lookups = {
    locations: rooms,
    trades: [{ id: 't-carp', name: 'Carpentry', sortOrder: 1 }, { id: 't-paint', name: 'Painting', sortOrder: 2 }],
    companies: [
      { id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true },
      { id: 'c-hhh', name: 'Triple H Painting', defaultTradeId: 't-paint', phone: null, email: null, active: true },
    ],
  };
  const items = [
    item({ locationId: 'k', number: 1 }),
    item({ locationId: 'a', number: 2 }),
    item({ locationId: 'k', number: 3, ready: false, waitingOn: ['Owner'], readyBy: '2026-11-09' }),
    item({ locationId: 'a', number: 4, ready: false, waitingOn: ['Volcano Stone', 'Owner'], readyBy: '2026-11-02' }),
    item({ locationId: 'a', number: 5, ready: false, waitingOn: ['Owner'] }),
    item({ locationId: 'k', number: 6, status: 'complete', completedBy: 'p1', completedAt: '2026-10-29T12:00:00Z' }),
    item({ locationId: 'k', number: 7, tradeId: 't-paint', companyId: 'c-hhh' }),
  ];

  it('gives each company what is ready now in floor order, then what waits, soonest first', () => {
    const list = companyList('c-sms', items, lookups);
    expect(list.open).toBe(5);
    expect(list.ready.map((l) => [l.room, l.item.number])).toEqual([['Living 107', 2], ['Kitchen 109', 1]]);
    expect(list.waiting.map((g) => [g.on, g.readyBy, g.lines.map((l) => l.item.number)])).toEqual([
      ['Volcano Stone and Owner', '2026-11-02', [4]],
      ['Owner', '2026-11-09', [5, 3]],
    ]);
  });

  it('lists the companies with open work, and the whole job by room then trade', () => {
    expect(companiesWithWork(items, lookups)).toEqual([
      { companyId: 'c-sms', name: 'SMS Carpentry', open: 5, ready: 2, needsPrice: 0 },
      { companyId: 'c-hhh', name: 'Triple H Painting', open: 1, ready: 1, needsPrice: 0 },
    ]);
    expect(jobList(items, lookups).map((l) => [l.room, l.trade, l.item.number])).toEqual([
      ['Living 107', 'Carpentry', 2],
      ['Living 107', 'Carpentry', 4],
      ['Living 107', 'Carpentry', 5],
      ['Kitchen 109', 'Carpentry', 1],
      ['Kitchen 109', 'Carpentry', 3],
      ['Kitchen 109', 'Painting', 7],
    ]);
  });

  const settings = { job: { name: 'Fish', address: '715 North Shore Drive' }, date: new Date(2026, 9, 30) };
  const dataRows = (html: string) => html.match(/<tr class="rb-row[^"]*">.*?<\/tr>/g) ?? [];

  it('prints a company list: ready now, then waiting by what it waits on, days for each batch and lines to add more', () => {
    const page = companyPrintout(companyList('c-sms', items, lookups), settings);
    expect(page.title).toBe('SMS Carpentry');
    expect(page.fileName).toBe('Fish Completion List for SMS Carpentry, October 30 2026.pdf');
    expect(page.body).toContain('Fish, 715 North Shore Drive');
    expect(page.body).toContain('Carpentry: 5 open items, 2 ready now and 3 waiting.');
    const sections = [...page.body.matchAll(/<h2 class="rb-section">(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(sections).toEqual(['Ready', 'Waiting', 'Anything Missing']);
    // The month and day never break apart on the page.
    expect(page.body).toContain('Waiting on Volcano Stone and Owner, ready by November\u00a02');
    expect(page.body).toContain('Waiting on Owner, ready by November\u00a09');
    // The room on every line, never only on the first line of a group.
    const lines = dataRows(page.body);
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toMatch(/Living 107|Kitchen 109/);
    // One line for the days of each batch: the ready items, then each waiting group.
    expect(page.body.match(/<tr class="rb-days">/g)).toHaveLength(3);
    expect(page.body).toContain('How many days for these 2 items?');
    expect(page.body).toContain('How many days for this item?');
    expect(page.body.match(/<tr class="rb-blank">/g)).toHaveLength(6);
    expect(page.body).not.toContain('<th>Photo</th>');
  });

  it('prints each photo with its marks, cropped the same way, and keeps text safe', () => {
    const odd = item({ locationId: 'k', number: 8, title: 'Fix <trim> & caulk', description: 'Left "returns"' });
    const marks: Mark[] = [
      { tool: 'circle', color: 'red', from: [0.2, 0.2], to: [0.6, 0.5] },
      { tool: 'number', color: 'red', at: [0.3, 0.7], n: 1 },
      { tool: 'measure', color: 'red', from: [0.1, 0.9], to: [0.9, 0.9], text: '24 inches' },
    ];
    const page = companyPrintout(companyList('c-sms', [...items, odd], lookups), {
      ...settings,
      photo: (id) => (id === odd.id ? { src: 'data:image/jpeg;base64,AAAA', width: 3000, height: 4000, marks } : undefined),
    });
    expect(page.body).toContain('Fix &lt;trim&gt; &amp; caulk');
    expect(page.body).toContain('Left &quot;returns&quot;');
    expect(page.body).toContain('<th>Photo</th>');
    expect(page.body).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(page.body).toContain('viewBox="0 0 1000 1333" preserveAspectRatio="xMidYMid slice"');
    expect(page.body).toMatch(/<ellipse [^>]*stroke="#D70015"/);
    // A numbered spot is a pin with its number centered; a size is set in a tag.
    expect(page.body).toMatch(/<ellipse [^>]*stroke="#FFFFFF"[^>]*fill="#D70015"\/>/);
    expect(page.body).toMatch(/<text [^>]*text-anchor="middle">1<\/text>/);
    expect(page.body).toMatch(/<rect [^>]*rx="[\d.]+" stroke="none" stroke-width="0" fill="#D70015"/);
    expect(page.body).toMatch(/<text [^>]*fill="#FFFFFF"[^>]*text-anchor="middle">24 inches<\/text>/);
    // A tall photo stops at the most the line allows.
    expect(page.body).toContain('style="height:1.45in"');
    // The lines to add more have no photo column.
    expect(page.body).toMatch(/<h2 class="rb-section">Anything Missing<\/h2>.*?<colgroup>(<col[^>]*>){3}<\/colgroup>/);
  });

  it('puts added scope that is not priced yet under To Be Quoted, not Ready Now', () => {
    const extra = item({ locationId: 'a', number: 9, kind: 'added_scope', boughtOut: false });
    const priced = item({ locationId: 'a', number: 10, kind: 'added_scope', boughtOut: true, poOrCo: 'CO 12' });
    const list = companyList('c-sms', [extra, priced], lookups);
    expect(list.ready.map((l) => l.item.number)).toEqual([10]);
    expect(list.needsPrice.map((l) => l.item.number)).toEqual([9]);
    const page = companyPrintout(list, settings);
    expect(page.body).toContain('Additional, to be quoted');
    // The order said in full, and a line for the price on what is to be quoted.
    expect(page.body).toContain('Additional, Change Order 12');
    expect(page.body).toContain('<th>Price</th>');
    expect(page.body).toContain('$<span class="rb-price"></span>');
    expect(page.body).toContain('2 open items, 1 ready now and 1 to be quoted.');
    expect([...page.body.matchAll(/<h2 class="rb-section">(.*?)<\/h2>/g)].map((m) => m[1])).toEqual(['Ready', 'To Be Quoted', 'Anything Missing']);
  });

  it('prints the whole job floor by floor and room by room, with the trade and company on every line', () => {
    const page = jobPrintout(jobList(items, lookups), settings);
    expect(page.fileName).toBe('Fish Completion List, October 30 2026.pdf');
    expect(page.body).toContain('6 open items in 2 locations: 3 ready now and 3 waiting.');
    expect([...page.body.matchAll(/<h2 class="rb-section">(.*?)<\/h2>/g)].map((m) => m[1])).toEqual(['Level 1']);
    expect([...page.body.matchAll(/<tr class="rb-band"><td colspan="4">(.*?) \u00b7 /g)].map((m) => m[1])).toEqual(['Living 107', 'Kitchen 109']);
    const lines = dataRows(page.body);
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(line).toMatch(/<div class="rb-meta">(SMS Carpentry \u00b7 Carpentry|Triple H Painting \u00b7 Painting) \u00b7 /);
    expect(page.body).toContain('Waiting on Volcano Stone and Owner, ready by November\u00a02');
    expect(page.body.match(/<tr class="rb-blank">/g)).toHaveLength(4);
    expect(printPage(page)).toMatch(/^<!DOCTYPE html>.*<div class="rb-doc">.*<\/div><\/body><\/html>$/s);
    expect(printPage(page, { pageMargins: false })).toContain('@page{size:letter;margin:0}');
  });
});
