// A job's items as a spreadsheet, for Excel, Numbers or Google Sheets: one row per item with its
// number, title, location, who it is assigned to, type, status and the rest, in the same words the app uses. It
// is written as CSV, which every spreadsheet opens. A cell that starts like a formula is kept as
// text, so nothing in a title can run in someone's spreadsheet.

import { assigneeName } from './assignees';
import { waitingOnText } from './waitingOn';
import { kindText } from './orders';
import type { Item } from './types';

export interface SheetLookups {
  locations: Map<string, { label: string; floor: string | null }>;
  companies: Map<string, string>;
  people: Map<string, string>;
  /** Item titles, for the tasks an item waits on. */
  items: Map<string, Item>;
}

export const SHEET_COLUMNS = [
  'Number',
  'Title',
  'Description',
  'Level',
  'Location',
  'Assigned To',
  'Type',
  'Status',
  'Ready',
  'Waiting On',
  'Priority',
  'Checklist',
  'Added',
  'Completed',
  'Completed By',
] as const;

/** The status an item shows in the app: Draft, Open or Complete. */
export function sheetStatus(item: Item): string {
  if (item.status === 'complete') return 'Complete';
  if (item.status === 'removed') return 'Removed';
  if (item.unfinished) return 'Draft';
  return 'Open';
}

/** One cell as CSV: quoted when it needs to be, and never read as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

/** The items as rows, open ones first, then by level, location and number. Removed items are left off. */
export function itemsSheet(items: Item[], look: SheetLookups): string[][] {
  const where = (i: Item) => look.locations.get(i.locationId);
  const order = (i: Item) => (i.status === 'complete' ? 1 : 0);
  const kept = items
    .filter((i) => i.status !== 'removed')
    .sort(
      (a, b) =>
        order(a) - order(b) ||
        (where(a)?.floor ?? '').localeCompare(where(b)?.floor ?? '') ||
        (where(a)?.label ?? '').localeCompare(where(b)?.label ?? '') ||
        (a.number ?? 1e9) - (b.number ?? 1e9),
    );
  return kept.map((i) => {
    const loc = where(i);
    const tasks = i.waitingOnItems.map((id) => look.items.get(id)?.title.trim() || 'another item');
    const steps = i.checklist ?? [];
    return [
      i.number === null ? '' : String(i.number),
      i.title,
      i.description,
      loc?.floor ?? '',
      loc?.label ?? '',
      assigneeName(i, look) ?? '',
      kindText(i),
      sheetStatus(i),
      i.ready ? 'Yes' : 'No',
      i.ready ? '' : waitingOnText([...tasks, ...i.waitingOn]),
      i.priority ? 'Yes' : '',
      steps.length > 0 ? `${steps.filter((s) => s.done).length} of ${steps.length} done` : '',
      day(i.createdAt),
      i.status === 'complete' ? day(i.completedAt) : '',
      i.status === 'complete' && i.completedBy ? (look.people.get(i.completedBy) ?? '') : '',
    ];
  });
}

/** The whole spreadsheet as CSV text, with the column names first. */
export function itemsCsv(items: Item[], look: SheetLookups): string {
  const rows = [[...SHEET_COLUMNS], ...itemsSheet(items, look)];
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** A file name for the job's spreadsheet: "Fish Items 2026-11-05.csv". */
export function sheetFileName(jobName: string, today: string): string {
  const clean = jobName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Job';
  return `${clean} Items ${today}.csv`;
}

// ---------- items from someone else's spreadsheet ----------

/**
 * The rows of a table: copied from a spreadsheet (tab separated) or saved as CSV, quotes and all.
 * Blank lines are left out.
 */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const tab = clean.includes('\t');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === (tab ? '\t' : ',')) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/** Whether pasted text is a table: two rows or more, and most of them with two cells or more. */
export function isTable(rows: string[][]): boolean {
  return rows.length >= 2 && rows.filter((r) => r.filter((c) => c !== '').length >= 2).length >= Math.ceil(rows.length * 0.6);
}

/** Which column holds what, counted from 0; header: the first row names the columns. */
export interface ColumnMap {
  title: number | null;
  description: number | null;
  location: number | null;
  assignedTo: number | null;
  waitingOn: number | null;
  /** Says when a row is done already: those are left out. */
  done: number | null;
  header: boolean;
}

const HEADS: [keyof Omit<ColumnMap, 'header'>, RegExp][] = [
  ['title', /^(title|item|items|task|tasks|issue|deficiency|work|punch( list)? item|what)$/i],
  ['description', /^(description|details?|notes?|comments?|where exactly)$/i],
  ['location', /^(location|room|area|space|level and room|where)$/i],
  ['assignedTo', /^(assigned to|assigned|company|sub|subcontractor|trade partner|vendor|responsible|who|trade)$/i],
  ['waitingOn', /^(waiting on|waiting for|blocked by|depends on|holdup)$/i],
  ['done', /^(status|done|complete|completed|closed)$/i],
];

/** The columns, from the names in the first row; null for any it does not know. */
export function guessColumns(rows: string[][]): ColumnMap {
  const map: ColumnMap = { title: null, description: null, location: null, assignedTo: null, waitingOn: null, done: null, header: false };
  const first = rows[0] ?? [];
  first.forEach((name, i) => {
    const said = name.replace(/[#:*]/g, '').trim();
    for (const [field, re] of HEADS) {
      if (map[field] === null && re.test(said)) {
        map[field] = i;
        map.header = true;
        return;
      }
    }
  });
  return map;
}

const DONE = /^(done|complete|completed|closed|yes|x|✓|✔)$/i;

/**
 * The rows as items to check, in the shape Claude gives what it heard: each row with a title, and
 * not marked done.
 */
export function tableItems(rows: string[][], map: ColumnMap): { title: string; description: string; location: string | null; assignedTo: string | null; waitingOn: string | null }[] {
  if (map.title === null) return [];
  const cell = (r: string[], i: number | null) => (i === null ? '' : (r[i] ?? '').replace(/\s+/g, ' ').trim());
  return rows
    .slice(map.header ? 1 : 0)
    .filter((r) => cell(r, map.title) !== '' && !DONE.test(cell(r, map.done)))
    .map((r) => ({
      title: cell(r, map.title).slice(0, 80),
      description: cell(r, map.description).slice(0, 300),
      location: cell(r, map.location) || null,
      assignedTo: cell(r, map.assignedTo) || null,
      waitingOn: cell(r, map.waitingOn) || null,
    }));
}
