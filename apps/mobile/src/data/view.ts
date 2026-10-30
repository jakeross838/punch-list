// How each job is being looked at right now: the grouping and the filters. A job opens the way the
// person saved as their default; changes last until the app closes. Save as My Default keeps the
// current view for every job.

import { useCallback, useSyncExternalStore } from 'react';
import type { ViewSettings } from '@punch/core';

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

export function sameView(a: ViewSettings, b: ViewSettings): boolean {
  return a.groupBy === b.groupBy && a.filter === b.filter && a.showCompleted === b.showCompleted && a.tradeId === b.tradeId && a.companyId === b.companyId;
}
