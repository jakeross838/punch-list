// Preview page: a small value kept in the browser between visits: the job you are working in, when
// you last looked at Updates. A private window can refuse; it is still kept for this visit.

import { useSyncExternalStore } from 'react';

interface Storage {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

const storage: Storage = {
  get: (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      // A private window can refuse.
    }
  },
};

export interface Kept {
  get(): string | null;
  set(value: string): void;
  use(): string | null;
}

export function kept(key: string): Kept {
  let value: string | null = null;
  let loaded = false;
  const listeners = new Set<() => void>();
  const get = () => {
    if (!loaded) {
      loaded = true;
      value = storage.get(key);
    }
    return value;
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  return {
    get,
    set(next) {
      get();
      if (value === next) return;
      value = next;
      storage.set(key, next);
      for (const l of listeners) l();
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}
