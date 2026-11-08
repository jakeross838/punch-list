// Starred items, kept at the top of their job, and the items opened last, on this phone. Both are
// kept in the phone's own store, so they come back after the app is closed.

import { useMemo } from 'react';
import { kept } from './kept';

const starred = kept('punch.starred');
const recent = kept('punch.recent');

/** How many opened items are remembered. */
const RECENT_KEPT = 20;

function readIds(text: string | null): string[] {
  try {
    const v: unknown = JSON.parse(text ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export interface Opened {
  itemId: string;
  jobId: string;
}

function readOpened(text: string | null): Opened[] {
  try {
    const v: unknown = JSON.parse(text ?? '[]');
    return Array.isArray(v)
      ? v.flatMap((x) => (x && typeof x === 'object' && typeof (x as Opened).itemId === 'string' && typeof (x as Opened).jobId === 'string' ? [{ itemId: (x as Opened).itemId, jobId: (x as Opened).jobId }] : []))
      : [];
  } catch {
    return [];
  }
}

/** The starred items' ids, newest star first. */
export function useStarred(): string[] {
  const text = starred.useValue();
  return useMemo(() => readIds(text), [text]);
}

export function setStar(itemId: string, on: boolean): void {
  const ids = readIds(starred.get()).filter((id) => id !== itemId);
  starred.set(JSON.stringify(on ? [itemId, ...ids] : ids));
}

/** An item was opened: it goes to the top of Recent. */
export function noteOpened(itemId: string, jobId: string): void {
  const list = readOpened(recent.get()).filter((o) => o.itemId !== itemId);
  recent.set(JSON.stringify([{ itemId, jobId }, ...list].slice(0, RECENT_KEPT)));
}

/** The items opened last, newest first. */
export function useRecent(): Opened[] {
  const text = recent.useValue();
  return useMemo(() => readOpened(text), [text]);
}
