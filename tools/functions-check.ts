// Checks the functions on this computer, against stand-ins for Supabase and for Claude. For the two
// that ask Claude, ai and read-plans: who they turn away, what they ask Claude and on which model,
// the allowance (nothing is asked once it is used up), what each answer cost counted against the
// company, the connection kept open while Claude works, and, for read-plans, the links Claude gets
// and the files taken away once read. For company-page: a done photo from the company's page, into
// the item's folder and onto the item, and what it turns away; the owner's page, what the owner adds
// with its photo, and their sign off; and a company's page in Spanish, each line translated once on
// the builder's allowance and kept.
//
//   DENO=/path/to/deno npx tsx tools/functions-check.ts      (deno on the PATH works too)

import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const STUB = 4331;
const FN = 8000;
const JOB = '6f1e9a52-1b7d-4a55-9a4e-2f2b0c6d9e01';
const OTHER_JOB = '0b8f2c4a-3e5d-4f60-8a71-9c2d3e4f5a6b';
const JAKE = '3d0c8f6e-7a1b-4c2d-9e8f-1a2b3c4d5e6f';
const GOOD = 'Bearer good-token';
/** Someone at a company that has used this month's allowance. */
const SPENT = 'Bearer spent-token';
/** A small JPEG's worth of base64. */
const PHOTO = Buffer.from('a photo of a cabinet door').toString('base64');

const failures: string[] = [];
const steps: string[] = [];
const expect = (name: string, ok: boolean, detail = '') => {
  steps.push(ok ? name : `${name} (FAILED)`);
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

const body = (req: IncomingMessage) =>
  new Promise<string>((done) => {
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => done(text));
  });

interface Asked {
  model?: string;
  max_tokens?: number;
  content?: { type: string; source?: { type: string; url?: string; data?: string; media_type?: string }; text?: string }[];
}
let asked: Asked | null = null;
let askedCount = 0;
/** What Claude was last asked, read fresh each time. */
const lastAsked = (): Asked | null => asked;
let removed: string[] = [];
let counted: Record<string, unknown>[] = [];
/** The company's page, as the stand-in database has it. */
const LINK = 'ab'.repeat(32);
const ITEM = '11111111-1111-4111-8111-111111111111';
let uploaded: { path: string; type: string; size: number }[] = [];
let added: Record<string, unknown>[] = [];
const pagePhotos: Record<string, unknown>[] = [];
const unknown: string[] = [];
/** The owner's link, and what the owner sent. */
const OWNER = 'cd'.repeat(32);
const KITCHEN = '33333333-3333-4333-8333-333333333333';
let ownerAdded: Record<string, unknown>[] = [];
let signedOff: Record<string, unknown>[] = [];
/** A company whose page is in Spanish, and one whose builder has used this month's allowance. */
const SPANISH = 'ef'.repeat(32);
const SPANISH_SPENT = 'fe'.repeat(32);
/** Lines translated before, as the stand-in database keeps them: org|hash to text. */
const translations = new Map<string, string>();
let translateAsked = 0;

