// iPhone: Claude's work in the app goes through the ai function on the server, which keeps the
// Claude key, checks the person is switched on at a company with some of this month's allowance
// left, and asks in the words from @punch/core. The app shows Claude's buttons once the function
// says it is set up; it asks again now and then, quietly.

import type { ClaudeTask } from '@punch/core';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useSyncExternalStore } from 'react';
import { isConfigured } from '@/data/config';
import { supabase } from '@/data/powersync/supabase';
import { ClaudeError } from './claudeErrors';

/** How long until asking again whether Claude is set up. */
const RECHECK_MS = 5 * 60_000;

export interface ClaudeAllowance {
  usedCents: number;
  limitCents: number;
}

let ready: boolean | null = null;
let allowance: ClaudeAllowance | null = null;
let checkedAt = 0;
let checking = false;
const listeners = new Set<() => void>();
const tell = () => {
  for (const l of listeners) l();
};

/** Whether the ai function is there with its Claude key, and the allowance. */
async function check(force = false): Promise<void> {
  if (!isConfigured || checking || (!force && Date.now() - checkedAt < RECHECK_MS)) return;
  checking = true;
  try {
    const { data, error } = await supabase.functions.invoke<{ ready?: boolean; used?: number; limit?: number }>('ai', { body: { check: true } });
    ready = !error && data?.ready === true;
    allowance = !error && data && typeof data.used === 'number' && typeof data.limit === 'number' ? { usedCents: data.used, limitCents: data.limit } : null;
  } catch {
    ready = false;
  } finally {
    checking = false;
    checkedAt = Date.now();
    tell();
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Whether Claude can be asked here. photos: whether the task sends photos (always on the iPhone). */
export function useClaudeReady(_photos = false): boolean {
  useEffect(() => {
    void check();
  }, []);
  return useSyncExternalStore(subscribe, () => ready === true, () => false);
}

/** How many photos can go with one question: as many as a task takes, on the iPhone. */
export function claudePhotoRoom(): number {
  return 20;
}

/** This month's allowance for Claude and what is used of it, once known. */
export function useClaudeAllowance(): ClaudeAllowance | null {
  useEffect(() => {
    void check(true);
  }, []);
  return useSyncExternalStore(subscribe, () => allowance, () => null);
}

/** A photo as Claude sees it: a JPEG no longer than side on its long edge, in base64. */
async function photoData(uri: string, side: number): Promise<string> {
  const whole = await ImageManipulator.manipulate(uri).renderAsync();
  const long = Math.max(whole.width, whole.height);
  const image =
    long > side
      ? await ImageManipulator.manipulate(uri)
          .resize(whole.width >= whole.height ? { width: side, height: null } : { width: null, height: side })
          .renderAsync()
      : whole;
  const saved = await image.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
  if (!saved.base64) throw new ClaudeError('no_answer', 'The photo could not be read. Try another one.');
  return saved.base64;
}

/**
 * Asks Claude one of the app's tasks. photos go with it, in order, each no longer than side on its
 * long edge. Answers with Claude's text, for the task's reader in @punch/core. Throws a ClaudeError.
 */
export async function askClaude(task: ClaudeTask, input: unknown, photos: string[] = [], side = 1280): Promise<unknown> {
  if (!isConfigured) throw new ClaudeError('not_set_up');
  const images = await Promise.all(photos.map((uri) => photoData(uri, side)));
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('ai', { body: { task, input, images } });
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response | undefined)?.status ?? 0;
    if (status === 429) {
      // The allowance is used: the next check says so everywhere.
      void check(true);
      throw new ClaudeError('used_up');
    }
    if (status === 403 || status === 401) throw new ClaudeError('signed_out');
    if (status === 503) throw new ClaudeError('not_set_up');
    throw new ClaudeError('no_answer');
  }
  if (error instanceof FunctionsFetchError) throw new ClaudeError('offline');
  if (error || !data) throw new ClaudeError('offline');
  if (typeof data.text !== 'string') throw new ClaudeError('no_answer');
  return data.text;
}
