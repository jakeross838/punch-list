// Preview page: fill in an item from its photo by asking Claude through the preview page itself,
// on the viewer's own Claude account (the page asks before the first use). Hidden where the page
// cannot ask Claude or send images.

import { readSuggestion, suggestPrompt, type ItemSuggestion, type SuggestContext } from '@punch/core';
import { useSyncExternalStore } from 'react';

interface SampleFn {
  json(input: string, options: { images?: Blob[]; modelTier?: 'quick' | 'default' | 'complex' }): Promise<unknown>;
  limits(): Promise<{ images?: unknown }>;
}
interface ClaudeRuntime {
  use(name: 'sample'): Promise<SampleFn | null>;
}

let available = false;
const listeners = new Set<() => void>();

const sample: Promise<SampleFn | null> = (async () => {
  const runtime = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (!runtime?.use) return null;
  try {
    const fn = await runtime.use('sample');
    if (!fn) return null;
    const limits = await fn.limits().catch(() => null);
    if (!limits?.images) return null;
    available = true;
    for (const l of listeners) l();
    return fn;
  } catch {
    return null;
  }
})();

export function useCanSuggest(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => available,
    () => false,
  );
}

/** The photo as a JPEG no bigger than Claude needs. */
async function photoBlob(uri: string): Promise<Blob> {
  const img = document.createElement('img');
  img.src = uri;
  await img.decode();
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No drawing surface');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/jpeg', 0.85));
}

export async function suggestFromPhoto(photo: { uri: string }, ctx: SuggestContext): Promise<ItemSuggestion | null> {
  const fn = await sample;
  if (!fn) return null;
  const raw = await fn.json(suggestPrompt(ctx), { images: [await photoBlob(photo.uri)], modelTier: 'default' });
  return readSuggestion(raw, ctx);
}
