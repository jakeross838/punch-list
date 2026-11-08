// Today, across every job you are on: what a company says it finished and waits for your team to
// check, what is assigned to you, which companies are on site today and with what work, and how
// much is ready. The day's walk puts that work in walking order, location by location, the same
// order as the job's walk.

import { dayOfDate, visitDays } from './dates';
import { inWalkOrder } from './rooms';
import type { Company, Item, Job, Location, Visit } from './types';

export interface TodayStop {
  /** Null for work saved without a location yet. */
  location: Location | null;
  items: Item[];
}

export interface TodayJob {
  job: Job;
  /** Marked done from a company's page, for your team to check. */
  toCheck: Item[];
  /** Assigned to you, open. */
  mine: Item[];
  /** The companies on site today, with their open work on today's visit. */
  onSite: { companyId: string; name: string; items: Item[] }[];
  /** Open work ready to do, on the whole job. */
  ready: number;
  /** All of it, location by location in walking order, each item once. */
  walk: TodayStop[];
}

export interface TodaySources {
  meId: string | null;
  jobs: Job[];
  items: Item[];
  locations: Location[];
  visits: Visit[];
  companies: Company[];
  /** The jobs to show: the ones you are on, or every job when you are on none. */
  jobIds?: Set<string>;
  now: Date;
}

/** Each open job with something for today, in the order of the jobs given. */
export function todayPlan(s: TodaySources): TodayJob[] {
  const today = dayOfDate(s.now);
  const name = new Map(s.companies.map((c) => [c.id, c.name]));
  const out: TodayJob[] = [];
  for (const job of s.jobs) {
    if (job.closed || (s.jobIds && !s.jobIds.has(job.id))) continue;
    const open = s.items.filter((i) => i.jobId === job.id && i.status === 'open' && !i.unfinished);
    const toCheck = open.filter((i) => !!i.markedDoneAt);
    const mine = s.meId ? open.filter((i) => i.assignedTo === s.meId && !i.markedDoneAt) : [];
    const here = s.visits.filter((v) => v.jobId === job.id && !v.removed && visitDays(v).includes(today));
    const onSite = [...new Set(here.map((v) => v.companyId))].map((companyId) => {
      const visitIds = new Set(here.filter((v) => v.companyId === companyId).map((v) => v.id));
      return { companyId, name: name.get(companyId) ?? 'A company', items: open.filter((i) => i.visitId !== null && visitIds.has(i.visitId) && !i.markedDoneAt) };
    });
    const ready = open.filter((i) => i.ready).length;
    const todays = new Map<string, Item>();
    for (const i of [...toCheck, ...mine, ...onSite.flatMap((c) => c.items)]) todays.set(i.id, i);
    if (todays.size === 0 && onSite.length === 0) continue;
    const places = inWalkOrder(s.locations.filter((l) => l.jobId === job.id && l.active));
    const walk: TodayStop[] = places
      .map((location) => ({ location, items: [...todays.values()].filter((i) => i.locationId === location.id).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9)) }))
      .filter((stop) => stop.items.length > 0);
    const placed = new Set(places.map((l) => l.id));
    const loose = [...todays.values()].filter((i) => !placed.has(i.locationId));
    if (loose.length > 0) walk.push({ location: null, items: loose });
    out.push({ job, toCheck, mine, onSite, ready, walk });
  }
  return out;
}
