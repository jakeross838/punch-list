// How each job is being looked at right now: the grouping, Show Completed and the filters. A job
// opens the way the person saved as their default; changes last until the app closes. Save as My
// Default keeps the current view for every job.

import { dayOfDate, type FilterContext, type ViewSettings } from '@punch/core';
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

/** What the filters and totals need on a job: today, its visits, which items have a photo, its locations. */
export function useFilterContext(jobId: string): FilterContext {
  const data = useData();
  const visits = data.useVisits(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const today = dayOfDate(new Date());
  return useMemo(() => ({ today, visits, photoItemIds: new Set(photos.map((p) => p.itemId)), locations }), [today, visits, photos, locations]);
}
