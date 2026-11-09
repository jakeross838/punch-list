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
// The owner's page sends the owner's link as o, through the owner_* functions alone: the job as the
// owner sees it, something the owner wants looked at (their words, where, and a photo, which this
// puts in the job's folder), and their sign off.
//
// A company whose page is in Spanish gets its list's lines translated by Claude on the builder's
// allowance, each line once: they are kept in translations and used again.
//
// When a company marks work done, confirms it or comments, and when the owner adds something or
// signs off, the job's team are told on their phones, through Expo's push service, once the page
// has its answer: the line says what happened in the words Activity uses, under the job's name.
//
// A page asks for the builder's logo with logo: true when it opens, and keeps it: it is too big to
// send every minute the page asks again.
//
//   Deployed with verify_jwt off: the link is the only key, and nobody signs in.
//   tools/build-functions.mjs writes core.js and claude.ts here.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { askClaude, claudeKey, usedUp, type Allowance } from './claude.ts';
import { CLAUDE_MODELS, newsLine, readTranslations, TRANSLATE_AT_ONCE, translatePrompt } from './core.js';

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
interface OwnerPage {
  locations: { done: { photos: PagePhoto[] }[] }[];
  [key: string]: unknown;
}

/** A name typed on the page: trimmed, one line, at most 80 characters, or none. */
function nameOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean === '' ? null : clean;
}

class Refused extends Error {}

