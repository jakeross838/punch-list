// Fill In From Photo: Claude looks at the photo, with what was typed about it, the location, the
// marks, the standard titles and the companies on the job, and fills in what is still blank: the
// title, where exactly and the company (the trade follows the company). It never overwrites what
// was typed. When the marks point at more than one problem, the others are offered as drafts in the
// same location, each with the photo. The person checks it over.

import { readSuggestions, suggestContext, suggestionPatch, type ItemSuggestion, type Mark } from '@punch/core';
import { useState } from 'react';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { useData } from '@/data/api';
import { haptic, useFeedback } from '@/ui';
import { startDraft, type ItemDraft } from './ItemForm';

export function useFillIn(jobId: string) {
  const data = useData();
  const feedback = useFeedback();
  const can = useClaudeReady(true);
  const titles = data.useTitles();
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const locations = data.useLocations(jobId);
  const settings = data.useFormSettings();
  const [busy, setBusy] = useState(false);

  /** The other problems on the photo, each a draft in the same location with the photo and its marks. */
  async function addOthers(others: ItemSuggestion[], photo: { uri: string; marks: Mark[]; width?: number; height?: number }, locationId: string) {
    for (const o of others) {
      const blank = startDraft(locationId, settings);
      const { locationId: at, ...fields } = { ...blank, ...suggestionPatch(o, blank, trades, companies) };
      const id = await data.createItem({ ...fields, unfinished: true, jobId, locationId: at, source: 'walk' });
      if (photo.width && photo.height) await data.addPhotos([{ jobId, itemId: id, uri: photo.uri, width: photo.width, height: photo.height, marks: photo.marks }]);
    }
    haptic.success();
    feedback.toast({ message: `Added ${others.length === 1 ? 'a draft' : `${others.length} drafts`} to finish in Drafts.` });
  }

  async function fillIn(photo: { uri: string; marks: Mark[]; width?: number; height?: number }, value: ItemDraft, apply: (patch: Partial<ItemDraft>) => void) {
    if (busy) return;
    const location = locations.find((l) => l.id === value.locationId)?.label ?? null;
    // What they typed is the problem in their words: Claude goes by it.
    const words = [value.title, value.description].map((w) => w.trim()).filter(Boolean).join('. ');
    const ctx = suggestContext({ location, words, titles, trades, companies, jobCompanies, marks: photo.marks });
    setBusy(true);
    haptic.tap();
    try {
      const [first, ...others] = readSuggestions(await askClaude('fill-in', ctx, [photo.uri]), ctx);
      if (!first) {
        feedback.toast({ message: 'No suggestion came back. Fill it in by hand.' });
        return;
      }
      const patch: Partial<ItemDraft> = suggestionPatch(first, value, trades, companies);
      if (Object.keys(patch).length > 0) {
        apply(patch);
        haptic.success();
      }
      if (others.length > 0) {
        feedback.actionSheet({
          title: `Claude sees ${others.length === 1 ? 'one more thing' : `${others.length} more things`} marked on this photo`,
          message: others.map((o) => o.title).join('\n'),
          actions: [{ label: others.length === 1 ? 'Add It as a Draft' : `Add Them as ${others.length} Drafts`, onPress: () => void addOthers(others, photo, value.locationId) }],
          cancelLabel: 'Not Now',
        });
        return;
      }
      feedback.toast({ message: Object.keys(patch).length > 0 ? 'Filled in from the photo. Check it over.' : 'Everything is already filled in.' });
    } catch (e) {
      feedback.toast({ message: troubleMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return { can, busy, fillIn };
}
