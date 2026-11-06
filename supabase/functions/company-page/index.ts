// The company's page, behind its private link: what the page on the web (apps/company-page) shows
// and what the company answers there. Every call says the link's token in its body (never in the
// address, so it stays out of logs); this checks it, talks to the database as the service role
// through the trade_* functions alone, and signs the photos for an hour. It answers with the page as
// it now stands.
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

interface PagePhoto {
  storage_path: string;
  width: number;
  height: number;
  marks: unknown;
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
      .map((p) => ({ width: p.width, height: p.height, marks: p.marks, url: signed.get(p.storage_path) ?? null }))
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
  throw new Refused('That is not something the page can do');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  const raw = await req.text();
  if (raw.length > 8000) return reply({ error: 'That is too much to send at once' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: 'Send the page what it asks for' }, 400);
  }
  const token = typeof body.t === 'string' ? body.t.trim().toLowerCase() : '';
  if (!TOKEN.test(token)) return reply({ error: 'This link does not work. Ask for a new one.' }, 404);
  try {
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