const stub = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${STUB}`);
  const text = await body(req);
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const who = req.headers.authorization;
  if (url.pathname === '/rest/v1/rpc/ai_allowance') {
    if (who === GOOD) return json(200, { org: 'ross_built', person_id: JAKE, limit_cents: 20000, used_cents: 12.5 });
    if (who === SPENT) return json(200, { org: 'gulf_coast', person_id: null, limit_cents: 2500, used_cents: 2500.25 });
    return json(200, null);
  }
  if (/^\/rest\/v1\/rpc\/(trade_|owner_|org_ai_allowance)/.test(url.pathname) && who !== 'Bearer service-key') return json(403, { code: '42501', message: 'not the service role' });
  if (url.pathname === '/rest/v1/rpc/org_ai_allowance') {
    const a = JSON.parse(text) as { p_org: string };
    return json(200, { org: a.p_org, limit_cents: 2500, used_cents: a.p_org === 'spent_org' ? 2600 : 40 });
  }
  if (url.pathname === '/rest/v1/rpc/owner_page') {
    const a = JSON.parse(text) as { p_token: string };
    if (a.p_token !== OWNER) return json(200, null);
    return json(200, {
      builder: 'Ross Built',
      job: { name: 'Smith Residence', address: '1 Main Street', closed: false },
      owner: 'Karen',
      locations: [
        {
          id: KITCHEN,
          label: 'Kitchen 109',
          floor: 'Level 1',
          open: [{ id: ITEM, title: 'Install vanity faucets', ready: true, waits_on_owner: false }],
          done: [{ id: 'd1', title: 'Paint walls', completed_at: '2026-11-06T15:00:00Z', photos: [{ storage_path: `${JOB}/d1/done-1.jpg`, width: 1600, height: 1200, marks: [], done: true }] }],
        },
      ],
      added: ownerAdded.map((x) => ({ id: x.p_item, words: x.p_words, title: null, location: 'Kitchen 109', status: 'received', created_at: '2026-11-08T12:00:00Z' })),
      sign_offs: signedOff.map((x) => ({ name: x.p_name, location: x.p_location ? 'Kitchen 109' : null, open: 1, at: '2026-11-08T12:00:00Z' })),
    });
  }
  if (url.pathname === '/rest/v1/rpc/owner_photo_folder') {
    const a = JSON.parse(text) as { p_token: string };
    if (a.p_token !== OWNER) return json(403, { code: '42501', message: 'This link no longer works' });
    return json(200, JOB);
  }
  if (url.pathname === '/rest/v1/rpc/owner_add_item') {
    const a = JSON.parse(text) as Record<string, unknown>;
    if (a.p_token !== OWNER) return json(403, { code: '42501', message: 'This link no longer works' });
    if (String(a.p_words).includes('TOO-MANY')) return json(403, { code: '42501', message: 'That is all that can be added today. Add the rest tomorrow, or call the builder' });
    if (String(a.p_words).trim() === '' && !a.p_path) return json(400, { code: '23514', message: 'Say what to look at, or add a photo' });
    ownerAdded.push(a);
    return json(200, a.p_item);
  }
  if (url.pathname === '/rest/v1/rpc/owner_sign_off') {
    const a = JSON.parse(text) as Record<string, unknown>;
    if (String(a.p_name ?? '').trim().length < 2) return json(400, { code: '23514', message: 'Type your name to sign off' });
    signedOff.push(a);
    return json(204, null);
  }
  if (url.pathname === '/rest/v1/translations' && req.method === 'GET') {
    const org = url.searchParams.get('org')?.replace(/^eq\./, '') ?? '';
    const hashes = (url.searchParams.get('source_hash') ?? '').replace(/^in\.\(|\)$/g, '').split(',').map((h) => h.replace(/"/g, ''));
    return json(200, hashes.flatMap((h) => (translations.has(`${org}|${h}`) ? [{ source_hash: h, text: translations.get(`${org}|${h}`) }] : [])));
  }
  if (url.pathname === '/rest/v1/translations' && req.method === 'POST') {
    if (who !== 'Bearer service-key') return json(403, { message: 'not the service role' });
    for (const r of JSON.parse(text) as { org: string; lang: string; source_hash: string; text: string }[]) {
      if (r.lang === 'es' && /^[0-9a-f]{64}$/.test(r.source_hash) && !translations.has(`${r.org}|${r.source_hash}`)) translations.set(`${r.org}|${r.source_hash}`, r.text);
    }
    res.writeHead(201);
    return res.end();
  }
  if (url.pathname === '/rest/v1/rpc/trade_page') {
    const a = JSON.parse(text) as { p_token: string };
    if (a.p_token === SPANISH || a.p_token === SPANISH_SPENT) {
      return json(200, {
        builder: 'Ross Built',
        org: a.p_token === SPANISH ? 'ross_built' : 'spent_org',
        company: { id: 'c2', name: 'Gulf Tile', language: 'es' },
        items: [
          {
            id: ITEM, title: 'Regrout shower floor', description: 'Corner by the drain,\n2 tiles', waiting_on: ['Owner'], waiting_for: [], checklist: [{ id: 'k1', text: 'Seal the grout', done: false }],
            photos: [{ storage_path: `${JOB}/${ITEM}/a.jpg`, width: 1200, height: 900, marks: [{ tool: 'text', color: 'red', at: [0.5, 0.5], text: 'Cracked here' }, { tool: 'measure', color: 'red', from: [0, 0], to: [1, 1], text: '36"' }] }],
          },
        ],
        comments: [
          { id: 'm1', item_id: ITEM, body: 'Use the gray grout', from_company: false },
          { id: 'm2', item_id: ITEM, body: 'Lo hacemos el lunes', from_company: true },
        ],
        completed: [{ id: 'x1', title: 'Set shower pan', location: 'Bath 116', completed_at: '2026-11-06T15:00:00Z' }],
      });
    }
    if (a.p_token !== LINK) return json(200, null);
    return json(200, { builder: 'Ross Built', company: { id: 'c1', name: 'Gator Plumbing' }, items: [{ id: ITEM, title: 'Install vanity faucets', photos: pagePhotos }], comments: [], completed: [] });
  }
  if (url.pathname === '/rest/v1/rpc/trade_photo_folder') {
    const a = JSON.parse(text) as { p_token: string; p_item: string };
    if (a.p_token !== LINK || a.p_item !== ITEM) return json(403, { code: '42501', message: 'That item is not on this list' });
    return json(200, `${JOB}/${ITEM}`);
  }
  if (url.pathname === '/rest/v1/rpc/trade_add_photo') {
    const a = JSON.parse(text) as Record<string, unknown>;
    if (a.p_name === 'Full Up') return json(403, { code: '42501', message: 'That item has all the photos it can take' });
    added.push(a);
    pagePhotos.push({ storage_path: a.p_path, width: a.p_width, height: a.p_height, marks: [], done: true });
    return json(200, 'p-new');
  }
  if (url.pathname.startsWith('/storage/v1/object/photos/') && req.method === 'POST') {
    if (who !== 'Bearer service-key') return json(403, { message: 'not the service role' });
    const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/photos/'.length));
    uploaded.push({ path, type: String(req.headers['content-type'] ?? ''), size: text.length });
    return json(200, { Key: `photos/${path}` });
  }
  if (url.pathname === '/rest/v1/jobs') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const rows = (who === GOOD || who === SPENT) && id === JOB ? [{ id }] : [];
    if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return rows.length === 1 ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
    return json(200, rows);
  }
  if (url.pathname === '/rest/v1/ai_usage' && req.method === 'POST') {
    if (who !== 'Bearer service-key') return json(403, { message: 'not the service role' });
    const row = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[];
    counted.push(...(Array.isArray(row) ? row : [row]));
    res.writeHead(201);
    return res.end();
  }
  if (url.pathname === '/storage/v1/object/sign/photos' && req.method === 'POST') {
    const { paths } = JSON.parse(text) as { paths: string[] };
    return json(
      200,
      paths.map((p) => ({ error: null, path: p, signedURL: `/object/sign/photos/${p}?token=signed` })),
    );
  }
  if (url.pathname === '/storage/v1/object/photos' && req.method === 'DELETE') {
    if (who !== 'Bearer service-key') return json(403, { message: 'not the service role' });
    removed = (JSON.parse(text) as { prefixes: string[] }).prefixes;
    return json(200, removed.map((name) => ({ name })));
  }
  if (url.pathname === '/v1/messages' && req.method === 'POST') {
    if (req.headers['x-api-key'] !== 'test-key') return json(401, { error: 'bad key' });
    const a = JSON.parse(text) as { model: string; max_tokens: number; messages: { content: NonNullable<Asked['content']> }[] };
    asked = { model: a.model, max_tokens: a.max_tokens, content: a.messages[0]?.content };
    askedCount += 1;
    const words = (asked.content ?? []).map((c) => c.text ?? '').join(' ');
    if (words.includes('CLAUDE-FAILS')) return json(500, { error: { type: 'api_error' } });
    if (words.includes("Translate these lines from a home builder's running list")) {
      translateAsked += 1;
      const lines = [...words.matchAll(/^\d+\. (.*)$/gm)].map((m) => `ES ${m[1]}`);
      return json(200, { model: `${a.model}-20260928`, content: [{ type: 'text', text: JSON.stringify({ es: lines }) }], usage: { input_tokens: 400, output_tokens: 120 } });
    }
    // Slower than the keep-open spaces: reading a real set of plans, or a long walk said at once.
    if (words.includes('The plans are attached') || words.includes('TAKES-A-WHILE')) await new Promise((done) => setTimeout(done, 11_500));
    const answer = words.includes('The plans are attached')
      ? { name: 'Fish Residence', address: '715 North Shore Drive', levels: [{ name: 'Level 1', rooms: [{ name: 'Kitchen', number: '101' }] }], outside: ['Pool'], notes: null }
      : words.includes('Is it the same work')
        ? { same: 4 }
        : { title: 'Adjust cabinet door', description: 'Upper left door rubs the frame.', company: 'SMS Carpentry', trade: 'Carpentry', others: [] };
    return json(200, {
      model: `${a.model}-20260928`,
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    });
  }
  unknown.push(`${req.method} ${url.pathname}${url.search}`);
  return json(404, { message: 'not stood in for' });
});

async function call(payload: unknown, auth = GOOD): Promise<{ status: number; text: string; firstByteMs: number; totalMs: number }> {
  const started = Date.now();
  const res = await fetch(`http://localhost:${FN}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  let firstByteMs = -1;
  let text = '';
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstByteMs < 0) firstByteMs = Date.now() - started;
    text += decoder.decode(value, { stream: true });
  }
  return { status: res.status, text, firstByteMs, totalMs: Date.now() - started };
}

