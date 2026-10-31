// Drafts fill themselves in. Right after a photo is saved as a draft, and again when Drafts opens
// (for any that could not be done on the walk, with no signal, say), Claude looks at each draft's
// photo, one at a time, and fills in its blanks: the title, where exactly and the company (the
// trade follows the company). A draft stays a draft until someone checks it and taps Next, or Done
// from the camera. A draft someone is typing in is left to them.

import { suggestContext, suggestionPatch, type Company, type Item, type JobCompany, type Location, type Mark, type StandardTitle, type Trade } from '@punch/core';
import { useSyncExternalStore } from 'react';
import { suggestFromPhoto } from '@/ai/suggest';
import type { DataApi } from '@/data/api';

/** What the job knows, for the photo reader. */
export interface FillJob {
  data: DataApi;
  titles: StandardTitle[];
  trades: Trade[];
  companies: Company[];
  jobCompanies: JobCompany[];
  locations: Location[];
}

/** One draft as it was when it was queued, with its first photo. */
export interface FillTask {
  item: Pick<Item, 'id' | 'locationId' | 'title' | 'description' | 'companyId' | 'tradeId' | 'unfinished' | 'hours'>;
  photo: { uri: string; marks: Mark[] };
}

export interface FillState {
  /** The draft being read now. */
  running: string | null;
  /** The drafts waiting their turn. */
  queued: string[];
}

let state: FillState = { running: null, queued: [] };
let queue: { task: FillTask; job: FillJob }[] = [];
const listeners = new Set<() => void>();
/** Filled in, or answered with nothing: not asked again. */
const tried = new Set<string>();
/** Typed in by someone: its answer is not used. */
const touched = new Set<string>();
/** Claude is not allowed here, so nothing more is asked. */
let stopped = false;

function publish(next: FillState) {
  state = next;
  for (const l of listeners) l();
}

async function run() {
  if (state.running) return;
  const next = queue.shift();
  if (!next) {
    publish({ running: null, queued: [] });
    return;
  }
  const { task, job } = next;
  publish({ running: task.item.id, queued: queue.map((q) => q.task.item.id) });
  try {
    const location = job.locations.find((l) => l.id === task.item.locationId)?.label ?? null;
    const ctx = suggestContext({ location, titles: job.titles, trades: job.trades, companies: job.companies, jobCompanies: job.jobCompanies, marks: task.photo.marks });
    const suggestion = await suggestFromPhoto(task.photo, ctx);
    tried.add(task.item.id);
    if (suggestion && !touched.has(task.item.id)) {
      const patch = suggestionPatch(suggestion, task.item, job.trades, job.companies);
      if (Object.keys(patch).length > 0) await job.data.updateItem(task.item.id, patch);
    }
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'not_granted' || code === 'sampling_disabled') {
      stopped = true;
      queue = [];
    }
    // Anything else (no signal, say) is tried again the next time Drafts opens.
  } finally {
    publish({ running: null, queued: queue.map((q) => q.task.item.id) });
    void run();
  }
}

export const draftFill = {
  /** Queues the drafts that have a photo and nothing typed yet, unless they are done or waiting already. */
  add(tasks: FillTask[], job: FillJob) {
    if (stopped) return;
    for (const task of tasks) {
      const id = task.item.id;
      if (!task.item.unfinished || task.item.title.trim() !== '') continue;
      if (tried.has(id) || touched.has(id) || state.running === id || queue.some((q) => q.task.item.id === id)) continue;
      queue.push({ task, job });
    }
    publish({ ...state, queued: queue.map((q) => q.task.item.id) });
    void run();
  },
  /** Someone is typing in this draft: leave it to them. */
  touch(id: string) {
    if (touched.has(id)) return;
    touched.add(id);
    queue = queue.filter((q) => q.task.item.id !== id);
    publish({ ...state, queued: queue.map((q) => q.task.item.id) });
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useDraftFill(): FillState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Whether this draft is being read now or waiting its turn. */
export const isFilling = (s: FillState, id: string) => s.running === id || s.queued.includes(id);