/** Each photo's address for the next hour, by its path in storage. */
async function signAll(list: PagePhoto[]): Promise<Map<string, string>> {
  const paths = [...new Set(list.map((p) => p.storage_path))];
  const signed = new Map<string, string>();
  for (let k = 0; k < paths.length; k += 100) {
    const { data: urls, error: signError } = await db.storage.from('photos').createSignedUrls(paths.slice(k, k + 100), SIGNED_FOR);
    if (signError) throw signError;
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  return signed;
}

/** The photos as the page shows them: no paths, only their addresses for the next hour. */
const shownPhotos = (list: PagePhoto[], signed: Map<string, string>) =>
  list
    .map((p) => ({ width: p.width, height: p.height, marks: p.marks, done: p.done === true, url: signed.get(p.storage_path) ?? null }))
    .filter((p) => p.url !== null) as unknown as PagePhoto[];

async function page(token: string): Promise<Page | null> {
  const { data, error } = await db.rpc('trade_page', { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const out = data as Page;
  const signed = await signAll(out.items.flatMap((i) => i.photos));
  for (const item of out.items) item.photos = shownPhotos(item.photos, signed);
  return out;
}

async function ownerPage(token: string): Promise<OwnerPage | null> {
  const { data, error } = await db.rpc('owner_page', { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const out = data as OwnerPage;
  const signed = await signAll(out.locations.flatMap((l) => l.done.flatMap((d) => d.photos)));
  for (const l of out.locations) for (const d of l.done) d.photos = shownPhotos(d.photos, signed);
  return out;
}

/** A photo sent from a page, as base64: checked before it goes anywhere. */
function photoOf(body: Record<string, unknown>, field: string): { bytes: Uint8Array; width: number; height: number } {
  const data = typeof body[field] === 'string' ? (body[field] as string) : '';
  const width = typeof body.width === 'number' ? Math.round(body.width) : 0;
  const height = typeof body.height === 'number' ? Math.round(body.height) : 0;
  if (data === '' || data.length > MOST_PHOTO_CHARS || !BASE64.test(data) || width <= 0 || height <= 0) throw new Refused('Send the photo as a JPEG');
  return { bytes: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), width, height };
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
  const { bytes, width, height } = photoOf(body, 'value');
  const { data: folder, error } = await db.rpc('trade_photo_folder', { p_token: token, p_item: item });
  if (error) {
    if (error.code === '42501') throw new Refused(error.message);
    throw error;
  }
  const path = `${String(folder)}/done-${crypto.randomUUID()}.jpg`;
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

/**
 * Something from the owner's page: what they want looked at (their words, where, and a photo, put
 * in the job's folder under the new item's own id), or their sign off. The owner_* functions check
 * the link and everything sent again, and say plainly what is wrong.
 */
async function ownerAnswer(token: string, body: Record<string, unknown>): Promise<string | null> {
  const name = nameOf(body.name);
  const location = typeof body.location === 'string' && UUID.test(body.location) ? body.location.toLowerCase() : null;
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, { p_token: token, ...args });
    if (error) {
      // A link that does not work, a place not on the job, too much at once: said as it is.
      if (error.code === '42501' || error.code === '23514') throw new Refused(error.message);
      throw error;
    }
    return data;
  };
  if (body.action === 'sign-off') {
    await call('owner_sign_off', { p_location: location, p_name: name ?? '' });
    return null;
  }
  if (body.action !== 'add') throw new Refused('That is not something the page can do');
  const words = typeof body.words === 'string' ? body.words.slice(0, 2000) : '';
  const item = crypto.randomUUID();
  let path: string | null = null;
  let size = { width: 0, height: 0 };
  if (typeof body.photo === 'string' && body.photo !== '') {
    const shot = photoOf(body, 'photo');
    const folder = await call('owner_photo_folder', {});
    if (!folder) throw new Refused('This link no longer works. Ask for a new one.');
    path = `${String(folder)}/${item}/owner-${crypto.randomUUID()}.jpg`;
    const { error: upError } = await db.storage.from('photos').upload(path, shot.bytes, { contentType: 'image/jpeg', upsert: false });
    if (upError) throw upError;
    size = { width: shot.width, height: shot.height };
  }
  try {
    await call('owner_add_item', { p_item: item, p_location: location, p_words: words, p_name: name, p_path: path, p_width: path ? size.width : null, p_height: path ? size.height : null });
  } catch (e) {
    // It did not come in: its photo goes too.
    if (path) await db.storage.from('photos').remove([path]);
    throw e;
  }
  return item;
}

// ---------- telling the job's team ----------

/** Expo's push service; a stand-in when the functions are checked on a computer. */
const PUSH_URL = Deno.env.get('EXPO_PUSH_URL') || 'https://exp.host/--/api/v2/push/send';
/** Expo takes at most this many messages at once. */
const PUSH_AT_ONCE = 100;

interface Target {
  token: string;
  job_id: string;
  job_name: string;
}

/**
 * Tells the phones of the job's team (or its company's admins, when nobody is on its team) through
 * Expo, under the job's name; tapping opens the item. A phone Expo no longer knows is forgotten.
 */
async function tell(link: string, line: string, item: string | null): Promise<void> {
  const { data, error } = await db.rpc('push_targets', { p_link: link });
  if (error) throw error;
  const targets = (data ?? []) as Target[];
  const key = Deno.env.get('EXPO_ACCESS_TOKEN');
  const gone: string[] = [];
  for (let k = 0; k < targets.length; k += PUSH_AT_ONCE) {
    const batch = targets.slice(k, k + PUSH_AT_ONCE);
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(
        batch.map((t) => ({ to: t.token, title: t.job_name, body: line, sound: 'default', data: { jobId: t.job_id, ...(item ? { itemId: item } : {}) } })),
      ),
    });
    if (!res.ok) {
      console.error('Telling the team', res.status, (await res.text()).slice(0, 300));
      continue;
    }
    const out = (await res.json()) as { data?: { status?: string; details?: { error?: string } }[] };
    (out.data ?? []).forEach((ticket, i) => {
      if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && batch[i]) gone.push(batch[i].token);
    });
  }
  if (gone.length > 0) {
    const { error: forgetError } = await db.rpc('forget_push_tokens', { p_tokens: gone });
    if (forgetError) console.error('Forgetting the phones Expo no longer knows', forgetError.message);
  }
}

/** Once the page has its answer: telling the team never holds it up, and never fails it. */
function tellAfter(link: string, line: string | null, item: string | null): void {
  if (!line) return;
  const work = tell(link, line, item).catch((e) => console.error('Telling the team', e instanceof Error ? e.message : e));
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work);
}

const UUIDISH = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);

/** What a company did on its page, as the line its job's team is told; nothing for the rest (hours, a photo, taking a mark back). */
function companyNews(body: Record<string, unknown>, p: Page): string | null {
  const company = String((p.company as { name?: unknown } | undefined)?.name ?? '');
  const name = nameOf(body.name);
  const id = UUIDISH(body.item);
  const listed = [...p.items, ...(Array.isArray(p.completed) ? (p.completed as Record<string, unknown>[]) : [])];
  const found = id ? listed.find((i) => String(i.id).toLowerCase() === id) : undefined;
  const title = typeof found?.title === 'string' ? found.title : '';
  if (body.action === 'done' && body.value !== false) return newsLine({ kind: 'done', company, name, item: title });
  if (body.action === 'confirm' && body.value !== false) return newsLine({ kind: 'confirmed', company, name, item: title });
  if (body.action === 'comment' && typeof body.value === 'string' && body.value.trim() !== '') {
    return newsLine({ kind: 'comment', company, name, item: id ? title : null, body: body.value.slice(0, 2000) });
  }
  return null;
}

