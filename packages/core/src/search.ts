// Search everything: what was typed, found across every job you see, in items (their title, number,
// details, location, who does them, and the words Claude wrote about their photos), locations,
// companies, people, comments and jobs. Every word typed has to start a word somewhere in what is
// found; the closer to the title, the higher it comes. Open work comes before finished work.

import type { Comment, Company, Item, Job, Location, Person } from './types';

export type FoundKind = 'item' | 'job' | 'location' | 'company' | 'person' | 'comment';

export interface Found {
  kind: FoundKind;
  id: string;
  /** The job it is on, for items, locations and comments. */
  jobId: string | null;
  /** The item a comment is on. */
  itemId: string | null;
  title: string;
  /** Where and whose, in a few words: "Kitchen 109 · SMS Carpentry · Fish Residence". */
  detail: string;
  /** Lower comes first. */
  rank: number;
  /** Finished, removed, closed or switched off: shown after the rest. */
  done: boolean;
}

export interface SearchSources {
  jobs: Job[];
  items: Item[];
  locations: Location[];
  companies: Company[];
  people: Person[];
  comments: Comment[];
  /** The words Claude wrote about each item's photos, by item. */
  photoWords?: Map<string, string>;
}

/** Lowercase words, punctuation left out, "#12" kept as 12. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * How well what was typed fits a piece of text: 0 when the text starts with it, 1 when each word
 * typed starts a word in it, null when one does not.
 */
export function wordRank(typed: string[], text: string): number | null {
  if (typed.length === 0) return null;
  const words = searchWords(text);
  if (!typed.every((t) => words.some((w) => w.startsWith(t)))) return null;
  return words.slice(0, typed.length).every((w, k) => w.startsWith(typed[k]!)) ? 0 : 1;
}

/** The fields of a thing, best first: each word typed must start a word in one of them. */
function rankIn(typed: string[], fields: (string | null | undefined)[]): number | null {
  const shown = fields.map((f) => f ?? '');
  // All in one field: that field's place, and how well it fits there.
  let best: number | null = null;
  shown.forEach((f, k) => {
    const r = wordRank(typed, f);
    if (r !== null && (best === null || k * 2 + r < best)) best = k * 2 + r;
  });
  if (best !== null) return best;
  // Across fields ("kitchen cabinet": the location and the title): after anything in one field.
  const all = searchWords(shown.join(' '));
  return typed.every((t) => all.some((w) => w.startsWith(t))) ? shown.length * 2 + 1 : null;
}

const MOST = { item: 60, other: 20 };

export function searchAll(query: string, s: SearchSources): Found[] {
  const typed = searchWords(query);
  if (typed.length === 0) return [];
  const jobName = new Map(s.jobs.map((j) => [j.id, j.name]));
  const closed = new Set(s.jobs.filter((j) => j.closed).map((j) => j.id));
  const place = new Map(s.locations.map((l) => [l.id, l.label]));
  const company = new Map(s.companies.map((c) => [c.id, c.name]));
  const person = new Map(s.people.map((p) => [p.id, p.name]));
  const seen = new Set(s.jobs.map((j) => j.id));
  const itemOf = new Map(s.items.map((i) => [i.id, i]));
  const out: Found[] = [];
  const add = (f: Omit<Found, 'rank'>, rank: number | null) => {
    if (rank !== null) out.push({ ...f, rank });
  };

  for (const j of s.jobs) {
    add({ kind: 'job', id: j.id, jobId: j.id, itemId: null, title: j.name, detail: j.address, done: j.closed }, rankIn(typed, [j.name, j.address]));
  }
  for (const i of s.items) {
    if (i.status === 'removed' || !seen.has(i.jobId)) continue;
    const who = i.companyId ? company.get(i.companyId) : i.assignedTo ? person.get(i.assignedTo) : undefined;
    const title = i.title.trim() || i.description.trim() || 'No title yet';
    // The number typed alone, "12" or "#12", is that item.
    const byNumber = typed.length === 1 && i.number !== null && typed[0] === String(i.number) ? 0 : null;
    const rank = byNumber ?? rankIn(typed, [i.title, place.get(i.locationId) ?? '', who ?? '', i.description, s.photoWords?.get(i.id) ?? '']);
    add(
      {
        kind: 'item',
        id: i.id,
        jobId: i.jobId,
        itemId: i.id,
        title,
        detail: [i.number !== null ? `Item ${i.number}` : null, place.get(i.locationId), who, jobName.get(i.jobId)].filter(Boolean).join(' · '),
        done: i.status === 'complete' || closed.has(i.jobId),
      },
      rank,
    );
  }
  for (const l of s.locations) {
    if (!l.active || !seen.has(l.jobId)) continue;
    add({ kind: 'location', id: l.id, jobId: l.jobId, itemId: null, title: l.label, detail: [l.floor, jobName.get(l.jobId)].filter(Boolean).join(' · '), done: closed.has(l.jobId) }, rankIn(typed, [l.label, l.floor]));
  }
  for (const c of s.companies) {
    add({ kind: 'company', id: c.id, jobId: null, itemId: null, title: c.name, detail: [c.phone, c.email].filter(Boolean).join(' · '), done: !c.active }, rankIn(typed, [c.name, c.email]));
  }
  for (const p of s.people) {
    add({ kind: 'person', id: p.id, jobId: null, itemId: null, title: p.name || p.email, detail: [p.email, p.phone].filter(Boolean).join(' · '), done: !p.active }, rankIn(typed, [p.name, p.email]));
  }
  for (const c of s.comments) {
    if (c.removed || !seen.has(c.jobId)) continue;
    const on = c.itemId ? itemOf.get(c.itemId) : undefined;
    const by = c.fromCompany ? (c.authorName ?? (c.companyId ? company.get(c.companyId) : undefined)) : person.get(c.personId ?? '');
    add(
      {
        kind: 'comment',
        id: c.id,
        jobId: c.jobId,
        itemId: c.itemId,
        title: c.body.replace(/\s+/g, ' ').trim(),
        detail: [by, on ? on.title || 'An item' : c.companyId ? `${company.get(c.companyId) ?? 'A company'} list` : null, jobName.get(c.jobId)].filter(Boolean).join(' · '),
        done: closed.has(c.jobId),
      },
      // A comment ranks after a title: it is found by what it says.
      ((r) => (r === null ? null : r + 2))(rankIn(typed, [c.body])),
    );
  }

  const ordered = out.sort((a, b) => Number(a.done) - Number(b.done) || a.rank - b.rank || a.title.localeCompare(b.title));
  const counts = new Map<FoundKind, number>();
  return ordered.filter((f) => {
    const n = (counts.get(f.kind) ?? 0) + 1;
    counts.set(f.kind, n);
    return n <= (f.kind === 'item' ? MOST.item : MOST.other);
  });
}

/** What each kind is called over its results. */
export const FOUND_HEADINGS: Record<FoundKind, string> = { item: 'Items', job: 'Jobs', location: 'Locations', company: 'Companies', person: 'People', comment: 'Comments' };
