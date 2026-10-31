// Titles: the standard list makes the same work read the same way everywhere ("Install toilet"),
// and each standard title knows its trade, so picking one fills in the trade and the company, and
// how long the work usually takes, so it fills in the estimated time too.

import type { Item, JobCompany, StandardTitle } from './types';

export interface TitleSuggestion {
  title: string;
  tradeId: string | null;
  /** How long the work usually takes, in hours, when the list or this job says. */
  hours: number | null;
}

/** Proper capitalization for a title: the first letter capital, single spaces, no closing period. */
export function tidyTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Titles that start the way the typing does, or have a word that does: whole-title matches
 * first, then the most used. Titles already used on this job count as uses. Each title once.
 */
export function suggestTitles(query: string, library: StandardTitle[], jobItems: Item[] = [], limit = 5): TitleSuggestion[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q === '') return [];
  const pool = new Map<string, { title: string; tradeId: string | null; uses: number; approved: boolean; hours: number | null }>();
  for (const t of library) {
    const key = t.title.toLowerCase();
    const seen = pool.get(key);
    if (!seen || t.uses > seen.uses) pool.set(key, { title: t.title, tradeId: t.tradeId, uses: t.uses, approved: t.approved, hours: t.hours });
  }
  for (const item of jobItems) {
    if (item.status === 'removed') continue;
    const key = item.title.toLowerCase();
    const seen = pool.get(key);
    if (seen) seen.uses += 1;
    else pool.set(key, { title: item.title, tradeId: item.tradeId, uses: 1, approved: false, hours: null });
  }

  const scored: { s: TitleSuggestion; rank: number; uses: number; approved: boolean }[] = [];
  for (const [key, t] of pool) {
    if (key === q) continue;
    const rank = key.startsWith(q) ? 0 : key.split(' ').some((w, i) => i > 0 && w.startsWith(q)) || key.includes(` ${q}`) ? 1 : -1;
    if (rank < 0) continue;
    scored.push({ s: { title: t.title, tradeId: t.tradeId, hours: t.hours }, rank, uses: t.uses, approved: t.approved });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || Number(b.approved) - Number(a.approved) || b.uses - a.uses || a.s.title.localeCompare(b.s.title))
    .slice(0, limit)
    .map((x) => ({ ...x.s, hours: x.s.hours ?? hoursForTitle(x.s.title, [], jobItems) }));
}

/** The trade for a title, from the standard list. */
export function tradeForTitle(title: string, library: StandardTitle[]): string | null {
  const key = title.trim().toLowerCase();
  const matches = library.filter((t) => t.title.toLowerCase() === key && t.tradeId);
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => b.uses - a.uses)[0]!.tradeId;
}

/**
 * How long the work for a title usually takes: the standard list's time for it, or else the time
 * given most often to the same title on this job. Null when neither says.
 */
export function hoursForTitle(title: string, library: StandardTitle[], jobItems: Item[] = []): number | null {
  const key = title.trim().toLowerCase();
  if (key === '') return null;
  const listed = library.filter((t) => t.title.toLowerCase() === key && t.hours !== null).sort((a, b) => b.uses - a.uses)[0];
  if (listed) return listed.hours;
  const counts = new Map<number, number>();
  for (const i of jobItems) {
    if (i.status === 'removed' || i.hours === null || i.title.trim().toLowerCase() !== key) continue;
    counts.set(i.hours, (counts.get(i.hours) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? best[0] : null;
}

/** The company doing a trade on this job, when exactly one is. */
export function companyForTrade(tradeId: string | null, jobCompanies: JobCompany[]): string | null {
  if (!tradeId) return null;
  const ids = [...new Set(jobCompanies.filter((jc) => jc.tradeId === tradeId).map((jc) => jc.companyId))];
  return ids.length === 1 ? ids[0]! : null;
}

/** The trade a company does on this job, when it does one. */
export function tradeForCompany(companyId: string | null, jobCompanies: JobCompany[]): string | null {
  if (!companyId) return null;
  const ids = [...new Set(jobCompanies.filter((jc) => jc.companyId === companyId).map((jc) => jc.tradeId))];
  return ids.length === 1 ? ids[0]! : null;
}