/** What the owner did on their page, as the line the job's team is told. */
function ownerNews(body: Record<string, unknown>, p: OwnerPage): string | null {
  const name = nameOf(body.name) ?? nameOf(p.owner);
  if (body.action === 'add') return newsLine({ kind: 'owner_added', name, words: typeof body.words === 'string' ? body.words.slice(0, 2000) : '' });
  if (body.action === 'sign-off') {
    const where = UUIDISH(body.location);
    const place = where ? (p.locations as unknown as { id?: unknown; label?: unknown }[]).find((l) => String(l.id).toLowerCase() === where) : undefined;
    return newsLine({ kind: 'owner_signed_off', name, location: typeof place?.label === 'string' ? place.label : null });
  }
  return null;
}

// ---------- the builder's logo ----------

/** The builder's logo for a page, from any of its links; null when it has none. */
async function logoFor(link: string): Promise<string | null> {
  const { data, error } = await db.rpc('page_logo', { p_token: link });
  if (error) {
    console.error('The logo', error.message);
    return null;
  }
  return typeof data === 'string' && data !== '' ? data : null;
}

/** The page's answer, with the logo when the page asked for it. */
async function withLogo<T extends Record<string, unknown>>(shown: T, body: Record<string, unknown>, link: string): Promise<T> {
  if (body.logo === true) (shown as Record<string, unknown>).logo = await logoFor(link);
  return shown;
}

// ---------- a company's page in Spanish ----------

/** How long the page waits for new lines to be translated; the rest are ready next time it opens. */
const TRANSLATE_WAIT_MS = 12_000;

const lineOf = (text: string) => text.replace(/\s+/g, ' ').trim();

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The builder's lines on a company's list: titles, details, what each waits on, checklists and the team's comments. */
function linesOf(p: Page): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = lineOf(v);
    if (t && t.length <= 1000 && /[a-z]/i.test(t)) out.add(t);
  };
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  for (const i of p.items) {
    add(i.title);
    add(i.description);
    for (const w of list(i.waiting_on)) add(w);
    for (const w of list(i.waiting_for)) add(w?.title);
    for (const c of list(i.checklist)) add(c?.text);
    // Words written on a photo.
    for (const ph of list(i.photos)) for (const m of list(ph?.marks)) if (m?.tool === 'text') add(m.text);
  }
  for (const c of list(p.completed)) add(c?.title);
  // The company's own comments are in its own words already.
  for (const m of list(p.comments)) if (m?.from_company !== true) add(m?.body);
  return [...out];
}

/** The builder's company's allowance for Claude this month, for a page nobody signs in to. */
async function orgAllowance(org: string): Promise<Allowance | null> {
  const { data, error } = await db.rpc('org_ai_allowance', { p_org: org });
  if (error || !data || typeof data !== 'object') return null;
  const a = data as Record<string, unknown>;
  return { org, personId: null, limitCents: Number(a.limit_cents) || 0, usedCents: Number(a.used_cents) || 0 };
}

/**
 * Each line of the list in Spanish, by its English: what was translated before, and what is new,
 * asked of Claude once and kept. When Claude is not set up, the allowance is used up or Claude takes
 * too long, a line stays in English this time.
 */