const parsed = (text: string): Record<string, unknown> => {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
};

let log = '';

/** Runs one function until done checks it, then stops it. */
async function withFunction(name: string, done: () => Promise<void>): Promise<void> {
  const deno = process.env.DENO ?? 'deno';
  const fn = spawn(deno, ['run', '--allow-net', '--allow-env', '--allow-read', join(root, `supabase/functions/${name}/index.ts`)], {
    env: {
      ...process.env,
      DENO_DIR: process.env.DENO_DIR ?? '/tmp/deno-cache',
      SUPABASE_URL: `http://localhost:${STUB}`,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: `http://localhost:${STUB}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  fn.stdout.on('data', (c) => (log += c));
  fn.stderr.on('data', (c) => (log += c));
  try {
    // Up when it answers.
    for (let i = 0; i < 120; i += 1) {
      try {
        await fetch(`http://localhost:${FN}`, { method: 'GET' });
        break;
      } catch {
        await new Promise((wait) => setTimeout(wait, 500));
      }
    }
    await done();
  } finally {
    fn.kill();
    await new Promise((wait) => fn.once('exit', wait));
  }
}

async function checkAi() {
  const check = await call({ check: true });
  const c = parsed(check.text);
  expect('ai: says Claude is set up, with the allowance and what is used', check.status === 200 && c.ready === true && c.used === 12.5 && c.limit === 20000, check.text);
  const stranger = await call({ check: true }, 'Bearer someone-else');
  expect('ai: turns away someone not signed in at a company', stranger.status === 403, `${stranger.status}`);
  const poem = await call({ task: 'write-a-poem', input: {} });
  expect('ai: asks only the app’s own tasks', poem.status === 400, `${poem.status}`);
  const before = askedCount;
  const noPhoto = await call({ task: 'fill-in', input: { room: 'Kitchen 109' } });
  expect('ai: Fill In needs its photo', noPhoto.status === 400, `${noPhoto.status}`);
  const notPhoto = await call({ task: 'fill-in', input: { room: 'Kitchen 109' }, images: ['<script>not a photo</script>'] });
  expect('ai: turns away a photo that is not one', notPhoto.status === 400, `${notPhoto.status}`);
  const tooMany = await call({ task: 'same-item', input: { item: { title: 'Install towel bar' }, candidates: [{ n: 4, title: 'Towel bar' }] }, images: Array(7).fill(PHOTO) });
  expect('ai: turns away more photos than the task takes', tooMany.status === 400, `${tooMany.status}`);
  const onePhoto = await call({ task: 'done-check', input: { title: 'Adjust cabinet door' }, images: [PHOTO] });
  expect('ai: the done check needs both photos', onePhoto.status === 400, `${onePhoto.status}`);
  const nothing = await call({ task: 'say-it', input: { words: '   ' } });
  expect('ai: does not ask about nothing', nothing.status === 400, `${nothing.status}`);
  const spent = await call({ task: 'fill-in', input: { room: 'Kitchen 109' }, images: [PHOTO] }, SPENT);
  expect('ai: asks nothing once the month’s allowance is used', spent.status === 429 && parsed(spent.text).usedUp === true, spent.text);
  expect('ai: none of those reached Claude', askedCount === before, `${askedCount - before} reached it`);

  counted = [];
  const fill = await call({ task: 'fill-in', input: { room: 'Kitchen 109', words: 'cabinet door rubs', companies: [{ name: 'SMS Carpentry', trade: 'Carpentry' }], trades: ['Carpentry'], titles: [], marks: [] }, images: [PHOTO] });
  const filled = parsed(fill.text);
  expect('ai: answers Fill In with Claude’s text', fill.status === 200 && typeof filled.text === 'string' && (filled.text as string).includes('Adjust cabinet door'), fill.text.slice(0, 200));
  const photo = lastAsked()?.content?.[0];
  expect('ai: sends the photo to Claude as a JPEG', photo?.type === 'image' && photo.source?.type === 'base64' && photo.source.media_type === 'image/jpeg' && photo.source.data === PHOTO, JSON.stringify(photo).slice(0, 200));
  const words = lastAsked()?.content?.[1]?.text ?? '';
  expect('ai: asks in the core’s words, with what they said', words.includes('The photo was taken in Kitchen 109.') && words.includes('They also said or typed: "cabinet door rubs"'), words.slice(0, 200));
  expect('ai: asks Fill In of Sonnet, with room for several items', lastAsked()?.model === 'claude-sonnet-5-5' && lastAsked()?.max_tokens === 900, `${lastAsked()?.model} ${lastAsked()?.max_tokens}`);
  const row = counted[0] ?? {};
  expect(
    'ai: counts what the answer cost against the company',
    counted.length === 1 && row.org === 'ross_built' && row.person_id === JAKE && row.task === 'fill-in' && row.model === 'claude-sonnet-5-5-20260928' && row.input_tokens === 1200 && row.output_tokens === 300 && row.cost_cents === 0.54,
    JSON.stringify(counted),
  );

  counted = [];
  const same = await call({ task: 'same-item', input: { item: { title: 'Towel bar loose', location: 'Hall Bath' }, candidates: [{ n: 4, title: 'Tighten towel bar', location: 'Hall Bath' }], photos: true }, images: [PHOTO, PHOTO] });
  expect('ai: asks the quick questions of Haiku', same.status === 200 && lastAsked()?.model === 'claude-haiku-5-5' && lastAsked()?.max_tokens === 100, `${lastAsked()?.model}`);
  expect('ai: counts Haiku at Haiku’s price', counted.length === 1 && counted[0]?.cost_cents === 0.027, JSON.stringify(counted));

  const checked = await call({ task: 'done-check', input: { title: 'Adjust cabinet door', location: 'Kitchen 109', marks: [] }, images: [PHOTO, PHOTO] });
  const both = lastAsked()?.content ?? [];
  expect(
    'ai: the done check sends the photo of the problem, then the done photo, to Sonnet',
    checked.status === 200 && both.length === 3 && both[0]?.type === 'image' && both[1]?.type === 'image' && lastAsked()?.model === 'claude-sonnet-5-5' && (both[2]?.text ?? '').includes('photo of the finished work'),
    `${checked.status} ${both.length} ${lastAsked()?.model}`,
  );

  const slow = await call({ task: 'say-it', input: { words: 'TAKES-A-WHILE touch up the paint in the hall and the cabinet door rubs', locations: ['Hall'], companies: [], people: [], titles: [] } });
  expect('ai: keeps the connection open while Claude works', slow.firstByteMs >= 0 && slow.firstByteMs < 11_000 && slow.totalMs > 11_000 && typeof parsed(slow.text).text === 'string', `first byte ${slow.firstByteMs} ms, done ${slow.totalMs} ms`);

  counted = [];
  const fails = await call({ task: 'say-it', input: { words: 'CLAUDE-FAILS hang the mirror' } });
  expect('ai: says so when Claude does not answer, and counts nothing', parsed(fails.text).error === 'Claude did not answer. Try again in a minute' && counted.length === 0, fails.text);
}

