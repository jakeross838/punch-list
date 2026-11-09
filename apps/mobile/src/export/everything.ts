// iPhone: Export Everything written into one zip file in the phone's cache, a photo at a time so a
// job with thousands of photos never has to fit in memory at once, then handed to the share sheet:
// Files, AirDrop, Mail or a computer.

import type { ExportEntry } from '@punch/core';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export interface ExportDone {
  /** Photos that are not on this phone yet, left out. */
  missed: number;
}

export async function exportZip(fileName: string, entries: ExportEntry[], onProgress: (done: number, total: number) => void): Promise<ExportDone> {
  const folder = new Directory(Paths.cache, 'exports');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const out = new File(folder, fileName);
  if (out.exists) out.delete();
  out.create();
  const handle = out.open(FileMode.WriteOnly);
  let problem: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) problem = err;
    else if (chunk.length > 0) handle.writeBytesSync(chunk);
  });
  let missed = 0;
  try {
    for (let k = 0; k < entries.length; k += 1) {
      const e = entries[k]!;
      if (e.text !== undefined) {
        const f = new ZipDeflate(e.path, { level: 6 });
        zip.add(f);
        f.push(strToU8(e.text), true);
      } else if (e.photo) {
        const file = new File(e.photo.uri);
        if (!file.exists) {
          missed += 1;
        } else {
          // A JPEG is as small as it gets already: kept as it is.
          const f = new ZipPassThrough(e.path);
          zip.add(f);
          f.push(await file.bytes(), true);
        }
      }
      if (problem) throw problem;
      if (k % 10 === 0 || k === entries.length - 1) onProgress(k + 1, entries.length);
    }
    zip.end();
    if (problem) throw problem;
  } finally {
    handle.close();
  }
  await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: fileName });
  return { missed };
}
