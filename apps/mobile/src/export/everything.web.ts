// Preview page: Export Everything as one zip file, put together in the browser and handed to the
// viewer through the page's host, which asks before it saves; a page on its own downloads it.

import type { ExportEntry } from '@punch/core';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

type Downloads = { save: (request: { filename: string; data: Blob }) => Promise<{ status: string }> };
type Host = { use?: (name: string) => Promise<unknown> };

export interface ExportDone {
  missed: number;
}

/** The kinds of picture a photo can be, by their extension in the zip. */
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/heic': 'heic' };

/**
 * A photo's bytes, and its kind when it says. A photo kept in the page itself (data:) is read
 * straight from its address: the page may not fetch it.
 */
async function photoBytes(uri: string): Promise<{ bytes: Uint8Array; type: string | null }> {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(uri);
  if (data) {
    const [, type, params, payload] = data;
    if (/;base64/i.test(params ?? '')) {
      const text = atob(payload ?? '');
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
      return { bytes, type: type || null };
    }
    return { bytes: strToU8(decodeURIComponent(payload ?? '')), type: type || null };
  }
  const answer = await fetch(uri);
  return { bytes: new Uint8Array(await answer.arrayBuffer()), type: answer.headers.get('content-type') };
}

async function hostDownloads(): Promise<Downloads | null> {
  const host = (globalThis as { claude?: Host }).claude;
  if (!host?.use) return null;
  try {
    return ((await host.use('downloads')) as Downloads | null) ?? null;
  } catch {
    return null;
  }
}

export async function exportZip(fileName: string, entries: ExportEntry[], onProgress: (done: number, total: number) => void): Promise<ExportDone> {
  const chunks: Uint8Array[] = [];
  let problem: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) problem = err;
    else if (chunk.length > 0) chunks.push(chunk);
  });
  let missed = 0;
  for (let k = 0; k < entries.length; k += 1) {
    const e = entries[k]!;
    if (e.text !== undefined) {
      const f = new ZipDeflate(e.path, { level: 6 });
      zip.add(f);
      f.push(strToU8(e.text), true);
    } else if (e.photo) {
      try {
        const { bytes, type } = await photoBytes(e.photo.uri);
        // Named for what it is: a drawn sample photo is a picture made of lines, not a JPEG.
        const extension = type ? EXTENSIONS[type.split(';')[0]!.trim().toLowerCase()] : undefined;
        const f = new ZipPassThrough(extension ? e.path.replace(/\.[a-z]+$/i, `.${extension}`) : e.path);
        zip.add(f);
        f.push(bytes, true);
      } catch {
        missed += 1;
      }
    }
    if (problem) throw problem;
    if (k % 10 === 0 || k === entries.length - 1) onProgress(k + 1, entries.length);
  }
  zip.end();
  if (problem) throw problem;
  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  const downloads = await hostDownloads();
  if (downloads) {
    try {
      await downloads.save({ filename: fileName, data: blob });
      return { missed };
    } catch (e) {
      if ((e as { code?: string } | null)?.code === 'declined') return { missed };
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { missed };
}
