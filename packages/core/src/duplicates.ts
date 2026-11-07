// The same work written twice. Items in one location that share the words that name the thing
// ("Towel bar loose" and "Install towel bar") are close matches. This finds them at once, with no
// signal, and Claude then says whether a close match is really the same work, looking at the
// photos when it needs to. The same kind of work in another location is not the same work.

import { waitingOnIt } from './holds';
import type { Item } from './types';

/** Words that say what to do or how much, not what the thing is: two items share their thing, not these. */
const LOOSE = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'off', 'on', 'or', 'the', 'to', 'up', 'with', 'needs', 'need', 'needed',
  'fix', 'repair', 'replace', 'install', 'adjust', 'check', 'finish', 'complete', 'add', 'remove', 'redo', 'reset', 'tighten', 'secure', 'clean', 'touch',
  'missing', 'loose', 'broken', 'damaged', 'bad', 'new', 'more', 'all', 'one', 'two', 'left', 'right', 'top', 'bottom', 'side', 'area', 'spot', 'spots',
]);

/** A word without its ending, so "bars" is "bar" and "painting" is "paint". */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** The words that name the thing, from a title (and a description, for a little more). */
export function thingWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !LOOSE.has(w) && !/^\d+$/.test(w))
      .map(stem),
  );
}

/** How much two items' things overlap, from 0 to 1: the shared words over the fewer of the two. */
export function likeness(a: Pick<Item, 'title' | 'description'>, b: Pick<Item, 'title' | 'description'>): number {
  const ta = thingWords(a.title);
  const tb = thingWords(b.title);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  const titles = shared / Math.min(ta.size, tb.size);
  // A word in one's details that names the other's thing counts a little.
  const da = thingWords(`${a.title} ${a.description}`);
  const db = thingWords(`${b.title} ${b.description}`);
  let more = 0;
  for (const w of da) if (db.has(w)) more += 1;
  const details = more / Math.max(1, Math.min(da.size, db.size));
  return Math.min(1, titles * 0.85 + details * 0.15);
}

/** Close enough to ask about. */
export const CLOSE = 0.6;

type Matchable = Pick<Item, 'id' | 'locationId' | 'title' | 'description' | 'status' | 'unfinished'>;

/**
 * The open items in the same location that may be the same work as this one, closest first. A
 * draft with no title yet matches nothing.
 */
export function closeMatches<T extends Matchable>(item: Pick<Item, 'locationId' | 'title' | 'description'> & { id?: string }, items: T[], most = 5): { item: T; score: number }[] {
  if (!item.locationId || item.title.trim() === '') return [];
  return items
    .filter((i) => i.id !== item.id && i.locationId === item.locationId && i.status === 'open' && i.title.trim() !== '')
    .map((i) => ({ item: i, score: likeness(item, i) }))
    .filter((m) => m.score >= CLOSE)
    .sort((a, b) => b.score - a.score)
    .slice(0, most);
}

/**
 * Every pair of open items in one location that may be the same work, for Find Duplicates: the
 * closest first, each pair once. Pairs already said to be different are left out.
 */
export function closePairs<T extends Matchable>(items: T[], apart: Set<string> = new Set()): { a: T; b: T; score: number }[] {
  const open = items.filter((i) => i.status === 'open' && i.title.trim() !== '' && i.locationId);
  const byLocation = new Map<string, T[]>();
  for (const i of open) byLocation.set(i.locationId, [...(byLocation.get(i.locationId) ?? []), i]);
  const pairs: { a: T; b: T; score: number }[] = [];
  for (const list of byLocation.values()) {
    for (let x = 0; x < list.length; x += 1) {
      for (let y = x + 1; y < list.length; y += 1) {
        const a = list[x]!;
        const b = list[y]!;
        if (apart.has(pairKey(a.id, b.id))) continue;
        const score = likeness(a, b);
        if (score >= CLOSE) pairs.push({ a, b, score });
      }
    }
  }
  return pairs.sort((p, q) => q.score - p.score);
}

/** One key for a pair, whichever comes first. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Which of two duplicates to keep: the one already on a list (not a draft), then the one with the
 * most done to it (assigned, described), then the older.
 */
export function keeperOf<T extends Matchable & Pick<Item, 'companyId' | 'assignedTo' | 'number' | 'createdAt'>>(a: T, b: T): [keep: T, merge: T] {
  const weight = (i: T) => (i.unfinished ? 0 : 4) + (i.companyId || i.assignedTo ? 2 : 0) + (i.description.trim() ? 1 : 0);
  if (weight(a) !== weight(b)) return weight(a) > weight(b) ? [a, b] : [b, a];
  return a.createdAt <= b.createdAt ? [a, b] : [b, a];
}

/**
 * Merging: what waited on the merged item waits on the one kept instead, when the kept one is open
 * and that would not leave anything waiting on itself. Answers the new waits, by item; removing the
 * merged item frees the rest (the kept one included) the usual way.
 */
export function mergedWaits(keepId: string, mergeId: string, items: Item[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const keep = items.find((i) => i.id === keepId);
  if (!keep || keep.status !== 'open') return out;
  for (const i of items) {
    if (i.id === keepId || i.status !== 'open' || !i.waitingOnItems.includes(mergeId)) continue;
    if (waitingOnIt(i.id, items).has(keepId)) continue;
    out.set(i.id, [...new Set(i.waitingOnItems.map((w) => (w === mergeId ? keepId : w)))]);
  }
  return out;
}
