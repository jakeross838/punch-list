// The company's page, behind its private link: what the page on the web (apps/company-page) shows
// and what the company answers there. Every call says the link's token in its body (never in the
// address, so it stays out of logs); this checks it, talks to the database as the service role
// through the trade_* functions alone, and signs the photos for an hour. It answers with the page as
// it now stands. A photo of the finished work comes as a JPEG in base64: this puts it in the item's
// folder in storage, then on the item as a done photo.
//
// The job's station (a tablet or a TV in the house) sends its own link as s instead: alone, for its
// board of every company on the job; with a company, for that company's list, opened through the
// company's own link, which never leaves here.
//
//   Deployed with verify_jwt off: the link is the only key, and nobody signs in.

import { createClient } from 'npm:@supabase/supabase-js@2';

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    return (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default ?? '';
  } catch {
    return '';
  }
}

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const TOKEN = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The photos' addresses last this long, in seconds; the page asks again when it opens later. */
const SIGNED_FOR = 3600;
/** A done photo as the page sends it, in base64: made smaller on the phone first, well under this. */
const MOST_PHOTO_CHARS = 3_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

interface PagePhoto {
  storage_path: string;
  width: number;
  height: number;
  marks: unknown;
  done?: boolean;
}
interface PageItem {
  photos: PagePhoto[];
  [key: string]: unknown;
}
interface Page {
  items: PageItem[];
  [key: string]: unknown;
}

/** A name typed on the page: trimmed, one line, at most 80 characters, or none. */
function nameOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean === '' ? null : clean;
}

class Refused extends Error {}

async function page(token: string): Promise<Page | null> {
  const { data, error } = await db.rpc('trade_page', { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const out = data as Page;
  const paths = [...new Set(out.items.flatMap((i) => i.photos.map((p) => p.storage_path)))];
  const signed = new Map<string, string>();
  for (let k = 0; k < paths.length; k += 100) {
    const { data: urls, error: signError } = await db.storage.from('photos').createSignedUrls(paths.slice(k, k + 100), SIGNED_FOR);
    if (signError) throw signError;
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  for (const item of out.items) {
    item.photos = item.photos
      .map((p) => ({ width: p.width, height: p.height, marks: p.marks, done: p.done === true, url: signed.get(p.storage_path) ?? null }))
      .filter((p) => p.url !== null) as unknown as PagePhoto[];
  }
  return out;
}

/** One answer from the page, through its function, which checks the link and the item again. */
async function answer(token: string, body: Record<string, unknown>): Promise<void> {
  const action = body.action;
  const item = typeof body.item === 'string' && UUID.test(body.item) ? body.item : null;
  const name = nameOf(body.name);
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db.rpc(fn, { p_token: token, ...args });
    if (error) {
      // The functions say plainly when the link or the item is not theirs.
      if (error.code === '42501') throw new Refused(error.message);
      throw error;
    }
  };
  if (action === 'comment') {
    const text = typeof body.value === 'string' ? body.value.trim().slice(0, 2000) : '';
    if (text === '') throw new Refused('Write the comment first');
    await call('trade_comment', { p_item: item, p_body: text, p_name: name });
    return;
  }
  if (!item) throw new Refused('That item is not on this list');
  if (action === 'confirm') return call('trade_confirm', { p_item: item, p_confirmed: body.value !== false, p_name: name });
  if (action === 'done') return call('trade_mark_done', { p_item: item, p_done: body.value !== false, p_name: name });
  if (action === 'hours') {
    const hours = typeof body.value === 'number' && Number.isFinite(body.value) && body.value > 0 ? body.value : null;
    return call('trade_set_hours', { p_item: item, p_hours: hours, p_name: name });
  }
  if (action === 'photo') return addPhoto(token, item, body, name, call);
  throw new Refused('That is not something the page can do');
}

/** A done photo: into the item's own folder in storage, then onto the item. */
async function addPhoto(token: string, item: string, body: Record<string, unknown>, name: string | null, call: (fn: string, args: Record<string, unknown>) => Promise<void>): Promise<void> {
  const data = typeof body.value === 'string' ? body.value : '';
  const width = typeof body.width === 'number' ? Math.round(body.width) : 0;
  const height = typeof body.height === 'number' ? Math.round(body.height) : 0;
  if (data === '' || data.length > MOST_PHOTO_CHARS || !BASE64.test(data) || width <= 0 || height <= 0) throw new Refused('Send the photo as a JPEG');
  const { data: folder, error } = await db.rpc('trade_photo_folder', { p_token: token, p_item: item });
  if (error) {
    if (error.code === '42501') throw new Refused(error.message);
    throw error;
  }
  const path = `${String(folder)}/done-${crypto.randomUUID()}.jpg`;
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const { error: upError } = await db.storage.from('photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upError) throw upError;
  try {
    await call('trade_add_photo', { p_item: item, p_path: path, p_width: width, p_height: height, p_name: name });
  } catch (e) {
    // The photo did not go on the item: its file goes too.
    await db.storage.from('photos').remove([path]);
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  const raw = await req.text();
  if (raw.length > MOST_PHOTO_CHARS + 8000) return reply({ error: 'That is too much to send at once' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: 'Send the page what it asks for' }, 400);
  }
  // Only a photo is big.
  if (body.action !== 'photo' && raw.length > 8000) return reply({ error: 'That is too much to send at once' }, 413);
  let token = typeof body.t === 'string' ? body.t.trim().toLowerCase() : '';
  try {
    if (body.s !== undefined) {
      const station = typeof body.s === 'string' ? body.s.trim().toLowerCase() : '';
      if (!TOKEN.test(station)) return reply({ error: 'This station link does not work. Ask for a new one.' }, 404);
      const company = typeof body.company === 'string' && UUID.test(body.company) ? body.company.toLowerCase() : null;
      if (!company) {
        const { data, error } = await db.rpc('station_page', { p_token: station });
        if (error) throw error;
        if (!data) return reply({ error: 'This station is turned off. Ask for a new link.' }, 404);
        return reply(data);
      }
      const { data, error } = await db.rpc('station_company', { p_token: station, p_company: company });
      if (error) {
        if (error.code === '42501') throw new Refused(error.message);
        throw error;
      }
      if (!data) return reply({ error: 'This station is turned off. Ask for a new link.' }, 404);
      token = String(data);
    }
    if (!TOKEN.test(token)) return reply({ error: 'This link does not work. Ask for a new one.' }, 404);
    if (body.action && body.action !== 'page') await answer(token, body);
    const shown = await page(token);
    if (!shown) return reply({ error: 'This link no longer works. Ask for a new one.' }, 404);
    return reply(shown);
  } catch (e) {
    if (e instanceof Refused) return reply({ error: e.message }, 403);
    console.error('company-page', e instanceof Error ? e.message : e);
    return reply({ error: 'Something went wrong. Try again in a moment.' }, 500);
  }
});
