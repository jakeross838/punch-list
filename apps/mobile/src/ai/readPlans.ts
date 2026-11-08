// iPhone: reading the plans with Claude through the read-plans function, which keeps the Claude key
// on the server. The plans go up to the job's folder in storage first: the PDF as it is, or each
// picture of a sheet whole and cut into pieces Claude reads at full size. The function hands Claude
// a link to each, takes the files away once Claude has read them, and sends the answer back here
// to be checked. Read the Plans shows once the function says it is set up.

import { jsonIn, planPieces, readPlanAnswer, readSayIt, type HeardItem, type ListReadInput, type PlanReading } from '@punch/core';
import { randomUUID } from 'expo-crypto';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';
import { useEffect, useSyncExternalStore } from 'react';
import { config, isConfigured } from '@/data/config';
import { supabase } from '@/data/powersync/supabase';
import { MOST_PDF_BYTES, MOST_PICTURES, NOTHING_FOUND, NOTHING_ON_LIST, PlanReadError, TOO_BIG, type PickedPlans, type PlanFile, type PlanWays, type SheetPicture } from './planFiles';

const BUCKET = 'photos';
/** The whole sheet goes as big as Claude reads one picture. */
const WHOLE_SIDE = 1568;
/** How long until asking again whether reading is set up. */
const RECHECK_MS = 5 * 60_000;

let ready: boolean | null = null;
let checkedAt = 0;
let checking = false;
const listeners = new Set<() => void>();

/** Whether the read-plans function is there with its Claude key; asked now and then, quietly. */
async function check(): Promise<void> {
  if (!isConfigured || checking || Date.now() - checkedAt < RECHECK_MS) return;
  checking = true;
  try {
    const { data, error } = await supabase.functions.invoke<{ ready?: boolean }>('read-plans', { body: { check: true } });
    ready = !error && data?.ready === true;
  } catch {
    ready = false;
  } finally {
    checking = false;
    checkedAt = Date.now();
    for (const l of listeners) l();
  }
}

export function useCanReadPlans(): boolean {
  useEffect(() => {
    void check();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready === true,
    () => false,
  );
}

const WAYS: PlanWays = { pdf: true, pictures: true, camera: true, pdfSheets: false };

export function usePlanWays(): PlanWays {
  return WAYS;
}

export async function pickPlanPdf(): Promise<PickedPlans | null> {
  const result = await getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  const a = result.canceled ? null : result.assets[0];
  if (!a) return null;
  return { kind: 'pdf', files: [{ uri: a.uri, name: a.name, size: a.size ?? null, width: null, height: null }] };
}

export async function pickPlanPictures(): Promise<PickedPlans | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MOST_PICTURES, orderedSelection: true, quality: 1 });
  if (result.canceled || result.assets.length === 0) return null;
  return {
    kind: 'pictures',
    files: result.assets.slice(0, MOST_PICTURES).map((a, i) => ({ uri: a.uri, name: a.fileName ?? `Sheet ${i + 1}`, size: a.fileSize ?? null, width: a.width || null, height: a.height || null })),
  };
}

export async function takePlanPicture(): Promise<PlanFile | null> {
  const permission = await requestCameraPermissionsAsync();
  if (!permission.granted) throw new PlanReadError('The camera is off for Punch List. Turn it on in Settings, under Punch List.');
  const result = await launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  const a = result.canceled ? null : result.assets[0];
  return a ? { uri: a.uri, name: 'Sheet', size: a.fileSize ?? null, width: a.width || null, height: a.height || null } : null;
}

/** A storage path in a URL, each part escaped. */
const inUrl = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function upload(token: string, uri: string, path: string, type: string): Promise<void> {
  const result = await new File(uri).upload(`${config.supabaseUrl}/storage/v1/object/${BUCKET}/${inUrl(path)}`, {
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: config.supabaseAnonKey, 'Content-Type': type, 'x-upsert': 'false' },
    mimeType: type,
  });
  if (result.status < 200 || result.status >= 300) {
    console.warn('Sending the plans', result.status, result.body);
    throw new PlanReadError(result.status === 413 ? TOO_BIG : 'That did not send. Check the signal and try again.');
  }
}

