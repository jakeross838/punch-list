// Standard wording, offered as a title is written. A title typed with the same words as a standard
// title in another order is that title, offered at once, with no signal. One said another way
// ("towel bar is loose" for "Tighten towel bar") is asked of Claude once the typing stops. Each
// answer is kept, so the same title is never asked about twice.

import { readStandardTitle, standardFor, worthMatching } from '@punch/core';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { useData } from '@/data/api';

/** A moment after the typing stops, so Claude is asked about what was meant. */
const SETTLE_MS = 700;

/** Claude's answers, by what was typed: the standard title it is, or null. */
const answers = new Map<string, string | null>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function answer(key: string, title: string | null) {
  answers.set(key, title);
  for (const l of listeners) l();
}

/** The standard title to offer for what was typed, or null. ask: whether to ask Claude. */
export function useStandardTitle(typed: string, typing: boolean, ask: boolean): string | null {
  const data = useData();
  const titles = data.useTitles();
  const ready = useClaudeReady();
  const title = typed.trim();
  const approved = useMemo(() => titles.filter((t) => t.approved).map((t) => t.title), [titles]);
  const same = useMemo(() => (typing ? null : standardFor(title, titles)), [typing, title, titles]);
  const key = !typing && !same && approved.length > 0 && worthMatching(title, titles) ? title.toLowerCase() : null;
  const known = useSyncExternalStore(subscribe, () => (key && answers.has(key) ? answers.get(key)! : undefined), () => undefined);

  useEffect(() => {
    if (!key || !ask || !ready || answers.has(key)) return;
    const timer = setTimeout(() => {
      askClaude('standard-title', { title, titles: approved })
        .then((raw) => answer(key, readStandardTitle(raw, approved)))
        .catch(() => {
          // No signal, say: nothing is offered.
        });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, ask, ready, title, approved]);

  if (same) return same;
  // Claude's answer, unless it is what is there already.
  return known && known.toLowerCase() !== title.toLowerCase() ? known : null;
}