async function checkReadPlans() {
  const check = await call({ check: true });
  expect('read-plans: says reading is set up', check.status === 200 && parsed(check.text).ready === true, check.text);
  const stranger = await call({ check: true }, 'Bearer someone-else');
  expect('read-plans: turns away someone not signed in at a company', stranger.status === 403, `${stranger.status}`);
  const outside = await call({ jobId: JOB, files: [{ path: `${OTHER_JOB}/plans/read-x.pdf`, type: 'pdf' }] });
  expect("read-plans: turns away plans outside the job's folder", outside.status === 400, `${outside.status}`);
  const mixed = await call({ jobId: JOB, files: [{ path: `${JOB}/plans/read-a.pdf`, type: 'pdf' }, { path: `${JOB}/plans/read-a-1-0.jpg`, type: 'jpeg' }] });
  expect('read-plans: turns away a PDF and pictures together', mixed.status === 400, `${mixed.status}`);
  const notMine = await call({ jobId: OTHER_JOB, files: [{ path: `${OTHER_JOB}/plans/read-b.pdf`, type: 'pdf' }] });
  expect('read-plans: turns away a job that is not the caller’s', notMine.status === 403, `${notMine.status}`);

  removed = [];
  const spentPdf = `${JOB}/plans/read-s.pdf`;
  const spent = await call({ jobId: JOB, files: [{ path: spentPdf, type: 'pdf' }] }, SPENT);
  expect('read-plans: reads nothing once the month’s allowance is used, and takes the plans away', spent.status === 429 && removed[0] === spentPdf, `${spent.status} ${JSON.stringify(removed)}`);

  counted = [];
  removed = [];
  const pdf = `${JOB}/plans/read-c.pdf`;
  const read = await call({ jobId: JOB, files: [{ path: pdf, type: 'pdf' }], levels: ['Level 1'], pieces: [] });
  expect('read-plans: keeps the connection open while Claude reads', read.firstByteMs >= 0 && read.firstByteMs < 11_000 && read.totalMs > 11_000, `first byte ${read.firstByteMs} ms, done ${read.totalMs} ms`);
  const answer = parsed(read.text);
  expect("read-plans: answers with Claude's text", typeof answer.text === 'string' && (answer.text as string).includes('Fish Residence'), read.text.slice(-200));
  const doc = lastAsked()?.content?.[0];
  expect('read-plans: gives Claude a link to the PDF', doc?.type === 'document' && doc.source?.type === 'url' && (doc.source.url ?? '').includes(`/storage/v1/object/sign/photos/${pdf}`), JSON.stringify(doc));
  const prompt = lastAsked()?.content?.[1]?.text ?? '';
  expect('read-plans: asks with the words from the core, and the job’s levels', prompt.includes('The plans are attached.') && prompt.includes('The job already has these levels: Level 1.'), prompt.slice(0, 120));
  expect('read-plans: takes the plans away once read', removed.length === 1 && removed[0] === pdf, JSON.stringify(removed));
  expect('read-plans: counts what the reading cost', counted.length === 1 && counted[0]?.task === 'read-plans' && counted[0]?.org === 'ross_built' && counted[0]?.cost_cents === 0.54, JSON.stringify(counted));

  const sheets = [0, 1, 2].map((j) => ({ path: `${JOB}/plans/read-d-1-${j}.jpg`, type: 'jpeg' }));
  const pictures = await call({ jobId: JOB, files: sheets, levels: [], pieces: [2] });
  expect('read-plans: reads pictures of a sheet, whole and in pieces', pictures.status === 200 && lastAsked()?.content?.filter((c) => c.type === 'image').length === 3, pictures.text.slice(0, 120));
  const note = lastAsked()?.content?.[3]?.text ?? '';
  expect('read-plans: tells Claude what the pictures are', note.startsWith('The plans are attached as pictures of one sheet, in this order. Sheet 1: the whole sheet, then 2 pieces of it'), note.slice(0, 160));

  // A punch list someone else wrote: its pages, with the job's names to match.
  counted = [];
  removed = [];
  const pages = [1, 2].map((n) => ({ path: `${JOB}/plans/read-e-${n}-0.jpg`, type: 'jpeg' }));
  const list = await call({ kind: 'list', jobId: JOB, files: pages, input: { locations: ['Kitchen 109'], companies: [{ name: 'SMS Carpentry', trade: 'Carpentry' }], people: ['Sam Rivera'], titles: [] } });
  const listWords = lastAsked()?.content?.[2]?.text ?? '';
  expect(
    'read-plans: reads a punch list, its pages in order, with the job’s locations and companies',
    list.status === 200 && listWords.startsWith('This is a punch list for a house being built') && listWords.includes('pictures of 2 pages, in order') && listWords.includes('- Kitchen 109') && listWords.includes('- SMS Carpentry (Carpentry)'),
    listWords.slice(0, 200),
  );
  expect('read-plans: counts reading a list as its own task, and takes the pages away', counted[0]?.task === 'read-list' && removed.length === 2, `${JSON.stringify(counted)} ${JSON.stringify(removed)}`);
}

