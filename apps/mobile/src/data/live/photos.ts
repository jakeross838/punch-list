// Moving the pictures themselves, apart from the data, so the camera never waits: a photo taken
// here is kept as it came, then made smaller (2048 on the long side) and uploaded to the private
// photos bucket when there is a signal; once it is up, its row says where it is, and the other
// phones bring it down to show it. Each photo's file on this phone is in photo_files.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { config } from '../config';
import { supabase } from '../powersync/supabase';
import { db } from './db';

const BUCKET = 'photos';
const LONG_SIDE = 2048;

type Row = Record<string, unknown>;

let running = false;
let again = false;
let timer: ReturnType<typeof setInterval> | null = null;
let unwatch: (() => void) | null = null;
/** Pictures that would not come down: tried again the next time the app opens. */
const missing = new Set<string>();

function folder(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, apikey: config.supabaseAnonKey });

/** A storage path in a URL, each part escaped. */
const inUrl = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** The picture made smaller for sending and keeping, as a new file next to it; the original if that fails. */
async function smaller(id: string, uri: string): Promise<string> {
  try {
    const whole = await ImageManipulator.manipulate(uri).renderAsync();
    const long = Math.max(whole.width, whole.height);
    const image =
      long > LONG_SIDE
        ? await ImageManipulator.manipulate(uri)
            .resize(whole.width >= whole.height ? { width: LONG_SIDE } : { height: LONG_SIDE })
            .renderAsync()
        : whole;
    const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
    const kept = new File(folder(), `${id}-up.jpg`);
    if (kept.exists) kept.delete();
    await new File(saved.uri).move(kept);
    return kept.uri;
  } catch (e) {
    console.warn('Making a photo smaller', e);
    return uri;
  }
}

/** Sends one picture up. False when it could not go (no signal, or signed out): the rest wait too. */
async function upload(token: string, r: Row): Promise<boolean> {
  const id = String(r.id);
  let uri = String(r.uri ?? '');
  if (!new File(uri).exists) {
    // The picture is gone from this phone: there is nothing to send.
    await db.execute('UPDATE photo_files SET uploaded = 1 WHERE id = ?', [id]);
    return true;
  }
  if (!uri.endsWith('-up.jpg')) {
    const small = await smaller(id, uri);
    if (small !== uri) {
      await db.execute('UPDATE photo_files SET uri = ? WHERE id = ?', [small, id]);
      try {
        new File(uri).delete();
      } catch {
        // Kept as it came; the smaller one is what shows from now on.
      }
      uri = small;
    }
  }
  const path = `${String(r.job_id)}/${id}.jpg`;
  const result = await new File(uri).upload(`${config.supabaseUrl}/storage/v1/object/${BUCKET}/${inUrl(path)}`, {
    httpMethod: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
    mimeType: 'image/jpeg',
  });
  // Already there: an earlier try landed before the signal dropped.
  const up = (result.status >= 200 && result.status < 300) || /already exists|duplicate/i.test(result.body);
  if (!up) {
    console.warn('Uploading a photo', result.status, result.body);
    return false;
  }
  await db.writeTransaction(async (tx) => {
    await tx.execute('UPDATE photos SET storage_path = ? WHERE id = ?', [path, id]);
    await tx.execute('UPDATE photo_files SET uploaded = 1 WHERE id = ?', [id]);
  });
  return true;
}

/** Brings one picture down to show. False when nothing more should be tried now. */
async function download(token: string, r: Row): Promise<boolean> {
  const id = String(r.id);
  const path = String(r.storage_path);
  const file = new File(folder(), `${id}.jpg`);
  try {
    await File.downloadFileAsync(`${config.supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${inUrl(path)}`, file, { headers: authHeaders(token), idempotent: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Not there, or not allowed: no use asking again now. Anything else is the signal.
    if (/\b(400|403|404)\b/.test(message)) {
      missing.add(id);
      return true;
    }
    return false;
  }
  await db.execute('INSERT INTO photo_files (id, uri, uploaded) VALUES (?, ?, 1)', [id, file.uri]);
  return true;
}

async function work(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const token = await accessToken();
      if (!token) return;
      const up = await db.getAll<Row>(
        'SELECT f.id, f.uri, p.job_id FROM photo_files f JOIN photos p ON p.id = f.id WHERE f.uploaded = 0 AND p.removed = 0 ORDER BY p.created_at',
      );
      for (const r of up) if (!(await upload(token, r))) return;
      const down = await db.getAll<Row>(
        'SELECT p.id, p.storage_path FROM photos p LEFT JOIN photo_files f ON f.id = p.id WHERE f.id IS NULL AND p.storage_path IS NOT NULL AND p.removed = 0 ORDER BY p.created_at DESC LIMIT 40',
      );
      for (const r of down) {
        if (missing.has(String(r.id))) continue;
        if (!(await download(token, r))) return;
      }
    } while (again);
  } catch (e) {
    // No signal, most likely: tried again in a minute, or when a photo changes.
    console.warn('Moving photos', e);
  } finally {
    running = false;
  }
}

/** Starts moving pictures, now and whenever a photo is added or comes down. */
export function startPhotos(): void {
  if (unwatch) return;
  unwatch = db.onChange({ onChange: () => void work() }, { tables: ['photos', 'photo_files'], throttleMs: 1500 });
  timer = setInterval(() => void work(), 60_000);
  void work();
}

export function stopPhotos(): void {
  unwatch?.();
  unwatch = null;
  if (timer) clearInterval(timer);
  timer = null;
  missing.clear();
}

/** Pictures taken on this phone that have not gone up yet. */
export async function photosWaiting(): Promise<number> {
  const r = await db.getOptional<Row>('SELECT count(*) AS n FROM photo_files WHERE uploaded = 0');
  return Number(r?.n ?? 0);
}

/** Signing out clears the pictures from the phone too. */
export function deletePhotoFiles(): void {
  const dir = new Directory(Paths.document, 'photos');
  if (dir.exists) dir.delete();
}