async function spanish(p: Page): Promise<Record<string, string>> {
  const org = typeof p.org === 'string' ? p.org : '';
  const lines = linesOf(p);
  if (!org || lines.length === 0) return {};
  const hashes = await Promise.all(lines.map(sha256));
  const kept = new Map<string, string>();
  for (let k = 0; k < hashes.length; k += 200) {
    const { data, error } = await db.from('translations').select('source_hash, text').eq('org', org).eq('lang', 'es').in('source_hash', hashes.slice(k, k + 200));
    if (error) throw error;
    for (const r of (data ?? []) as { source_hash: string; text: string }[]) kept.set(r.source_hash, r.text);
  }
  const missing = lines.map((text, i) => ({ text, hash: hashes[i]! })).filter((x) => !kept.has(x.hash)).slice(0, TRANSLATE_AT_ONCE);
  if (missing.length > 0 && claudeKey() !== '') {
    const work = (async () => {
      const allowance = await orgAllowance(org);
      if (!allowance || usedUp(allowance)) return;
      const said = await askClaude(allowance, 'translate', {
        model: Deno.env.get('QUICK_MODEL') || CLAUDE_MODELS.quick,
        maxTokens: Math.min(8000, 300 + missing.length * 60),
        content: [{ type: 'text', text: translatePrompt(missing.map((m) => m.text)) }],
      });
      if (said.text === undefined) return;
      const got = readTranslations(said.text, missing.length);
      const rows = missing.flatMap((m, i) => (got[i] ? [{ org, lang: 'es', source_hash: m.hash, text: got[i]! }] : []));
      if (rows.length === 0) return;
      const { error } = await db.from('translations').upsert(rows, { onConflict: 'org,lang,source_hash', ignoreDuplicates: true });
      if (error) console.error('Keeping the translations', error.message);
      for (const r of rows) kept.set(r.source_hash, r.text);
    })().catch((e) => console.error('Translating the list', e instanceof Error ? e.message : e));
    let waited = false;
    await Promise.race([work.then(() => (waited = true)), new Promise((done) => setTimeout(done, TRANSLATE_WAIT_MS))]);
    // Still working: it finishes after the answer, for the next time the page opens.
    if (!waited) (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work);
  }
  const out: Record<string, string> = {};
  lines.forEach((text, i) => {
    const es = kept.get(hashes[i]!);
    if (es) out[text] = es;
  });
  return out;
}

/** The company's page as it now stands, in its language, without what the page has no use for. */
async function shownPage(token: string): Promise<Page | null> {
  const shown = await page(token);
  if (!shown) return null;
  const company = (shown.company ?? {}) as { language?: unknown };
  if (company.language === 'es') shown.translations = await spanish(shown).catch((e) => {
    console.error('Spanish', e instanceof Error ? e.message : e);
    return {};
  });
  delete shown.org;
  return shown;
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
  if (body.action !== 'photo' && body.action !== 'add' && raw.length > 8000) return reply({ error: 'That is too much to send at once' }, 413);
  let token = typeof body.t === 'string' ? body.t.trim().toLowerCase() : '';
  try {
    if (body.o !== undefined) {
      const owner = typeof body.o === 'string' ? body.o.trim().toLowerCase() : '';
      if (!TOKEN.test(owner)) return reply({ error: 'This link does not work. Ask your builder for a new one.' }, 404);
      const answered = body.action && body.action !== 'page';
      const added = answered ? await ownerAnswer(owner, body) : null;
      const shown = await ownerPage(owner);
      if (!shown) return reply({ error: 'This link no longer works. Ask your builder for a new one.' }, 404);
      if (answered) tellAfter(owner, ownerNews(body, shown), added);
      return reply(await withLogo(shown, body, owner));
    }
    if (body.s !== undefined) {
      const station = typeof body.s === 'string' ? body.s.trim().toLowerCase() : '';
      if (!TOKEN.test(station)) return reply({ error: 'This station link does not work. Ask for a new one.' }, 404);
      const company = typeof body.company === 'string' && UUID.test(body.company) ? body.company.toLowerCase() : null;
      if (!company) {
        const { data, error } = await db.rpc('station_page', { p_token: station });
        if (error) throw error;
        if (!data) return reply({ error: 'This station is turned off. Ask for a new link.' }, 404);
        return reply(await withLogo(data as Record<string, unknown>, body, station));
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
    const answered = body.action && body.action !== 'page';
    if (answered) await answer(token, body);
    const shown = await shownPage(token);
    if (!shown) return reply({ error: 'This link no longer works. Ask for a new one.' }, 404);
    if (answered) tellAfter(token, companyNews(body, shown), UUIDISH(body.item));
    // A station is in the house for anyone to tap: the company's links to its other jobs stay off it.
    if (body.s !== undefined) delete shown.other_jobs;
    return reply(await withLogo(shown, body, token));
  } catch (e) {
    if (e instanceof Refused) return reply({ error: e.message }, 403);
    console.error('company-page', e instanceof Error ? e.message : e);
    return reply({ error: 'Something went wrong. Try again in a moment.' }, 500);
  }
});