/** A picture of a sheet: the whole of it, then its pieces at full size, each saved as a JPEG. */
async function cut(uri: string): Promise<string[]> {
  const whole = await ImageManipulator.manipulate(uri).renderAsync();
  const long = Math.max(whole.width, whole.height);
  const small =
    long > WHOLE_SIDE
      ? await ImageManipulator.manipulate(uri)
          .resize(whole.width >= whole.height ? { width: WHOLE_SIDE, height: null } : { width: null, height: WHOLE_SIDE })
          .renderAsync()
      : whole;
  const out = [(await small.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri];
  const pieces = planPieces(whole.width, whole.height);
  if (pieces.length === 1) return out;
  for (const p of pieces) {
    const piece = await ImageManipulator.manipulate(uri).crop({ originX: p.x, originY: p.y, width: p.width, height: p.height }).renderAsync();
    out.push((await piece.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri);
  }
  return out;
}

/**
 * Claude reads the plans. levels: the job's level names, to keep using. onStage says when the
 * files are up and Claude is reading. Throws a PlanReadError that says what went wrong.
 */
export async function readPlans(jobId: string, picked: PickedPlans, levels: string[], onStage: (stage: 'sending' | 'reading') => void): Promise<PlanReading> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PlanReadError('Sign in again to read the plans.');
  onStage('sending');
  const batch = randomUUID();
  const files: { path: string; type: 'pdf' | 'jpeg' }[] = [];
  const pieces: number[] = [];
  if (picked.kind === 'pdf') {
    const f = picked.files[0];
    if (!f) throw new PlanReadError('Pick the plan PDF first.');
    if ((f.size ?? 0) > MOST_PDF_BYTES) throw new PlanReadError(TOO_BIG);
    const path = `${jobId}/plans/read-${batch}.pdf`;
    await upload(token, f.uri, path, 'application/pdf');
    files.push({ path, type: 'pdf' });
  } else {
    for (const [i, f] of picked.files.entries()) {
      const parts = await cut(f.uri);
      pieces.push(parts.length - 1);
      for (const [j, uri] of parts.entries()) {
        const path = `${jobId}/plans/read-${batch}-${i + 1}-${j}.jpg`;
        await upload(token, uri, path, 'image/jpeg');
        files.push({ path, type: 'jpeg' });
      }
    }
  }
  onStage('reading');
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('read-plans', { body: { jobId, files, levels, pieces } });
  if (error || !data) throw new PlanReadError('Claude could not be reached. Check the signal and try again.');
  if (data.error || !data.text) throw new PlanReadError(data.error ? `${data.error}.` : NOTHING_FOUND);
  const reading = readPlanAnswer(jsonIn(data.text));
  if (!reading || reading.levels.length === 0) throw new PlanReadError(NOTHING_FOUND);
  return reading;
}

/** A picture of a page of a list, whole, no longer than a whole sheet of the plans, as a JPEG. */
async function wholePage(uri: string): Promise<string> {
  const whole = await ImageManipulator.manipulate(uri).renderAsync();
  const long = Math.max(whole.width, whole.height);
  const small =
    long > WHOLE_SIDE
      ? await ImageManipulator.manipulate(uri)
          .resize(whole.width >= whole.height ? { width: WHOLE_SIDE, height: null } : { width: null, height: WHOLE_SIDE })
          .renderAsync()
      : whole;
  return (await small.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri;
}

/**
 * Claude reads a punch list someone else wrote: a PDF, or pictures of its pages, through the same
 * function as the plans. input: the job's names for Claude to match. Answers with what it found,
 * to check before anything is added. Throws a PlanReadError that says what went wrong.
 */
export async function readList(jobId: string, picked: PickedPlans, input: ListReadInput, onStage: (stage: 'sending' | 'reading') => void): Promise<HeardItem[]> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PlanReadError('Sign in again to read the list.');
  onStage('sending');
  const batch = randomUUID();
  const files: { path: string; type: 'pdf' | 'jpeg' }[] = [];
  if (picked.kind === 'pdf') {
    const f = picked.files[0];
    if (!f) throw new PlanReadError('Pick the list first.');
    if ((f.size ?? 0) > MOST_PDF_BYTES) throw new PlanReadError(TOO_BIG);
    const path = `${jobId}/plans/read-${batch}.pdf`;
    await upload(token, f.uri, path, 'application/pdf');
    files.push({ path, type: 'pdf' });
  } else {
    for (const [i, f] of picked.files.entries()) {
      const path = `${jobId}/plans/read-${batch}-${i + 1}-0.jpg`;
      await upload(token, await wholePage(f.uri), path, 'image/jpeg');
      files.push({ path, type: 'jpeg' });
    }
  }
  onStage('reading');
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('read-plans', { body: { kind: 'list', jobId, files, input } });
  if (error || !data) throw new PlanReadError('Claude could not be reached. Check the signal and try again.');
  if (data.error || !data.text) throw new PlanReadError(data.error ? `${data.error}.` : NOTHING_ON_LIST);
  const heard = readSayIt(data.text, input);
  if (heard.length === 0) throw new PlanReadError(NOTHING_ON_LIST);
  return heard;
}

/** A spreadsheet saved as CSV (or tab separated), its text; null when nothing was picked. */
export async function pickTableFile(): Promise<string | null> {
  const result = await getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'text/plain', 'public.comma-separated-values-text'], copyToCacheDirectory: true, multiple: false });
  const a = result.canceled ? null : result.assets[0];
  if (!a) return null;
  if ((a.size ?? 0) > 2_000_000) throw new PlanReadError('That spreadsheet is too big. Save just the rows of work as a CSV.');
  return new File(a.uri).text();
}

/**
 * The picture with a level's floor plan, counting from 1, to keep as the job's plan for the level.
 * A page of a PDF cannot be drawn here: a screenshot of it is added in Plans instead.
 */
export async function planSheetPicture(picked: PickedPlans, sheet: number): Promise<SheetPicture | null> {
  if (picked.kind !== 'pictures') return null;
  const f = picked.files[sheet - 1];
  if (!f) return null;
  if (f.width && f.height) return { uri: f.uri, width: f.width, height: f.height };
  const img = await ImageManipulator.manipulate(f.uri).renderAsync();
  return { uri: f.uri, width: img.width, height: img.height };
}
