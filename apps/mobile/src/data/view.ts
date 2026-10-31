// How each job is being looked at right now: the grouping, Show Completed and the filters. A job
// opens the way the person saved as their default; changes last until the app closes. Save as My
// Default keeps the current view for every job.

import { buildTimeline, dayOfDate, holdLookups, type FilterContext, type HoldLookups, type Timeline, type ViewSettings } from '@punch/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useData } from './api';

export { sameView } from '@punch/core';

const views = new Map<string, ViewSettings>();
const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useJobView(jobId: string, saved: ViewSettings): [ViewSettings, (next: ViewSettings) => void] {
  const view = useSyncExternalStore(subscribe, () => views.get(jobId) ?? saved, () => views.get(jobId) ?? saved);
  const setView = useCallback(
    (next: ViewSettings) => {
      views.set(jobId, next);
      for (const l of listeners) l();
    },
    [jobId],
  );
  return [view, setView];
}

/**
 * What items on a job wait on, looked up once: the tasks (with who is doing them, where, and their
 * visits) and today, for the lines that say "Waiting on Install range backsplash (Volcano Stone)".
 */
export function useHolds(jobId: string): HoldLookups {
  const data = useData();
  const items = data.useItems(jobId);
  const companies = data.useCompanies();
  const locations = data.useLocations(jobId);
  const visits = data.useVisits(jobId);
  const today = dayOfDate(new Date());
  return useMemo(() => holdLookups({ items, companies, locations, visits, today }), [items, companies, locations, visits, today]);
}

/** What the filters and totals need on a job: today, its visits, which items have a photo, its locations, what items wait on. */
export function useFilterContext(jobId: string): FilterContext {
  const data = useData();
  const visits = data.useVisits(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const holds = useHolds(jobId);
  const today = dayOfDate(new Date());
  return useMemo(
    () => ({ today, visits, photoItemIds: new Set(photos.map((p) => p.itemId)), locations, holds }),
    [today, visits, photos, locations, holds],
  );
}

/**
 * The job's schedule as the list is right now. With drafts, the ones Claude has filled in with a
 * company count too, for the finish date on a walk.
 */
export function useTimeline(jobId: string, drafts = false): Timeline {
  const data = useData();
  const items = data.useItems(jobId);
  const visits = data.useVisits(jobId);
  const locations = data.useLocations(jobId);
  const today = dayOfDate(new Date());
  return useMemo(() => buildTimeline(items, visits, locations, today, { drafts }), [items, visits, locations, today, drafts]);
}