async function checkCompanyPage() {
  const jpeg = Buffer.from('a jpeg of the finished faucets').toString('base64');
  const page = await call({ t: LINK, action: 'page' });
  expect('company-page: opens the page for its link', page.status === 200 && Array.isArray(parsed(page.text).items), page.text.slice(0, 120));
  const big = await call({ t: LINK, action: 'comment', item: ITEM, value: 'x'.repeat(9000) });
  expect('company-page: turns away anything big but a photo', big.status === 413, `${big.status}`);
  const notJpeg = await call({ t: LINK, action: 'photo', item: ITEM, value: '<b>not a photo</b>', width: 1600, height: 1200 });
  const noSize = await call({ t: LINK, action: 'photo', item: ITEM, value: jpeg, width: 0, height: 1200 });
  const notTheirs = await call({ t: LINK, action: 'photo', item: '22222222-2222-4222-8222-222222222222', value: jpeg, width: 1600, height: 1200 });
  expect(
    'company-page: turns away a photo that is not a JPEG, has no size, or is for an item not on the list',
    notJpeg.status === 403 && noSize.status === 403 && notTheirs.status === 403 && parsed(notTheirs.text).error === 'That item is not on this list' && uploaded.length === 0,
    `${notJpeg.status} ${noSize.status} ${notTheirs.status} ${uploaded.length}`,
  );

  uploaded = [];
  added = [];
  const sent = await call({ t: LINK, action: 'photo', item: ITEM, value: jpeg, width: 1600, height: 1200, name: 'Mike' });
  const up = uploaded[0];
  expect(
    "company-page: puts a done photo in the item's own folder, as a JPEG",
    sent.status === 200 && uploaded.length === 1 && !!up && new RegExp(`^${JOB}/${ITEM}/done-[0-9a-f-]{36}\\.jpg$`).test(up.path) && up.type === 'image/jpeg',
    JSON.stringify(uploaded),
  );
  const onItem = added[0] ?? {};
  expect('company-page: then puts it on the item, with its size and who sent it', onItem.p_path === up?.path && onItem.p_width === 1600 && onItem.p_height === 1200 && onItem.p_name === 'Mike' && onItem.p_token === LINK, JSON.stringify(added));
  const shown = (parsed(sent.text).items as { photos: { done: boolean; url: string }[] }[] | undefined)?.[0]?.photos ?? [];
  expect('company-page: answers with the page, the done photo signed and marked done', shown.length === 1 && shown[0]?.done === true && shown[0].url.includes('/sign/photos/'), JSON.stringify(shown));

  removed = [];
  uploaded = [];
  const full = await call({ t: LINK, action: 'photo', item: ITEM, value: jpeg, width: 1600, height: 1200, name: 'Full Up' });
  expect(
    'company-page: takes the file away again when the photo cannot go on the item',
    full.status === 403 && parsed(full.text).error === 'That item has all the photos it can take' && uploaded.length === 1 && removed[0] === uploaded[0]?.path,
    `${full.status} ${JSON.stringify(removed)}`,
  );
}

