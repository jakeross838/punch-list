// Claude says what is in each photo in a few words, once, so Search finds an item by what its photos
// show ("water stain", "outlet cover"). It works in the background while a job is open, one photo at
// a time, the newest first, on the phone only, and stops for the rest of the visit when the month's
// allowance is used or there is no signal.

import { readPhotoWords } from '@punch/core';
import { useEffect } from 'react';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { ClaudeError } from '@/ai/claudeErrors';
import { useData } from '@/data/api';

/** The photos asked about on this visit, so none is asked twice. */
const tried = new Set<string>();
/** At most this many photos are asked about on one visit to the app. */
const MOST_PER_VISIT = 40;
let stopped = false;

export function usePhotoWords(jobId: string): void {
  const data = useData();
  const ready = useClaudeReady(true);
  const photos = data.usePhotos(jobId);
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const live = data.mode === 'live';

  useEffect(() => {
    if (!live || !ready || stopped || tried.size >= MOST_PER_VISIT) return;
    const next = photos
      .filter((p) => !p.description && !tried.has(p.id) && p.uri)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!next) return;
    tried.add(next.id);
    const item = items.find((i) => i.id === next.itemId);
    const location = locations.find((l) => l.id === item?.locationId)?.label ?? '';
    void askClaude('describe-photo', { title: item?.title ?? '', location }, [next.uri], 768)
      .then((raw) => {
        const words = readPhotoWords(raw);
        return words ? data.setPhotoWords(next.id, words) : undefined;
      })
      .catch((e: unknown) => {
        // Out of allowance, signed out, no signal or not set up: no more asking on this visit.
        if (e instanceof ClaudeError && e.trouble !== 'no_answer') stopped = true;
      });
  }, [live, ready, photos, items, locations, data]);
}
