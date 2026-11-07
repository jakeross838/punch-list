// Preview page: reading the plans with the viewer's own Claude, through the preview page itself (the
// page asks before the first use). A plan PDF is read here, in the page, into the text on each page
// with where it sits, and Claude reads that; pictures of the sheets go to Claude as pictures, whole
// and in pieces. Hidden where the page cannot ask Claude.

import { jsonIn, picturesNote, planPieces, planPrompt, plansAsText, readPlanAnswer, type PageText, type PlanReading } from '@punch/core';
import { getDocumentAsync } from 'expo-document-picker';
import { launchImageLibraryAsync } from 'expo-image-picker';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { useSyncExternalStore } from 'react';
import { MOST_PDF_BYTES, MOST_PICTURES, NOTHING_FOUND, PlanReadError, TOO_BIG, type PickedPlans, type PlanFile, type PlanWays } from './planFiles';

// The PDF is read on the page itself: the page may not start workers of its own.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

/** The most pages read from one PDF: a whole set of plans, with room to spare. */
const MOST_PAGES = 80;

interface SampleFn {
  json(input: string, options: { images?: Blob[]; modelTier?: 'quick' | 'default' | 'complex' }): Promise<unknown>;
  limits(): Promise<{ images?: { maxCount: number } }>;
}
interface ClaudeRuntime {
  use(name: 'sample'): Promise<SampleFn | null>;
}

let ways: PlanWays = { pdf: false, pictures: false, camera: false };
let mostImages = 0;
const listeners = new Set<() => void>();

const sample: Promise<SampleFn | null> = (async () => {
  const runtime = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (!runtime?.use) return null;
  try {
    const fn = await runtime.use('sample');
    if (!fn) return null;
    const limits = await fn.limits().catch(() => null);
    mostImages = limits?.images?.maxCount ?? 0;
    ways = { pdf: true, pictures: mostImages > 0, camera: false };
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

export function useCanReadPlans(): boolean {
  return useSyncExternalStore(subscribe, () => ways.pdf, () => false);
}

export function usePlanWays(): PlanWays {
  return useSyncExternalStore(subscribe, () => ways, () => ways);
}

export async function pickPlanPdf(): Promise<PickedPlans | null> {
  const result = await getDocumentAsync({ type: 'application/pdf', multiple: false, base64: false });
  const a = result.canceled ? null : result.assets[0];
  if (!a?.file) return null;
  return { kind: 'pdf', files: [{ uri: a.uri, name: a.name, size: a.size ?? a.file.size, width: null, height: null, blob: a.file }] };
}

export async function pickPlanPictures(): Promise<PickedPlans | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true });
  if (result.canceled || result.assets.length === 0) return null;
  return {
    kind: 'pictures',
    files: result.assets.slice(0, MOST_PICTURES).map((a, i) => ({ uri: a.uri, name: a.fileName ?? `Sheet ${i + 1}`, size: a.fileSize ?? null, width: a.width || null, height: a.height || null, blob: a.file })),
  };
}

/** Not on the preview page: pictures are chosen instead. */
export async function takePlanPicture(): Promise<PlanFile | null> {
  return null;
}

/** Each page's pieces of text, where each sits from the top left and how big. */
async function pdfPages(data: ArrayBuffer): Promise<PageText[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false });
  try {
    const doc = await task.promise;
    const pages: PageText[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MOST_PAGES); n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PageText['items'] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const size = Math.hypot(item.transform[2], item.transform[3]) || item.height || 8;
        items.push({ text: item.str, x, y: y - size, width: item.width, size });
      }
      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

async function picture(blob: Blob): Promise<HTMLImageElement> {
  const img = document.createElement('img');
  const url = URL.createObjectURL(blob);
  try {
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Part of a picture as a JPEG, drawn on white, no bigger than most on its long side. */
async function jpeg(img: HTMLImageElement, part: { x: number; y: number; width: number; height: number }, most: number): Promise<Blob> {
  const scale = Math.min(1, most / Math.max(part.width, part.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(part.width * scale));
  canvas.height = Math.max(1, Math.round(part.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new PlanReadError('This browser cannot read pictures here.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, part.x, part.y, part.width, part.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new PlanReadError('A picture could not be read.'))), 'image/jpeg', 0.85));
}

/**
 * Claude reads the plans, on the viewer's account. levels: the job's level names, to keep using.
 * Throws a PlanReadError that says what went wrong.
 */
export async function readPlans(_jobId: string, picked: PickedPlans, levels: string[], onStage: (stage: 'sending' | 'reading') => void): Promise<PlanReading> {
  const fn = await sample;
  if (!fn) throw new PlanReadError('Claude is not available on this page.');
  onStage('sending');
  let raw: unknown;
  try {
    if (picked.kind === 'pdf') {
      const f = picked.files[0];
      if (!f?.blob) throw new PlanReadError('Pick the plan PDF first.');
      if (f.blob.size > MOST_PDF_BYTES) throw new PlanReadError(TOO_BIG);
      let pages: PageText[];
      try {
        pages = await pdfPages(await f.blob.arrayBuffer());
      } catch (e) {
        if (e instanceof PlanReadError) throw e;
        throw new PlanReadError('That PDF could not be opened. Check it opens on its own, then try again.');
      }
      const text = plansAsText(pages);
      if (!/[A-Za-z]{3}/.test(text)) throw new PlanReadError('That PDF has no text in it to read: it is pictures of the sheets. Choose pictures of the floor plans instead.');
      onStage('reading');
      raw = await fn.json(planPrompt({ levels, text }), { modelTier: 'default' });
    } else {
      // Each sheet whole, then its pieces, as many as Claude takes at once.
      const images: Blob[] = [];
      const pieces: number[] = [];
      for (const f of picked.files) {
        if (!f.blob || images.length >= mostImages) break;
        const img = await picture(f.blob);
        images.push(await jpeg(img, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight }, 1568));
        const parts = planPieces(img.naturalWidth, img.naturalHeight);
        const room = mostImages - images.length;
        const kept = parts.length > 1 && parts.length <= room ? parts : [];
        for (const p of kept) images.push(await jpeg(img, p, 1092));
        pieces.push(kept.length);
      }
      onStage('reading');
      raw = await fn.json(`${picturesNote(pieces)}\n\n${planPrompt({ levels })}`, { images, modelTier: 'default' });
    }
  } catch (e) {
    if (e instanceof PlanReadError) throw e;
    const code = (e as { code?: string } | null)?.code;
    if (code === 'not_granted' || code === 'sampling_disabled') throw new PlanReadError('Claude was not allowed to read the plans on this page.');
    if (code === 'rate_limited') throw new PlanReadError('Claude is busy. Try again in a minute.');
    if (code === 'prompt_too_large') throw new PlanReadError(TOO_BIG);
    throw new PlanReadError('Claude did not answer. Try again.');
  }
  const reading = readPlanAnswer(typeof raw === 'string' ? jsonIn(raw) : raw);
  if (!reading || reading.levels.length === 0) throw new PlanReadError(NOTHING_FOUND);
  return reading;
}
