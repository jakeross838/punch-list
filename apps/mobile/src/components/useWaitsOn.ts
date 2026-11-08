// What a new item waits on, offered as it is written: Claude looks at the other open items in the
// same location and says which have to be done first (the tile floor before the toilet is set).
// Asked once the typing stops, for a new item or a draft; each answer is kept, so the same question
// is never asked twice.

import { itemNumberLabel, readWaitsOn, type Item } from '@punch/core';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { useData } from '@/data/api';

/** A moment after the typing stops, so Claude is asked about what was meant. */
const SETTLE_MS = 900;
/** The most open items in the location to ask about. */
const MOST = 30;

/** Claude's answers, by question: the ids of the items it waits on. */
const answers = new Map<string, string[]>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useWaitsOn(input: {
  jobId: string;
  itemId?: string;
  title: string;
  description: string;
  locationId: string;
  /** Who does it, by name, to tell Claude. */
  doneBy: string;
  typing: boolean;
  /** Whether to ask: for a new item or a draft, not every item opened. */
  ask: boolean;
}): Item[] {
  const data = useData();
  const items = data.useItems(input.jobId);
  const locations = data.useLocations(input.jobId);
  const companies = data.useCompanies();
  const ready = useClaudeReady();
  const title = input.title.trim();

  const candidates = useMemo(
    () => (input.typing || !title || !input.locationId ? [] : items.filter((i) => i.locationId === input.locationId && i.status === 'open' && !i.unfinished && i.id !== input.itemId).slice(0, MOST)),
    [input.typing, title, input.locationId, input.itemId, items],
  );
  const question = candidates.length > 0 ? JSON.stringify([title.toLowerCase(), input.description.trim().toLowerCase(), input.doneBy, candidates.map((c) => c.id)]) : null;
  const known = useSyncExternalStore(subscribe, () => (question ? answers.get(question) : undefined), () => undefined);
  const location = locations.find((l) => l.id === input.locationId)?.label ?? '';

  useEffect(() => {
    if (!question || !input.ask || !ready || answers.has(question)) return;
    const timer = setTimeout(() => {
      const companyOf = (i: Item) => companies.find((c) => c.id === i.companyId)?.name ?? '';
      const numbered = candidates.map((c) => ({ n: c.number ?? 0, title: c.title, description: c.description, location, company: companyOf(c) }));
      askClaude('waits-on', { item: { title, description: input.description, location, company: input.doneBy }, candidates: numbered })
        .then((raw) => {
          const ns = readWaitsOn(raw, numbered.map((c) => c.n).filter((n) => n > 0));
          answers.set(
            question,
            candidates.filter((c) => c.number !== null && ns.includes(c.number)).map((c) => c.id),
          );
          for (const l of listeners) l();
        })
        .catch(() => {
          // No signal, say: nothing is offered.
        });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [question, input.ask, ready, candidates, companies, location, title, input.description, input.doneBy]);

  return (known ?? []).flatMap((id) => items.filter((i) => i.id === id && i.status === 'open'));
}

/** "#14 Install tile floor (Volcano Stone)", for the line that offers it. */
export function waitsOnText(item: Item, company: string | undefined): string {
  return `#${itemNumberLabel(item)} ${item.title}${company ? ` (${company})` : ''}`;
}
