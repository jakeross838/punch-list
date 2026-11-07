// Preview page: Claude's work in the app asks the viewer's own Claude through the preview page
// itself (the page asks before the first use), in the same words from @punch/core as the iPhone.
// Hidden where the page cannot ask Claude, and the photo tasks where it cannot send pictures.

import { CLAUDE_TASKS, taskPrompt, type ClaudeTask } from '@punch/core';
import { useSyncExternalStore } from 'react';
import { ClaudeError } from './claudeErrors';

interface SampleFn {
  json(input: string, options: { images?: Blob[]; modelTier?: 'quick' | 'default' | 'complex' }): Promise<unknown>;
  limits(): Promise<{ images?: { maxCount?: number } }>;
}
interface ClaudeRuntime {
  use(name: 'sample'): Promise<SampleFn | null>;
}

export interface ClaudeAllowance {
  usedCents: number;
  limitCents: number;
}

let available = false;
let mostImages = 0;
const listeners = new Set<() => void>();

const sample: Promise<SampleFn | null> = (async () => {
  const runtime = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (!runtime?.use) return null;
  try {
    const fn = await runtime.use('sample');
    if (!fn) return null;
    const limits = await fn.limits().catch(() => null);
    mostImages = limits?.images ? (limits.images.maxCount ?? 1) : 0;
    available = true;
    for (const l of listeners) l();
    return fn;
  } catch {
    return null;
  }
})();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Whether Claude can be asked here. photos: whether the task sends photos. */
export function useClaudeReady(photos = false): boolean {
  return useSyncExternalStore(subscribe, () => available && (!photos || mostImages > 0), () => false);
}

/** How many photos can go with one question from this page. */
export function claudePhotoRoom(): number {
  return mostImages;
}

/** The viewer's own Claude has no allowance in the app. */
export function useClaudeAllowance(): ClaudeAllowance | null {
  return null;
}

/** A photo as a JPEG no longer than side on its long edge. */
async function photoBlob(uri: string, side: number): Promise<Blob> {
  const img = document.createElement('img');
  img.src = uri;
  await img.decode();
  const scale = Math.min(1, side / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new ClaudeError('no_answer', 'The photo could not be read. Try another one.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ClaudeError('no_answer'))), 'image/jpeg', 0.85));
}

/**
 * Asks Claude one of the app's tasks, with its photos in order (as many as the page can send).
 * Answers with what Claude said, already read as JSON, for the task's reader. Throws a ClaudeError.
 */
export async function askClaude(task: ClaudeTask, input: unknown, photos: string[] = [], side = 1280): Promise<unknown> {
  const fn = await sample;
  if (!fn) throw new ClaudeError('not_allowed');
  const spec = CLAUDE_TASKS[task];
  const sending = photos.slice(0, Math.min(spec.images, mostImages));
  if (sending.length < spec.minImages) throw new ClaudeError('not_allowed', 'Claude cannot see photos on this page.');
  const images = await Promise.all(sending.map((uri) => photoBlob(uri, side)));
  try {
    return await fn.json(taskPrompt(task, input), { ...(images.length > 0 ? { images } : {}), modelTier: spec.tier === 'quick' ? 'quick' : 'default' });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'not_granted' || code === 'sampling_disabled') throw new ClaudeError('not_allowed');
    if (code === 'rate_limited') throw new ClaudeError('busy');
    throw new ClaudeError('no_answer');
  }
}
