// The owner of the house: what waits on them, and the week as they see it, for Claude to write
// their weekly update from. Like the owner's page, it names trades, never companies or prices.

import type { OwnerUpdateInput } from './claude';
import { addDays, dayOfDate, visitStart } from './dates';
import type { Item, JobCompany, Location, Trade, Visit } from './types';

/** The words for the owner on an item's Waiting On list. */
const OWNER_WORDS = new Set(['owner', 'the owner', 'owners', 'homeowner', 'client']);

/** Whether an item waits on the owner: Owner is one of what it waits on. */
export function waitsOnOwner(waitingOn: readonly string[]): boolean {
  return waitingOn.some((w) => OWNER_WORDS.has(w.trim().toLowerCase()));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Tuesday, November 10". */
function dayWords(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export interface OwnerWeekSource {
  job: { name: string };
  builder: string;
  from: string;
  owner: string | null;
  items: Item[];
  locations: Location[];
  visits: Visit[];
  jobCompanies: JobCompany[];
  trades: Trade[];
  companies: { id: string; defaultTradeId: string | null }[];
  now: Date;
}

/** The week on the job as the owner sees it: what Claude writes their update from. */
export function ownerWeek(s: OwnerWeekSource): OwnerUpdateInput {
  const today = dayOfDate(s.now);
  const weekAgo = s.now.getTime() - 7 * 86_400_000;
  const label = new Map(s.locations.map((l) => [l.id, l.label]));
  const where = (i: Item) => label.get(i.locationId) ?? '';
  const onList = s.items.filter((i) => !i.unfinished && i.status !== 'removed');
  const done = onList
    .filter((i) => i.status === 'complete' && i.completedAt && Date.parse(i.completedAt) >= weekAgo)
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
    .map((i) => ({ title: i.title, location: where(i) }));
  const open = onList.filter((i) => i.status === 'open');
  const counts = new Map<string, number>();
  for (const i of open) if (where(i)) counts.set(where(i), (counts.get(where(i)) ?? 0) + 1);
  const openBy = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([location, n]) => ({ location, open: n }));
  const waiting = open.filter((i) => waitsOnOwner(i.waitingOn)).map((i) => ({ title: i.title, location: where(i) }));
  // What the owner sent: this week's, and anything still waiting for the team.
  const sent = s.items
    .filter((i) => i.source === 'owner' && i.status !== 'removed' && (Date.parse(i.createdAt) >= weekAgo || i.unfinished))
    .map((i) => ({ words: i.description.trim() || i.title, status: i.status === 'complete' ? ('done' as const) : i.unfinished ? ('received' as const) : ('on_list' as const) }))
    .filter((x) => x.words);
  // Who is coming in the next seven days, by the trade they do here.
  const tradeName = new Map(s.trades.map((t) => [t.id, t.name]));
  const tradeOf = (companyId: string) => {
    const here = s.jobCompanies.find((jc) => jc.companyId === companyId);
    const id = here?.tradeId ?? s.companies.find((c) => c.id === companyId)?.defaultTradeId ?? null;
    return id ? (tradeName.get(id) ?? '') : '';
  };
  const until = addDays(today, 7);
  const coming = s.visits
    .filter((v) => !v.removed)
    .map((v) => ({ day: visitStart(v), trade: tradeOf(v.companyId) }))
    .filter((v) => v.day >= today && v.day <= until && v.trade)
    .sort((a, b) => a.day.localeCompare(b.day) || a.trade.localeCompare(b.trade))
    .filter((v, k, all) => all.findIndex((x) => x.day === v.day && x.trade === v.trade) === k)
    .map((v) => ({ day: dayWords(v.day), trade: v.trade }));
  return { job: s.job.name, builder: s.builder, from: s.from, owner: s.owner ?? '', done, open: open.length, openBy, waiting, sent, coming };
}
