import { describe, expect, it } from 'vitest';
import {
  addPenPoint,
  byFloor,
  companyForTrade,
  DEFAULT_FORM,
  formShows,
  groupItems,
  isTooSmall,
  markShapes,
  neighborRooms,
  setFieldShown,
  suggestTitles,
  tidyExtra,
  tidyItem,
  tidyTitle,
  tradeForCompany,
  tradeForTitle,
  type CustomField,
  type Item,
  type JobCompany,
  type Location,
  type StandardTitle,
} from '../src/index';

const library: StandardTitle[] = [
  { id: 's1', title: 'Adjust cabinet door', tradeId: 't-carp', uses: 12, approved: true },
  { id: 's2', title: 'Adjust closet door', tradeId: 't-carp', uses: 3, approved: true },
  { id: 's3', title: 'Adjust thermostat', tradeId: 't-ac', uses: 1, approved: true },
  { id: 's4', title: 'Install cabinet hardware', tradeId: 't-carp', uses: 7, approved: true },
  { id: 's5', title: 'Touch up paint', tradeId: 't-paint', uses: 40, approved: true },
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
    companyId: 'c-sms', kind: 'deficiency', ready: true, waitingOn: null, readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'walk', extra: {}, btExternalId: null, createdBy: 'p1',
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
  it('draws marks at any size from points on the photo', () => {
    const [box] = markShapes({ tool: 'box', color: 'red', from: [0.5, 0.5], to: [0.25, 0.25] }, 400, 300);
    expect(box).toMatchObject({ type: 'rect', x: 100, y: 75, width: 100, height: 75, stroke: '#D70015' });
    const [circle] = markShapes({ tool: 'circle', color: 'white', from: [0, 0], to: [1, 1] }, 200, 100);
    expect(circle).toMatchObject({ type: 'ellipse', cx: 100, cy: 50, rx: 100, ry: 50 });
    const [arrow] = markShapes({ tool: 'arrow', color: 'yellow', from: [0, 0], to: [0.5, 0.5] }, 100, 100);
    expect(arrow?.type).toBe('path');
    const [text] = markShapes({ tool: 'text', color: 'black', at: [0.5, 0.5], text: 'Rubs the hood' }, 390, 520);
    expect(text).toMatchObject({ type: 'text', x: 195, y: 260, text: 'Rubs the hood', fill: '#000000' });
  });

  it('treats a tap as no mark, and keeps a pen line light', () => {
    expect(isTooSmall({ tool: 'arrow', color: 'red', from: [0.5, 0.5], to: [0.502, 0.501] })).toBe(true);
    expect(isTooSmall({ tool: 'box', color: 'red', from: [0.1, 0.1], to: [0.4, 0.4] })).toBe(false);
    expect(isTooSmall({ tool: 'text', color: 'red', at: [0.1, 0.1], text: '  ' })).toBe(true);
    const pts = addPenPoint(addPenPoint([[0.1, 0.1]], [0.1005, 0.1]), [0.2, 0.2]);
    expect(pts).toEqual([[0.1, 0.1], [0.2, 0.2]]);
    expect(addPenPoint([], [1.4, -0.2])).toEqual([[1, 0]]);
  });
});

describe('the form and added fields', () => {
  it('turns fields on and off, and keeps title and room on', () => {
    expect(formShows(DEFAULT_FORM, 'poOrCo')).toBe(false);
    const s = setFieldShown(setFieldShown(DEFAULT_FORM, 'poOrCo', true), 'readyBy', false);
    expect(formShows(s, 'poOrCo')).toBe(true);
    expect(formShows(s, 'readyBy')).toBe(false);
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
    expect(byFloor(rooms, (r) => r).map((f) => [f.floor, f.rows.length])).toEqual([['Level 1', 2], ['Level 2', 1], ['Shared Areas', 1]]);
  });

  it('knows the room before and after, in floor order', () => {
    expect(neighborRooms(rooms, 'k')).toMatchObject({ previous: { id: 'a' }, next: { id: 'm' } });
    expect(neighborRooms(rooms, 'a').previous).toBeNull();
  });

  it('groups by status, and filters by trade and company', () => {
    const items = [
      item({ ready: false, waitingOn: 'Owner' }),
      item({}),
      item({ status: 'complete', completedBy: 'p1', completedAt: '2026-10-29T12:00:00Z' }),
      item({ tradeId: 't-paint', companyId: 'c-hhh' }),
    ];
    const lookups = { locations: rooms, trades: [], companies: [] };
    const groups = groupItems(items, 'status', 'open', lookups, { showCompleted: true });
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Not Ready', 1], ['Ready', 2], ['Completed', 1]]);
    const painting = groupItems(items, 'room', 'open', lookups, { tradeId: 't-paint' });
    expect(painting.flatMap((g) => g.items).map((i) => i.tradeId)).toEqual(['t-paint']);
  });
});
