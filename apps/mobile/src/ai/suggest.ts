// iPhone: fill in an item from its photo through the suggest-item function on the server, which
// keeps the Claude key and checks the person is an active Ross Built user. Hidden until the
// function is set up (EXPO_PUBLIC_SUGGEST_ITEMS=1 once it is deployed with its key).

import { readSuggestion, suggestPrompt, type ItemSuggestion, type SuggestContext } from '@punch/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { isConfigured } from '@/data/config';
import { supabase } from '@/data/powersync/supabase';

const ON = isConfigured && process.env.EXPO_PUBLIC_SUGGEST_ITEMS === '1';

export function useCanSuggest(): boolean {
  return ON;
}

/** The first JSON object in a reply, read tolerantly. */
function firstJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function suggestFromPhoto(photo: { uri: string }, ctx: SuggestContext): Promise<ItemSuggestion | null> {
  if (!ON) return null;
  const image = await ImageManipulator.manipulate(photo.uri).resize({ width: 1280 }).renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
  const { data, error } = await supabase.functions.invoke<{ text?: string }>('suggest-item', {
    body: { prompt: suggestPrompt(ctx), image: saved.base64 ?? '' },
  });
  if (error || !data?.text) return null;
  return readSuggestion(firstJson(data.text), ctx);
}
