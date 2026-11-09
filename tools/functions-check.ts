// Checks the functions on this computer, against stand-ins for Supabase and for Claude. For the two
// that ask Claude, ai and read-plans: who they turn away, what they ask Claude and on which model,
// the allowance (nothing is asked once it is used up), what each answer cost counted against the
// company, the connection kept open while Claude works, and, for read-plans, the links Claude gets
// and the files taken away once read. For company-page: a done photo from the company's page, into
// the item's folder and onto the item, and what it turns away; the owner's page, what the owner adds
// with its photo, and their sign off; a company's page in Spanish, each line translated once on
// the builder's allowance and kept; and the job's team told on their phones, through a stand-in for
// Expo's push service, when a company or the owner answers. For send-email, through a stand-in for
// Resend: a company's list to its people with the PDF, and an invitation, each worded here and
// answered to whoever sent it; who it turns away; and the day's limit for each company.
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
/** The phones on the job's team, one of which Expo no longer knows; what Expo was asked to send, and the phones forgotten. */
const TEAM_PHONE = 'ExponentPushToken[team-phone-1]';
const OLD_PHONE = 'ExponentPushToken[old-phone-2]';
let pushed: { to: string; title: string; body: string; data: Record<string, unknown>; sound?: string }[] = [];
let forgotten: string[] = [];
let answered: Record<string, unknown>[] = [];
/** The builder's logo, as the stand-in database keeps it, and how often it was asked for. */
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
let logoAsked = 0;
/** Email from the app: who asks (View Only, a superintendent, someone at a company that has sent today's), the company, the person invited, what Resend was given and what was counted. */
const VIEW = 'Bearer view-token';
const SUPER = 'Bearer super-token';
const FULL = 'Bearer full-token';
const VIC = '5a5a5a5a-1111-4111-8111-5a5a5a5a5a5a';
const SAM = '5b5b5b5b-1111-4111-8111-5b5b5b5b5b5b';
const PAT = '5c5c5c5c-1111-4111-8111-5c5c5c5c5c5c';
const RILEY = '5d5d5d5d-1111-4111-8111-5d5d5d5d5d5d';
const GATOR = '5e5e5e5e-1111-4111-8111-5e5e5e5e5e5e';
const PDF = Buffer.from('%PDF-1.7 the list').toString('base64');
let emailed: Record<string, unknown>[] = [];
let emailsCounted: Record<string, unknown>[] = [];

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
    if (who === VIEW) return json(200, { org: 'ross_built', person_id: VIC, limit_cents: 20000, used_cents: 0 });
    if (who === SUPER) return json(200, { org: 'ross_built', person_id: SAM, limit_cents: 20000, used_cents: 0 });
    if (who === FULL) return json(200, { org: 'full_org', person_id: PAT, limit_cents: 2500, used_cents: 0 });
    if (who === SPENT) return json(200, { org: 'gulf_coast', person_id: null, limit_cents: 2500, used_cents: 2500.25 });
    return json(200, null);
  }
  if (/^\/rest\/v1\/rpc\/(trade_|owner_|org_ai_allowance|push_targets|forget_push_tokens)/.test(url.pathname) && who !== 'Bearer service-key') return json(403, { code: '42501', message: 'not the service role' });
  if (url.pathname === '/rest/v1/rpc/push_targets') {
    const a = JSON.parse(text) as { p_link: string };
    if (a.p_link !== LINK && a.p_link !== OWNER) return json(200, []);
    return json(200, [TEAM_PHONE, OLD_PHONE].map((token) => ({ token, job_id: JOB, job_name: 'Smith Residence' })));
  }
  if (url.pathname === '/rest/v1/rpc/page_logo') {
    if (who !== 'Bearer service-key') return json(403, { code: '42501', message: 'not the service role' });
    const a = JSON.parse(text) as { p_token: string };
    logoAsked += 1;
    return json(200, a.p_token === LINK || a.p_token === OWNER ? LOGO : null);
  }
  if (url.pathname === '/rest/v1/rpc/forget_push_tokens') {
    forgotten.push(...(JSON.parse(text) as { p_tokens: string[] }).p_tokens);
    return json(204, null);
  }
  if (/^\/rest\/v1\/rpc\/trade_(comment|confirm|mark_done|set_hours)$/.test(url.pathname)) {
    const a = JSON.parse(text) as Record<string, unknown>;
    if (a.p_token !== LINK || (a.p_item !== null && a.p_item !== ITEM)) return json(403, { code: '42501', message: 'That item is not on this list' });
    answered.push({ fn: url.pathname.slice('/rest/v1/rpc/'.length), ...a });
    return json(200, null);
  }
  if (url.pathname === '/--/api/v2/push/send' && req.method === 'POST') {
    const messages = JSON.parse(text) as typeof pushed;
    if (messages.some((m) => m.body.includes('PUSH-DOWN'))) return json(500, { errors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'down' }] });
    if (messages.some((m) => m.body.includes('SLOW-PUSH'))) await new Promise((done) => setTimeout(done, 4000));
    pushed.push(...messages);
    return json(200, {
      data: messages.map((m) =>
        m.to === OLD_PHONE ? { status: 'error', message: `"${OLD_PHONE}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: crypto.randomUUID() },
      ),
    });
  }
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
  if (url.pathname === '/rest/v1/people' && req.method === 'GET') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const people: Record<string, Record<string, unknown>> = {
      [JAKE]: { name: 'Jake Ross', email: 'jake@rossbuilt.com', role: 'admin', active: true },
      [VIC]: { name: 'Vic Owens', email: 'vic@rossbuilt.com', role: 'view_only', active: true },
      [SAM]: { name: 'Sam Rivera', email: 'sam@rossbuilt.com', role: 'team', active: true },
      [RILEY]: { name: 'Riley Carter', email: 'riley@rossbuilt.com', role: 'team', active: true },
    };
    const theirs = who === FULL ? { [PAT]: { name: 'Pat Lee', email: 'pat@gulfcoast.example', role: 'admin', active: true }, [RILEY]: people[RILEY]! } : who === GOOD || who === VIEW || who === SUPER ? people : {};
    return json(200, id && theirs[id] ? [theirs[id]] : []);
  }
  if (url.pathname === '/rest/v1/orgs' && req.method === 'GET') {
    return json(200, who === FULL ? [{ name: 'Gulf Coast Homes' }] : who === GOOD || who === VIEW || who === SUPER ? [{ name: 'Ross "The Best" Built' }] : []);
  }
  if (url.pathname === '/rest/v1/companies' && req.method === 'GET') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    return json(200, id === GATOR ? [{ name: 'Gator Plumbing' }] : []);
  }
  if (url.pathname === '/rest/v1/company_contacts' && req.method === 'GET') {
    const company = url.searchParams.get('company_id')?.replace(/^eq\./, '');
    const filtered = url.searchParams.get('active') === 'eq.true' && url.searchParams.get('gets_lists') === 'eq.true';
    return json(200, company === GATOR && filtered ? [{ name: 'Dave Lane', email: 'Dave@Gator.example' }, { name: 'Office', email: null }, { name: 'Dave Lane', email: 'dave@gator.example' }] : []);
  }
  if (url.pathname === '/rest/v1/company_links' && req.method === 'GET') {
    const ok = url.searchParams.get('job_id') === `eq.${JOB}` && url.searchParams.get('company_id') === `eq.${GATOR}` && url.searchParams.get('revoked') === 'eq.false';
    return json(200, ok ? [{ token: LINK }] : []);
  }
  if (url.pathname === '/rest/v1/email_sends') {
    if (who !== 'Bearer service-key') return json(403, { message: 'not the service role' });
    if (req.method === 'POST') {
      emailsCounted.push(JSON.parse(text) as Record<string, unknown>);
      res.writeHead(201);
      return res.end();
    }
    const org = url.searchParams.get('org')?.replace(/^eq\./, '');
    return json(200, org === 'full_org' ? [{ recipients: 200 }, { recipients: 100 }] : url.searchParams.get('at')?.startsWith('gte.') ? [{ recipients: 3 }] : []);
  }
  if (url.pathname === '/emails' && req.method === 'POST') {
    if (who !== 'Bearer resend-key') return json(401, { message: 'bad key' });
    const sent = JSON.parse(text) as Record<string, unknown>;
    if (String(sent.subject).includes('Resend Down')) return json(500, { message: 'down' });
    emailed.push(sent);
    return json(200, { id: crypto.randomUUID() });
  }
  if (url.pathname === '/rest/v1/jobs') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const rows = (who === GOOD || who === SPENT || who === VIEW || who === SUPER) && id === JOB ? [{ id, name: 'Smith Residence', address: '1 Main Street' }] : [];
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
      EXPO_PUSH_URL: `http://localhost:${STUB}/--/api/v2/push/send`,
      RESEND_API_KEY: 'resend-key',
      RESEND_BASE_URL: `http://localhost:${STUB}`,
      EMAIL_FROM: 'lists@punchlist.example',
      APP_LINK: 'https://apps.apple.com/app/punch-list',
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

  // Round 4: the find, the day's note and a photo's words.
  const find = await call({ task: 'find', input: { words: 'what is ready for Gator on Level 2', floors: ['Level 2'], locations: ['Kitchen 109'], companies: ['Gator Plumbing'], people: [], waitingOn: [] } });
  const findWords = lastAsked()?.content?.[0]?.text ?? '';
  expect(
    "ai: turns the words into the list's filters on Haiku, from the job's own names",
    find.status === 200 && lastAsked()?.model === 'claude-haiku-5-5' && findWords.includes('They said: "what is ready for Gator on Level 2"') && findWords.includes('Companies: Gator Plumbing'),
    `${find.status} ${lastAsked()?.model} ${findWords.slice(0, 160)}`,
  );
  const note = await call({ task: 'day-note', input: { job: 'Fish', day: 'Sunday, November 8', onSite: [{ name: 'Gator Plumbing', trade: 'Plumbing' }], done: [{ title: 'Set toilet', location: 'Bath 116', by: 'Gator Plumbing' }], added: [], said: [] } });
  const noteWords = lastAsked()?.content?.[0]?.text ?? '';
  expect(
    "ai: writes the end of day note on Sonnet, from the day's work",
    note.status === 200 && lastAsked()?.model === 'claude-sonnet-5-5' && noteWords.includes('end of day note') && noteWords.includes('- Set toilet (Bath 116), by Gator Plumbing'),
    `${note.status} ${lastAsked()?.model} ${noteWords.slice(0, 160)}`,
  );
  const before4 = askedCount;
  const noPicture = await call({ task: 'describe-photo', input: { title: 'Patch drywall', location: 'Living 107' } });
  expect("ai: a photo's words need the photo", noPicture.status === 400 && askedCount === before4, `${noPicture.status}`);
  const described = await call({ task: 'describe-photo', input: { title: 'Patch drywall', location: 'Living 107' }, images: [PHOTO] });
  const pictured = lastAsked()?.content ?? [];
  expect(
    "ai: says what is in a photo on Haiku, with the photo",
    described.status === 200 && lastAsked()?.model === 'claude-haiku-5-5' && pictured[0]?.type === 'image' && (pictured[1]?.text ?? '').includes('"Patch drywall", in Living 107'),
    `${described.status} ${lastAsked()?.model} ${pictured.length}`,
  );

  // Round 5: how to do something, from the app's own help.
  const how = await call({ task: 'how', input: { question: 'How do I send a company its list?' } });
  const howWords = lastAsked()?.content?.[0]?.text ?? '';
  expect(
    "ai: answers how to do something on Haiku, from the app's help alone",
    how.status === 200 && lastAsked()?.model === 'claude-haiku-5-5' && howWords.includes('They asked: "How do I send a company its list?"') && howWords.includes('[send-lists]'),
    `${how.status} ${lastAsked()?.model} ${howWords.slice(0, 120)}`,
  );
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

/** Waits a moment for the phones to be told: the page answers first. */
async function pushes(count: number, ms = 4000): Promise<typeof pushed> {
  const until = Date.now() + ms;
  while (pushed.length < count && Date.now() < until) await new Promise((wait) => setTimeout(wait, 50));
  return pushed;
}
const quiet = () => new Promise((wait) => setTimeout(wait, 600));

async function checkTelling() {
  // A done photo, the hours, Not Done and taking back a confirm tell nobody.
  answered = [];
  added = [];
  const photo = await call({ t: LINK, action: 'photo', item: ITEM, value: Buffer.from('another jpeg').toString('base64'), width: 1600, height: 1200, name: 'Mike' });
  await call({ t: LINK, action: 'hours', item: ITEM, value: 3, name: 'Mike' });
  await call({ t: LINK, action: 'done', item: ITEM, value: false, name: 'Mike' });
  await call({ t: LINK, action: 'confirm', item: ITEM, value: false, name: 'Mike' });
  await quiet();
  expect(
    'company-page: a done photo, the hours, Not Done and taking back a confirm tell nobody',
    photo.status === 200 && added.length === 1 && answered.length === 3 && pushed.length === 0,
    `${photo.status} ${added.length} ${answered.length} ${JSON.stringify(pushed)}`,
  );

  pushed = [];
  forgotten = [];
  const done = await call({ t: LINK, action: 'done', item: ITEM, name: 'Mike' });
  const told = await pushes(2);
  const toTeam = told.find((m) => m.to === TEAM_PHONE);
  expect(
    "company-page: marking work done tells the job's team, under the job's name, in Activity's words",
    done.status === 200 && told.length === 2 && toTeam?.title === 'Smith Residence' && toTeam.body === 'Mike at Gator Plumbing marked Install vanity faucets done.' && toTeam.sound === 'default',
    `${done.status} ${JSON.stringify(told)}`,
  );
  expect('company-page: tapping it opens the item', toTeam?.data?.jobId === JOB && toTeam.data.itemId === ITEM, JSON.stringify(toTeam?.data));
  await quiet();
  expect('company-page: forgets a phone Expo no longer knows', forgotten.length === 1 && forgotten[0] === OLD_PHONE, JSON.stringify(forgotten));

  pushed = [];
  await call({ t: LINK, action: 'confirm', item: ITEM });
  const confirmed = (await pushes(2)).find((m) => m.to === TEAM_PHONE);
  expect('company-page: confirming tells the team', confirmed?.body === 'Gator Plumbing confirmed Install vanity faucets.', JSON.stringify(pushed));

  pushed = [];
  await call({ t: LINK, action: 'comment', item: ITEM, value: 'Coming Tuesday\nmorning', name: 'Mike' });
  const commented = (await pushes(2)).find((m) => m.to === TEAM_PHONE);
  expect('company-page: a comment tells the team what it says', commented?.body === 'Mike at Gator Plumbing commented on Install vanity faucets: Coming Tuesday morning.', JSON.stringify(pushed));

  pushed = [];
  await call({ t: LINK, action: 'comment', value: 'Can we come Friday?', name: 'Mike' });
  const onList = (await pushes(2)).find((m) => m.to === TEAM_PHONE);
  expect('company-page: a comment on the whole list says so, and opens the job', onList?.body === 'Mike at Gator Plumbing commented on the Gator Plumbing list: Can we come Friday?' && onList.data.itemId === undefined && onList.data.jobId === JOB, JSON.stringify(onList));

  pushed = [];
  const slowStarted = Date.now();
  const slow = await call({ t: LINK, action: 'comment', item: ITEM, value: 'SLOW-PUSH note', name: 'Mike' });
  const slowMs = Date.now() - slowStarted;
  const late = await pushes(2, 8000);
  expect('company-page: answers the page before the phones are told', slow.status === 200 && slowMs < 2500 && late.length === 2, `${slow.status} ${slowMs}ms ${late.length}`);

  pushed = [];
  const down = await call({ t: LINK, action: 'comment', item: ITEM, value: 'PUSH-DOWN note', name: 'Mike' });
  await quiet();
  expect("company-page: the page's answer goes through when Expo's service is down", down.status === 200 && pushed.length === 0 && Array.isArray(parsed(down.text).items), `${down.status} ${down.text.slice(0, 120)}`);

  pushed = [];
  const notOn = await call({ t: LINK, action: 'done', item: '22222222-2222-4222-8222-222222222222', name: 'Mike' });
  await quiet();
  expect('company-page: something turned away tells nobody', notOn.status === 403 && pushed.length === 0, `${notOn.status} ${pushed.length}`);

  pushed = [];
  ownerAdded = [];
  await call({ o: OWNER, action: 'add', words: 'Scratch on the pantry door', location: KITCHEN, name: 'Karen' });
  const ownerTold = (await pushes(2)).find((m) => m.to === TEAM_PHONE);
  expect(
    'company-page: what the owner adds tells the team, and opens what came in',
    ownerTold?.body === 'Karen, the owner, added something to look at: Scratch on the pantry door.' && ownerTold.title === 'Smith Residence' && ownerTold.data.itemId === ownerAdded[0]?.p_item && typeof ownerTold.data.itemId === 'string',
    `${JSON.stringify(ownerTold)} ${JSON.stringify(ownerAdded[0]?.p_item)}`,
  );

  pushed = [];
  await call({ o: OWNER, action: 'sign-off', location: KITCHEN, name: 'Karen Lee' });
  const signedTold = (await pushes(2)).find((m) => m.to === TEAM_PHONE);
  expect('company-page: the owner signing off tells the team where', signedTold?.body === 'Karen Lee, the owner, signed off Kitchen 109.' && signedTold.data.itemId === undefined, JSON.stringify(signedTold));

  pushed = [];
  await call({ o: OWNER, action: 'page' });
  await call({ t: LINK, action: 'page' });
  await call({ o: OWNER, action: 'sign-off', name: '' });
  await quiet();
  expect('company-page: opening a page, or an answer turned away, tells nobody', pushed.length === 0, JSON.stringify(pushed));
}

async function checkLogo() {
  logoAsked = 0;
  const plain = await call({ t: LINK, action: 'page' });
  expect('company-page: a page that does not ask for the logo gets none, and the logo is not looked up', parsed(plain.text).logo === undefined && logoAsked === 0, `${plain.text.slice(0, 80)} ${logoAsked}`);
  const company = parsed((await call({ t: LINK, action: 'page', logo: true })).text);
  const owner = parsed((await call({ o: OWNER, action: 'page', logo: true })).text);
  expect("company-page: the company's page and the owner's page get the builder's logo when they open", company.logo === LOGO && owner.logo === LOGO && logoAsked === 2, `${String(company.logo)} ${String(owner.logo)} ${logoAsked}`);
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

async function checkEmail() {
  const check = await call({ check: true });
  expect('send-email: says email is set up', parsed(check.text).ready === true, check.text);
  const nobody = await call({ kind: 'list', jobId: JOB, companyId: GATOR, pdf: PDF }, 'Bearer nobody');
  expect('send-email: turns away someone not signed in at a company', nobody.status === 403 && emailed.length === 0, nobody.text);
  const looking = await call({ kind: 'list', jobId: JOB, companyId: GATOR, pdf: PDF }, VIEW);
  expect('send-email: turns away View Only', looking.status === 403 && emailed.length === 0, looking.text);

  const list = await call({ kind: 'list', jobId: JOB, companyId: GATOR, pdf: PDF, filename: 'Gator Plumbing: List.pdf', ready: 2 });
  const sent = emailed[0] ?? {};
  const text = String(sent.text ?? '');
  expect('send-email: sends a company its list, to its people with an email, once each', list.status === 200 && parsed(list.text).sent === 1 && JSON.stringify(sent.to) === '["dave@gator.example"]', `${list.text} ${JSON.stringify(sent.to)}`);
  expect(
    "send-email: from the company's name at the app's address, answered to whoever sent it",
    sent.from === '"Ross The Best Built" <lists@punchlist.example>' && sent.reply_to === 'jake@rossbuilt.com',
    `${String(sent.from)} ${String(sent.reply_to)}`,
  );
  expect(
    'send-email: the words are made here, with the link to their page and the PDF attached',
    sent.subject === '1 Main Street Completion List' && text.startsWith('Hi Dave,') && text.includes(`https://punch-list.expo.app/c#${LINK}`) && text.includes('Anything marked ready') && text.endsWith('Thanks,\nJake'),
    `${String(sent.subject)} ${text}`,
  );
  const files = (sent.attachments ?? []) as { filename: string; content: string }[];
  expect('send-email: attaches the PDF with a plain name', files.length === 1 && files[0]?.filename === 'Gator Plumbing List.pdf' && files[0]?.content === PDF, JSON.stringify(files.map((f) => f.filename)));
  expect('send-email: counts what it sent against the company', emailsCounted.length === 1 && emailsCounted[0]?.org === 'ross_built' && emailsCounted[0]?.recipients === 1 && emailsCounted[0]?.kind === 'list', JSON.stringify(emailsCounted));

  const other = await call({ kind: 'list', jobId: OTHER_JOB, companyId: GATOR, pdf: PDF });
  const notPdf = await call({ kind: 'list', jobId: JOB, companyId: GATOR, pdf: 'not a pdf!' });
  const nobodyThere = await call({ kind: 'list', jobId: JOB, companyId: '6f6f6f6f-1111-4111-8111-6f6f6f6f6f6f', pdf: PDF });
  const what = await call({ kind: 'anything', to: 'someone@example.com', subject: 'Hello' });
  expect(
    "send-email: sends nothing for a job that is not theirs, a file that is not a PDF, a company that is not theirs, or anything else",
    other.status === 404 && notPdf.status === 400 && nobodyThere.status === 404 && what.status === 400 && emailed.length === 1,
    `${other.status} ${notPdf.status} ${nobodyThere.status} ${what.status}`,
  );

  const invite = await call({ kind: 'invite', personId: RILEY });
  const invited = emailed[1] ?? {};
  expect(
    'send-email: invites someone added under People, with where to get the app and the email to sign in with',
    invite.status === 200 &&
      JSON.stringify(invited.to) === '["riley@rossbuilt.com"]' &&
      String(invited.subject) === 'You are set up on Punch List for Ross "The Best" Built' &&
      String(invited.text).includes('https://apps.apple.com/app/punch-list') &&
      String(invited.text).includes('sign in with riley@rossbuilt.com'),
    `${invite.text} ${String(invited.subject)} ${String(invited.text)}`,
  );
  const bySuper = await call({ kind: 'invite', personId: RILEY }, SUPER);
  expect('send-email: only an admin invites', bySuper.status === 403 && emailed.length === 2, bySuper.text);
  const full = await call({ kind: 'invite', personId: RILEY }, FULL);
  expect("send-email: stops at the day's limit for a company", full.status === 429 && parsed(full.text).usedUp === true && emailed.length === 2, full.text);
}

async function main() {
  await new Promise<void>((done) => stub.listen(STUB, done));
  try {
    await withFunction('ai', checkAi);
    await withFunction('read-plans', checkReadPlans);
    await withFunction('company-page', async () => {
      // Nothing is told while the pages are checked: they answer with photos and owners' adds,
      // and the stand-in for Expo keeps what it is asked from here on.
      await checkCompanyPage();
      await checkOwnerPage();
      pushed = [];
      await checkTelling();
      await checkLogo();
      await checkSpanish();
    });
    await withFunction('send-email', checkEmail);
  } finally {
    stub.close();
  }
  console.log(steps.map((s) => `  ${s}`).join('\n'));
  if (unknown.length > 0) console.log(`\nAsked of the stand-in but not stood in for:\n${unknown.map((u) => `  ${u}`).join('\n')}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} checks failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nThe functions said:\n${log.slice(-2000)}`);
    process.exit(1);
  }
  console.log(`\nAll ${steps.length} checks of the ai, read-plans, company-page and send-email functions passed.`);
}

void main();
