// A record of each list that went out, so the next one can mark what is new since the last.

import type { ListSend } from './types';

export const LIST_KEYS = {
  job: 'job',
  company: (companyId: string) => `company:${companyId}`,
  party: (name: string) => `party:${name.trim().toLowerCase()}`,
};

/** The last time this list went out, or nothing. */
export function lastSend(sends: ListSend[], list: string): ListSend | undefined {
  return sends.filter((s) => !s.removed && s.list === list).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
}

/** The items that were not on the list last time. The first list marks nothing new. */
export function newSince(itemIds: string[], last: ListSend | undefined): Set<string> {
  if (!last) return new Set();
  const before = new Set(last.itemIds);
  return new Set(itemIds.filter((id) => !before.has(id)));
}
