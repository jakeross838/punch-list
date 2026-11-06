// A small value kept on the phone between visits: the job you are working in, when you last looked
// at Updates. On the preview page it is kept in the browser. A phone or browser that refuses still
// keeps it for this visit.

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

interface Storage {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

let backing: Storage | null = null;

function storage(): Storage {
  if (backing) return backing;
  if (Platform.OS === 'web') {
    backing = {
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
    return backing;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Storage: kv } = require('expo-sqlite/kv-store') as typeof import('expo-sqlite/kv-store');
  backing = {
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
  return backing;
}

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
      value = storage().get(key);
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
      storage().set(key, next);
      for (const l of listeners) l();
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}
