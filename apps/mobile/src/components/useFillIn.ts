// Fill In From Photo: Claude looks at the photo, with the room, the marks, the standard titles and
// the companies on the job, and fills in what is still blank: the title, where exactly and the
// company (the trade follows the company). It never overwrites what was already typed. The person
// checks it over.

import { suggestContext, suggestionPatch, type ItemSuggestion, type Mark } from '@punch/core';
import { useState } from 'react';
import { suggestFromPhoto, useCanSuggest } from '@/ai/suggest';
import { useData } from '@/data/api';
import { haptic, useFeedback } from '@/ui';
import type { ItemDraft } from './ItemForm';

export function useFillIn(jobId: string) {
  const data = useData();
  const feedback = useFeedback();
  const can = useCanSuggest();
  const titles = data.useTitles();
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const locations = data.useLocations(jobId);
  const [busy, setBusy] = useState(false);

  async function fillIn(photo: { uri: string; marks: Mark[] }, value: ItemDraft, apply: (patch: Partial<ItemDraft>) => void) {
    if (busy) return;
    const location = locations.find((l) => l.id === value.locationId)?.label ?? null;
    const ctx = suggestContext({ location, titles, trades, companies, jobCompanies, marks: photo.marks });
    setBusy(true);
    haptic.tap();
    try {
      const s: ItemSuggestion | null = await suggestFromPhoto(photo, ctx);
      if (!s) {
        feedback.toast({ message: 'No suggestion came back. Fill it in by hand.' });
        return;
      }
      const patch: Partial<ItemDraft> = suggestionPatch(s, value, trades, companies);
      if (Object.keys(patch).length === 0) {
        feedback.toast({ message: 'Everything is already filled in.' });
        return;
      }
      apply(patch);
      haptic.success();
      feedback.toast({ message: 'Filled in from the photo. Check it over.' });
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      feedback.toast({
        message:
          code === 'not_granted' || code === 'sampling_disabled'
            ? 'Claude is not allowed on this page.'
            : code === 'rate_limited'
              ? 'Too many at once. Try again in a minute.'
              : 'That did not work. Try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return { can, busy, fillIn };
}
