// A job's items as a spreadsheet, for Excel, Numbers or Google Sheets: one row per item with its
// number, title, location, company, type, status and the rest, in the same words the app uses. It
// is written as CSV, which every spreadsheet opens. A cell that starts like a formula is kept as
// text, so nothing in a title can run in someone's spreadsheet.

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
  'Company',
  'Type',
  'Status',
  'Ready',
  'Waiting On',
  'Priority',
  'Assigned To',
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
      i.companyId ? (look.companies.get(i.companyId) ?? '') : '',
      kindText(i),
      sheetStatus(i),
      i.ready ? 'Yes' : 'No',
      i.ready ? '' : waitingOnText([...tasks, ...i.waitingOn]),
      i.priority ? 'Yes' : '',
      i.assignedTo ? (look.people.get(i.assignedTo) ?? '') : '',
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
