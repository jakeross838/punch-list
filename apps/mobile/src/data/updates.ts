// Updates: what other people did lately on the jobs you see. The bell in the bar shows a dot while
// there is something you have not looked at; opening Updates marks it all seen, on this phone.

import { useMemo } from 'react';
import { useData } from './api';
import { kept } from './kept';

const seen = kept('punch.updatesSeenAt');

/** When you last opened Updates, as an ISO time, or null if you never have. */
export const useUpdatesSeenAt = () => seen.use();

/** Marks everything up to now as seen. */
export function markUpdatesSeen(at = new Date().toISOString()) {
  const was = seen.get();
  if (!was || was < at) seen.set(at);
}

/** How many updates by other people came in since you last looked. */
export function useUnseenUpdates(): number {
  const data = useData();
  const me = data.useMe();
  const updates = data.useUpdates();
  const seenAt = useUpdatesSeenAt();
  return useMemo(() => {
    // Never opened: the last three days count as new.
    const since = seenAt ?? new Date(Date.now() - 3 * 86_400_000).toISOString();
    let n = 0;
    for (const u of updates) {
      if (u.at <= since) break;
      if (u.personId !== me?.id) n += 1;
    }
    return n;
  }, [updates, seenAt, me?.id]);
}
