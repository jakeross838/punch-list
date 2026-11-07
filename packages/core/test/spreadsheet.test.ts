import { describe, expect, it } from 'vitest';
import { csvCell, itemsCsv, itemsSheet, sheetFileName, sheetStatus, sortItems, SHEET_COLUMNS, type Item, type SheetLookups } from '../src/index';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'l1', number: n, assignedTo: null, title: `Item ${n}`, description: '',
    tradeId: 't1', companyId: 'c1', kind: 'deficiency', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null,
    boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, source: 'typed',
    extra: {}, unfinished: false, visitId: null, hours: null, btExternalId: null, createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z',
    ...over,
  };
}

const look = (items: Item[]): SheetLookups => ({
  locations: new Map([
    ['l1', { label: 'Kitchen 109', floor: 'Level 1' }],
    ['l2', { label: 'Master Bathroom 207', floor: 'Level 2' }],
  ]),
  companies: new Map([['c1', 'SMS Carpentry']]),
  people: new Map([['p1', 'Jake Ross']]),
  items: new Map(items.map((i) => [i.id, i])),
});

describe('the job as a spreadsheet', () => {
  it('has a row per item that is not removed, open first, by level, location and number', () => {
    const done = item({ title: 'Grout shower floor', status: 'complete', completedBy: 'p1', completedAt: '2026-11-02T15:00:00Z', locationId: 'l1' });
    const upstairs = item({ title: 'Set vanity tops', locationId: 'l2', ready: false, waitingOn: ['Owner'], readyBy: '2026-11-09' });
    const kitchen = item({ title: 'Adjust cabinet door', priority: true });
    const gone = item({ title: 'Old one', status: 'removed' });
    const ours = item({ title: 'Touch up trim', companyId: null, assignedTo: 'p1', locationId: 'l2' });
    const items = [done, upstairs, kitchen, gone, ours];
    const rows = itemsSheet(items, look(items));
    expect(rows.map((r) => r[1])).toEqual(['Adjust cabinet door', 'Set vanity tops', 'Touch up trim', 'Grout shower floor']);
    const at = (name: (typeof SHEET_COLUMNS)[number]) => SHEET_COLUMNS.indexOf(name);
    expect(rows[0]![at('Location')]).toBe('Kitchen 109');
    // Assigned To: the company, or the person on the team.
    expect(rows[0]![at('Assigned To')]).toBe('SMS Carpentry');
    expect(rows[2]![at('Assigned To')]).toBe('Jake Ross');
    expect(SHEET_COLUMNS).not.toContain('Company');
    expect(rows[0]![at('Priority')]).toBe('Yes');
    expect(rows[1]![at('Waiting On')]).toBe('Owner');
    // No dates or time: the schedule is not part of the app for now.
    expect(SHEET_COLUMNS).not.toContain('Ready By');
    expect(SHEET_COLUMNS).not.toContain('Estimated Hours');
    expect(rows[0]).toHaveLength(SHEET_COLUMNS.length);
    expect(rows[3]![at('Status')]).toBe('Complete');
    expect(rows[3]![at('Completed By')]).toBe('Jake Ross');
  });

  it('says the status the app shows', () => {
    expect(sheetStatus(item({ unfinished: true }))).toBe('Draft');
    expect(sheetStatus(item({ markedDoneAt: '2026-11-05T12:00:00Z' }))).toBe('Open');
    expect(sheetStatus(item({}))).toBe('Open');
  });

  it('quotes cells that need it and keeps formulas as text', () => {
    expect(csvCell('Plain')).toBe('Plain');
    expect(csvCell('Left, then right')).toBe('"Left, then right"');
    expect(csvCell('The "good" side')).toBe('"The ""good"" side"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5 inches')).toBe("'-5 inches");
    expect(csvCell(null)).toBe('');
  });

  it('starts with the column names and ends each line the way spreadsheets expect', () => {
    const items = [item({ title: 'Install door stop' })];
    const csv = itemsCsv(items, look(items));
    expect(csv.startsWith('Number,Title,Description,Level,Location')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('names the file for the job and the day', () => {
    expect(sheetFileName('Fish', '2026-11-05')).toBe('Fish Items 2026-11-05.csv');
    expect(sheetFileName('A/B: House', '2026-11-05')).toBe('A B House Items 2026-11-05.csv');
  });
});

describe('priority', () => {
  it('goes to the top of its list', () => {
    const a = item({ number: 1 });
    const b = item({ number: 2, priority: true });
    expect(sortItems([a, b]).map((i) => i.id)).toEqual([b.id, a.id]);
  });
});
