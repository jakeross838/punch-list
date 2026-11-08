// A small value kept on the phone between visits: the job you are working in, when you last looked
// at Updates. Kept in the phone's own key value store; a phone that refuses still keeps it for this
// visit. (The preview page keeps it in the browser: kept.web.ts.)

import { Storage as kv } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

interface Storage {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

const storage: Storage = {
  get: (k) => {
    try {
      return kv.getItemSync(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      kv.setItemSync(k, v);
    } catch {
      // Kept for this visit.
    }
  },
};

export interface Kept {
  get(): string | null;
  set(value: string): void;
  /** The value, kept up to date on screen. Named like a hook, so React's compiler calls it on every render. */
  useValue(): string | null;
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
    useValue: () => useSyncExternalStore(subscribe, get, get),
  };
}
