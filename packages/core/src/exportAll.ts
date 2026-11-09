// Export Everything: every job the company has, with its items, comments and photos, as one folder
// to keep. At the top, spreadsheets of the jobs, the companies and the people; then a folder for each
// job with its items and its comments as spreadsheets and its photos, each named for its item. The
// phone writes it into one zip file, a photo at a time; this says what goes in it and where.

import { ROLE_LABELS, SEES_LABELS } from './people';
import { csvCell, itemsSheet, SHEET_COLUMNS, type SheetLookups } from './spreadsheet';
import type { Comment, Company, Item, Job, Location, Person, Photo } from './types';

export interface ExportEntry {
  /** Its place in the zip, folders and all. */
  path: string;
  /** A spreadsheet, as CSV. */
  text?: string;
  /** A photo, read from the phone. */
  photo?: { id: string; uri: string };
}

/** A name that works as a file or folder name on any computer. */
export function fileSafe(name: string, fallback: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  return clean || fallback;
}

const csv = (rows: (string | number | null | undefined)[][]) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
const yes = (v: boolean) => (v ? 'Yes' : 'No');

/** A name not used yet in this folder: "Fish", then "Fish 2". */
function unique(name: string, used: Set<string>): string {
  let out = name;
  for (let n = 2; used.has(out.toLowerCase()); n += 1) out = `${name} ${n}`;
  used.add(out.toLowerCase());
  return out;
}

export function exportEntries(input: {
  company: string;
  /** The day it is made, as 2026-11-09. */
  day: string;
  jobs: Job[];
  items: Item[];
  locations: Location[];
  companies: Company[];
  people: Person[];
  comments: Comment[];
  photos: Photo[];
}): { folder: string; entries: ExportEntry[] } {
  const folder = fileSafe(`${input.company || 'Company'} Export ${input.day}`, `Export ${input.day}`);
  const companyName = new Map(input.companies.map((c) => [c.id, c.name]));
  const personName = new Map(input.people.map((p) => [p.id, p.name || p.email]));
  const look: SheetLookups = {
    locations: new Map(input.locations.map((l) => [l.id, { label: l.label, floor: l.floor }])),
    companies: companyName,
    people: personName,
    items: new Map(input.items.map((i) => [i.id, i])),
  };
  const entries: ExportEntry[] = [];
  const at = (path: string) => `${folder}/${path}`;

  const itemsOf = new Map<string, Item[]>();
  for (const i of input.items) itemsOf.set(i.jobId, [...(itemsOf.get(i.jobId) ?? []), i]);
  const photosOf = new Map<string, Photo[]>();
  for (const p of input.photos) if (!p.removed) photosOf.set(p.itemId, [...(photosOf.get(p.itemId) ?? []), p]);

  const jobs = [...input.jobs].sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));
  entries.push({
    path: at('Jobs.csv'),
    text: csv([
      ['Job', 'Address', 'Status', 'Open Items', 'Completed Items', 'Photos'],
      ...jobs.map((j) => {
        const its = (itemsOf.get(j.id) ?? []).filter((i) => i.status !== 'removed');
        return [
          j.name,
          j.address,
          j.closed ? 'Closed' : 'Open',
          its.filter((i) => i.status === 'open').length,
          its.filter((i) => i.status === 'complete').length,
          its.reduce((n, i) => n + (photosOf.get(i.id)?.length ?? 0), 0),
        ];
      }),
    ]),
  });
  entries.push({
    path: at('Companies.csv'),
    text: csv([['Company', 'Phone', 'Email', 'Switched On'], ...[...input.companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.name, c.phone, c.email, yes(c.active)])]),
  });
  entries.push({
    path: at('People.csv'),
    text: csv([
      ['Name', 'Email', 'Phone', 'Role', 'Sees', 'Switched On'],
      ...[...input.people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.name, p.email, p.phone, ROLE_LABELS[p.role], p.role === 'admin' ? SEES_LABELS.all : SEES_LABELS[p.sees], yes(p.active)]),
    ]),
  });

  const usedJobs = new Set<string>();
  for (const j of jobs) {
    const jobFolder = unique(fileSafe(j.name, 'Job'), usedJobs);
    const items = itemsOf.get(j.id) ?? [];
    const removed = items.filter((i) => i.status === 'removed');
    // Every item, removed ones last, with the same columns as a job's spreadsheet.
    entries.push({
      path: at(`${jobFolder}/Items.csv`),
      text: csv([
        [...SHEET_COLUMNS],
        ...itemsSheet(items, look),
        ...itemsSheet(
          removed.map((i) => ({ ...i, status: 'open' as const })),
          look,
        ).map((row) => row.map((cell, k) => (SHEET_COLUMNS[k] === 'Status' ? 'Removed' : cell))),
      ]),
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const said = input.comments.filter((c) => c.jobId === j.id && !c.removed).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    entries.push({
      path: at(`${jobFolder}/Comments.csv`),
      text: csv([
        ['Item Number', 'Item', 'Company', 'Who', 'When', 'Comment', 'Internal'],
        ...said.map((c) => {
          const item = c.itemId ? byId.get(c.itemId) : undefined;
          const who = c.fromCompany ? (c.authorName ?? (c.companyId ? companyName.get(c.companyId) : '') ?? '') : (personName.get(c.personId ?? '') ?? '');
          return [item?.number ?? '', item ? item.title || item.description : 'The whole list', c.companyId ? (companyName.get(c.companyId) ?? '') : '', who, c.createdAt.slice(0, 16).replace('T', ' '), c.body, yes(c.internal)];
        }),
      ]),
    });
    const usedPhotos = new Set<string>();
    for (const i of [...items].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9))) {
      const shots = [...(photosOf.get(i.id) ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
      shots.forEach((p, k) => {
        if (!p.uri) return;
        const base = fileSafe(`${i.number ?? ''} ${i.title || i.description || 'Draft'}`, 'Item');
        const name = unique(`${base}${shots.length > 1 ? ` ${k + 1}` : ''}${p.done ? ' Done' : ''}`, usedPhotos);
        entries.push({ path: at(`${jobFolder}/Photos/${name}.jpg`), photo: { id: p.id, uri: p.uri } });
      });
    }
  }
  return { folder, entries };
}