async function checkOwnerPage() {
  const shown = await call({ o: OWNER, action: 'page' });
  const page = parsed(shown.text) as { owner?: string; locations?: { done: { photos: { url: string; storage_path?: string }[] }[] }[] };
  const photo = page.locations?.[0]?.done[0]?.photos[0];
  expect("company-page: opens the owner's page, its finished work's photos signed", shown.status === 200 && page.owner === 'Karen' && !!photo?.url.includes('/sign/photos/') && photo.storage_path === undefined, shown.text.slice(0, 200));
  const wrong = await call({ o: 'not-a-link', action: 'page' });
  const gone = await call({ o: '12'.repeat(32), action: 'page' });
  expect("company-page: turns away an owner's link that does not work", wrong.status === 404 && gone.status === 404 && /Ask your builder/.test(parsed(gone.text).error as string), `${wrong.status} ${gone.status}`);

  uploaded = [];
  ownerAdded = [];
  const jpeg = Buffer.from('a jpeg of a scratch on the pantry door').toString('base64');
  const sent = await call({ o: OWNER, action: 'add', words: 'Scratch on the pantry door', location: KITCHEN, photo: jpeg, width: 1200, height: 900, name: 'Karen' });
  const up = uploaded[0];
  const a = ownerAdded[0] ?? {};
  expect(
    "company-page: puts the owner's photo in the job's folder, under the new item's own id",
    sent.status === 200 && uploaded.length === 1 && !!up && new RegExp(`^${JOB}/${String(a.p_item)}/owner-[0-9a-f-]{36}\\.jpg$`).test(up.path) && up.type === 'image/jpeg',
    `${sent.status} ${JSON.stringify(uploaded)} ${JSON.stringify(a)}`,
  );
  expect(
    'company-page: then adds what the owner sent, with their words, the place, the photo and their name',
    a.p_words === 'Scratch on the pantry door' && a.p_location === KITCHEN && a.p_path === up?.path && a.p_width === 1200 && a.p_height === 900 && a.p_name === 'Karen' && a.p_token === OWNER,
    JSON.stringify(a),
  );
  expect("company-page: answers with the owner's page, showing what they sent", ((parsed(sent.text).added as unknown[]) ?? []).length === 1, sent.text.slice(0, 200));

  const words = await call({ o: OWNER, action: 'add', words: 'Garage remote', location: 'not-a-place', name: 'Karen' });
  expect('company-page: takes words alone, and no place when the place is not one', words.status === 200 && ownerAdded[1]?.p_location === null && ownerAdded[1]?.p_path === null, JSON.stringify(ownerAdded[1]));

  removed = [];
  uploaded = [];
  const tooMany = await call({ o: OWNER, action: 'add', words: 'TOO-MANY things', photo: jpeg, width: 1200, height: 900, name: 'Karen' });
  expect(
    'company-page: says why something did not come in, and takes its photo away again',
    tooMany.status === 403 && /all that can be added today/.test(parsed(tooMany.text).error as string) && uploaded.length === 1 && removed[0] === uploaded[0]?.path,
    `${tooMany.status} ${tooMany.text.slice(0, 160)} ${JSON.stringify(removed)}`,
  );
  const nothing = await call({ o: OWNER, action: 'add', words: '   ', name: 'Karen' });
  expect('company-page: says plainly when nothing was sent', nothing.status === 403 && parsed(nothing.text).error === 'Say what to look at, or add a photo', nothing.text);

  const signed = await call({ o: OWNER, action: 'sign-off', name: 'Karen Lee' });
  const room = await call({ o: OWNER, action: 'sign-off', location: KITCHEN, name: 'Karen Lee' });
  const unnamed = await call({ o: OWNER, action: 'sign-off', name: '' });
  expect(
    'company-page: signs off the job or one place under the name typed, and asks for a name',
    signed.status === 200 && room.status === 200 && signedOff[0]?.p_location === null && signedOff[1]?.p_location === KITCHEN && signedOff[0]?.p_name === 'Karen Lee' && unnamed.status === 403 && parsed(unnamed.text).error === 'Type your name to sign off',
    `${signed.status} ${room.status} ${unnamed.status} ${JSON.stringify(signedOff)}`,
  );
  const odd = await call({ o: OWNER, action: 'delete-everything' });
  expect("company-page: does only what the owner's page does", odd.status === 403, `${odd.status}`);
}

