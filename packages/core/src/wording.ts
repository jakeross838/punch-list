// Standard wording: the same work reads the same way on every list. A title typed with the same
// words as a standard title, in any order ("towel bar install"), is that standard title; Claude
// catches the ones said another way. Wording typed again and again that is not a standard title yet
// is offered as one in Item Form.

import { thingWords } from './duplicates';
import { tidyTitle } from './titles';
import type { Item, StandardTitle } from './types';

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

const sameWords = (a: string, b: string) => {
  const x = [...new Set(words(a))].sort().join(' ');
  return x !== '' && x === [...new Set(words(b))].sort().join(' ');
};

/**
 * The standard title a typed title already is, with the same words in another order or another
 * case, or null. Exactly the standard title is not a match: there is nothing to change.
 */
export function standardFor(title: string, titles: Pick<StandardTitle, 'title' | 'approved'>[]): string | null {
  const typed = title.trim();
  if (typed === '') return null;
  const hit = titles.find((t) => t.approved && sameWords(t.title, typed));
  return hit && hit.title !== typed ? hit.title : null;
}

/** A typed title worth asking Claude about: not a standard title already, with something to it. */
export function worthMatching(title: string, titles: Pick<StandardTitle, 'title' | 'approved'>[]): boolean {
  const typed = title.trim().toLowerCase();
  if (typed.length < 4 || thingWords(typed).size === 0) return false;
  return !titles.some((t) => t.approved && t.title.toLowerCase() === typed);
}

/**
 * Wording typed on items again and again that is not a standard title yet, most used first: what
 * Item Form offers to add. Removed items do not count.
 */
export function repeatedTitles(
  items: Pick<Item, 'title' | 'tradeId' | 'status'>[],
  titles: Pick<StandardTitle, 'title'>[],
  least = 3,
): { title: string; uses: number; tradeId: string | null }[] {
  const known = new Set(titles.map((t) => t.title.toLowerCase()));
  const counts = new Map<string, { title: string; uses: number; trades: Map<string | null, number> }>();
  for (const i of items) {
    if (i.status === 'removed' || i.title.trim() === '') continue;
    const title = tidyTitle(i.title);
    const key = title.toLowerCase();
    if (known.has(key)) continue;
    const c = counts.get(key) ?? { title, uses: 0, trades: new Map() };
    c.uses += 1;
    c.trades.set(i.tradeId, (c.trades.get(i.tradeId) ?? 0) + 1);
    counts.set(key, c);
  }
  return [...counts.values()]
    .filter((c) => c.uses >= least)
    .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title))
    .map((c) => ({ title: c.title, uses: c.uses, tradeId: [...c.trades.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));
}

/** A title too vague to send a company: a word or two that says to fix something without what. */
export function vagueTitle(title: string): boolean {
  const all = words(title);
  return all.length > 0 && all.length <= 2 && thingWords(title).size === 0;
}
