// The same work written twice, caught as an item is written. The same title in the same location
// is caught at once. A close match (the same thing said another way, like "Towel bar loose" and
// "Tighten towel bar") is caught with no signal too, and Claude then says whether it really is the
// same work, looking at the photos when every one has one. Each answer is kept, so the same
// question is never asked twice.

import { closeMatches, duplicatesOf, readSameItem, type Item, type Photo } from '@punch/core';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { askClaude, claudePhotoRoom, useClaudeReady } from '@/ai/claude';
import { useData } from '@/data/api';

export interface SameWork {
  twin: Item;
  /** same-title: the same words; claude: Claude says it is the same work; maybe: close, with no Claude to ask. */
  how: 'same-title' | 'claude' | 'maybe';
}

/** Close enough to say maybe, with no Claude to ask. */
const MAYBE = 0.85;
/** A moment after the typing stops, so Claude is asked about what was meant. */
const SETTLE_MS = 700;

/** Claude's answers, by question: the item it is the same as, or null. */
const answers = new Map<string, string | null>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function answer(question: string, id: string | null) {
  answers.set(question, id);
  for (const l of listeners) l();
}

export function useSameWork(input: {
  jobId: string;
  /** The item being looked at, so it is not its own duplicate. */
  itemId?: string;
  title: string;
  description: string;
  locationId: string;
  /** Still typing the title: nothing is said until it is done. */
  typing: boolean;
  /** Whether to ask Claude about close matches: for a new item or a draft, not every item opened. */
  ask: boolean;
  /** The new item's photo, to show Claude with the others' photos. */
  photoUri?: string | null;
}): SameWork | null {
  const data = useData();
  const items = data.useItems(input.jobId);
  const photos = data.usePhotos(input.jobId);
  const locations = data.useLocations(input.jobId);
  const ready = useClaudeReady();
  const title = input.title.trim();

  const exact = useMemo(() => {
    if (input.typing || !title) return null;
    const twins = duplicatesOf(title, input.locationId, items, input.itemId);
    return twins.find((t) => !t.unfinished) ?? twins[0] ?? null;
  }, [input.typing, title, input.locationId, items, input.itemId]);

  const close = useMemo(
    () => (input.typing || !title || exact ? [] : closeMatches({ id: input.itemId, title, description: input.description, locationId: input.locationId }, items)),
    [input.typing, title, exact, input.itemId, input.description, input.locationId, items],
  );

  const firstPhoto = useMemo(() => {
    const out = new Map<string, Photo>();
    for (const p of [...photos].sort((a, b) => a.sortOrder - b.sortOrder)) if (!p.removed && !out.has(p.itemId)) out.set(p.itemId, p);
    return out;
  }, [photos]);

  const question = close.length > 0 ? JSON.stringify([title.toLowerCase(), input.description.trim().toLowerCase(), input.locationId, close.map((c) => `${c.item.id}:${c.item.title}`)]) : null;
  const known = useSyncExternalStore(subscribe, () => (question && answers.has(question) ? answers.get(question)! : undefined), () => undefined);
  const location = locations.find((l) => l.id === input.locationId)?.label ?? '';

  useEffect(() => {
    if (!question || !input.ask || !ready || answers.has(question)) return;
    const timer = setTimeout(() => {
      const candidates = close.map((c) => ({ n: c.item.number ?? 0, title: c.item.title, description: c.item.description, location }));
      // The photos go when every one of them has one and they all fit; otherwise the words alone.
      const theirs = close.map((c) => firstPhoto.get(c.item.id)?.uri ?? null);
      const withPhotos = !!input.photoUri && theirs.every((u) => u !== null) && theirs.length + 1 <= Math.min(6, claudePhotoRoom());
      askClaude(
        'same-item',
        { item: { title, description: input.description, location }, candidates, photos: withPhotos },
        withPhotos ? [input.photoUri!, ...(theirs as string[])] : [],
        512,
      )
        .then((raw) => {
          const n = readSameItem(raw, candidates.map((c) => c.n));
          answer(question, close.find((c) => c.item.number === n)?.item.id ?? null);
        })
        .catch(() => {
          // No signal, say: the close match stays a maybe.
        });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [question, input.ask, ready, close, firstPhoto, input.photoUri, input.description, location, title]);

  if (exact) return { twin: exact, how: 'same-title' };
  if (!question) return null;
  if (known !== undefined) {
    const twin = known ? items.find((i) => i.id === known && i.status === 'open') : undefined;
    return twin ? { twin, how: 'claude' } : null;
  }
  const top = close[0];
  return top && top.score >= MAYBE ? { twin: top.item, how: 'maybe' } : null;
}
