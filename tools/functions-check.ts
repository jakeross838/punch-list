// Checks the two functions that ask Claude, ai and read-plans, on this computer, against stand-ins
// for Supabase and for Claude: who they turn away, what they ask Claude and on which model, the
// allowance (nothing is asked once it is used up), what each answer cost counted against the
// company, the connection kept open while Claude works, and, for read-plans, the links Claude gets
// and the files taken away once read.
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
const unknown: string[] = [];

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
}

async function main() {
  await new Promise<void>((done) => stub.listen(STUB, done));
  try {
    await withFunction('ai', checkAi);
    await withFunction('read-plans', checkReadPlans);
  } finally {
    stub.close();
  }
  console.log(steps.map((s) => `  ${s}`).join('\n'));
  if (unknown.length > 0) console.log(`\nAsked of the stand-in but not stood in for:\n${unknown.map((u) => `  ${u}`).join('\n')}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} checks failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nThe functions said:\n${log.slice(-2000)}`);
    process.exit(1);
  }
  console.log(`\nAll ${steps.length} checks of the ai and read-plans functions passed.`);
}

void main();