async function checkSpanish() {
  counted = [];
  translateAsked = 0;
  const first = await call({ t: SPANISH, action: 'page' });
  const page = parsed(first.text) as { translations?: Record<string, string>; org?: string };
  const es = page.translations ?? {};
  const askedWith = lastAsked();
  expect(
    "company-page: translates the builder's lines into Spanish on the quick model, the company's own comments left as they are",
    first.status === 200 &&
      es['Regrout shower floor'] === 'ES Regrout shower floor' &&
      es['Corner by the drain, 2 tiles'] === 'ES Corner by the drain, 2 tiles' &&
      es['Use the gray grout'] === 'ES Use the gray grout' &&
      es['Seal the grout'] === 'ES Seal the grout' &&
      es['Owner'] === 'ES Owner' &&
      es['Set shower pan'] === 'ES Set shower pan' &&
      es['Cracked here'] === 'ES Cracked here' &&
      es['36"'] === undefined &&
      es['Lo hacemos el lunes'] === undefined &&
      !!askedWith?.model?.includes('haiku'),
    `${first.status} ${JSON.stringify(es)} ${askedWith?.model}`,
  );
  expect("company-page: counts the translating against the builder's allowance, and keeps the builder's id to itself", counted.length === 1 && counted[0]?.task === 'translate' && counted[0]?.org === 'ross_built' && counted[0]?.person_id === null && page.org === undefined, JSON.stringify(counted));
  const again = await call({ t: SPANISH, action: 'page' });
  expect('company-page: translates each line once, and uses it again', translateAsked === 1 && (parsed(again.text).translations as Record<string, string>)?.['Regrout shower floor'] === 'ES Regrout shower floor', `${translateAsked}`);
  const spent = await call({ t: SPANISH_SPENT, action: 'page' });
  expect('company-page: shows the list in English when the allowance is used up', spent.status === 200 && translateAsked === 1 && Object.keys((parsed(spent.text).translations as object) ?? { x: 1 }).length === 0, spent.text.slice(0, 200));
  const english = await call({ t: LINK, action: 'page' });
  expect('company-page: asks nothing for a company in English', parsed(english.text).translations === undefined && translateAsked === 1, english.text.slice(0, 120));
}

async function main() {
  await new Promise<void>((done) => stub.listen(STUB, done));
  try {
    await withFunction('ai', checkAi);
    await withFunction('read-plans', checkReadPlans);
    await withFunction('company-page', async () => {
      await checkCompanyPage();
      await checkOwnerPage();
      await checkSpanish();
    });
  } finally {
    stub.close();
  }
  console.log(steps.map((s) => `  ${s}`).join('\n'));
  if (unknown.length > 0) console.log(`\nAsked of the stand-in but not stood in for:\n${unknown.map((u) => `  ${u}`).join('\n')}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} checks failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nThe functions said:\n${log.slice(-2000)}`);
    process.exit(1);
  }
  console.log(`\nAll ${steps.length} checks of the ai, read-plans and company-page functions passed.`);
}

void main();
