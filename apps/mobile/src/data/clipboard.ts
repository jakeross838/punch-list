// Copied items, held until they are pasted: the items as they were when copied, and the job they
// came from. Kept in memory: it lasts while moving between screens and jobs, not past closing the app.

import type { Item } from '@punch/core';
import { useSyncExternalStore } from 'react';

export interface Copied {
  jobId: string;
  items: Item[];
}

let copied: Copied | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clipboard = {
  get: (): Copied | null => copied,
  set(next: Copied | null): void {
    copied = next && next.items.length > 0 ? next : null;
    for (const l of listeners) l();
  },
  clear(): void {
    clipboard.set(null);
  },
};

export function useClipboard(): Copied | null {
  return useSyncExternalStore(subscribe, () => copied, () => copied);
}

/** "1 item", "3 items" */
export const itemsWord = (n: number) => (n === 1 ? '1 item' : `${n} items`);
