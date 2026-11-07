// Checks the read-plans function on this computer, against stand-ins for Supabase and for Claude:
// it says whether reading is set up, turns away a bad request and a job that is not the caller's,
// signs the plans for Claude, keeps the phone's connection open while Claude reads, answers with
// Claude's text, and takes the files away once they are read.
//
//   DENO=/path/to/deno npx tsx tools/read-plans-check.ts      (deno on the PATH works too)

import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const STUB = 4331;
const FN = 8000;
const JOB = '6f1e9a52-1b7d-4a55-9a4e-2f2b0c6d9e01';
const OTHER_JOB = '0b8f2c4a-3e5d-4f60-8a71-9c2d3e4f5a6b';
const GOOD = 'Bearer good-token';

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

let claudeAsked: { model?: string; content?: { type: string; source?: { type: string; url: string }; text?: string }[] } | null = null;
/** What Claude was last asked, read fresh each time. */
const lastAsked = () => claudeAsked;
let removed: string[] = [];
const unknown: string[] = [];

const stub = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${STUB}`);
  const text = await body(req);
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const signedIn = req.headers.authorization === GOOD;
  if (url.pathname === '/rest/v1/rpc/is_active_person') return json(200, signedIn);
  if (url.pathname === '/rest/v1/jobs') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const rows = signedIn && id === JOB ? [{ id }] : [];
    if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return rows.length === 1 ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
    return json(200, rows);
  }
  if (url.pathname === '/storage/v1/object/sign/photos' && req.method === 'POST') {
    const { paths } = JSON.parse(text) as { paths: string[] };
    return json(
      200,
      paths.map((p) => ({ error: null, path: p, signedURL: `/object/sign/photos/${p}?token=signed` })),
    );
  }
  if (url.pathname === '/storage/v1/object/photos' && req.method === 'DELETE') {
    if (req.headers.authorization !== 'Bearer service-key') return json(403, { message: 'not the service role' });
    removed = (JSON.parse(text) as { prefixes: string[] }).prefixes;
    return json(200, removed.map((name) => ({ name })));
  }
  if (url.pathname === '/v1/messages' && req.method === 'POST') {
    if (req.headers['x-api-key'] !== 'test-key') return json(401, { error: 'bad key' });
    const asked = JSON.parse(text) as { model: string; messages: { content: NonNullable<typeof claudeAsked>['content'] }[] };
    claudeAsked = { model: asked.model, content: asked.messages[0]?.content };
    // Slower than the function's keep-open spaces, like reading a real set of plans.
    await new Promise((done) => setTimeout(done, 11_500));
    return json(200, {
      content: [{ type: 'text', text: JSON.stringify({ name: 'Fish Residence', address: '715 North Shore Drive', levels: [{ name: 'Level 1', rooms: [{ name: 'Kitchen', number: '101' }] }], outside: ['Pool'], notes: null }) }],
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

async function main() {
  await new Promise<void>((done) => stub.listen(STUB, done));
  const deno = process.env.DENO ?? 'deno';
  const fn = spawn(deno, ['run', '--allow-net', '--allow-env', '--allow-read', join(root, 'supabase/functions/read-plans/index.ts')], {
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
  let log = '';
  fn.stdout.on('data', (c) => (log += c));
  fn.stderr.on('data', (c) => (log += c));
  try {
    // Up when it answers.
    for (let i = 0; i < 120; i += 1) {
      try {
        await fetch(`http://localhost:${FN}`, { method: 'GET' });
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 500));
      }
    }

    const check = await call({ check: true });
    expect('says reading is set up', check.status === 200 && JSON.parse(check.text).ready === true, check.text);
    const stranger = await call({ check: true }, 'Bearer someone-else');
    expect('turns away someone not signed in at a company', stranger.status === 403, `${stranger.status}`);
    const outside = await call({ jobId: JOB, files: [{ path: `${OTHER_JOB}/plans/read-x.pdf`, type: 'pdf' }] });
    expect("turns away plans outside the job's folder", outside.status === 400, `${outside.status}`);
    const mixed = await call({ jobId: JOB, files: [{ path: `${JOB}/plans/read-a.pdf`, type: 'pdf' }, { path: `${JOB}/plans/read-a-1-0.jpg`, type: 'jpeg' }] });
    expect('turns away a PDF and pictures together', mixed.status === 400, `${mixed.status}`);
    const notMine = await call({ jobId: OTHER_JOB, files: [{ path: `${OTHER_JOB}/plans/read-b.pdf`, type: 'pdf' }] });
    expect('turns away a job that is not the caller’s', notMine.status === 403, `${notMine.status}`);

    const pdf = `${JOB}/plans/read-c.pdf`;
    const read = await call({ jobId: JOB, files: [{ path: pdf, type: 'pdf' }], levels: ['Level 1'], pieces: [] });
    expect('keeps the connection open while Claude reads', read.firstByteMs >= 0 && read.firstByteMs < 11_000 && read.totalMs > 11_000, `first byte ${read.firstByteMs} ms, done ${read.totalMs} ms`);
    let answer: { text?: string } = {};
    try {
      answer = JSON.parse(read.text);
    } catch {
      expect("answers with Claude's text", false, read.text.slice(0, 200));
    }
    expect("answers with Claude's text", typeof answer.text === 'string' && answer.text.includes('Fish Residence'), read.text.slice(-200));
    const doc = claudeAsked?.content?.[0];
    expect('gives Claude a link to the PDF', doc?.type === 'document' && doc.source?.type === 'url' && doc.source.url.includes(`/storage/v1/object/sign/photos/${pdf}`), JSON.stringify(doc));
    const prompt = claudeAsked?.content?.[1]?.text ?? '';
    expect('asks with the words from the core, and the job’s levels', prompt.includes('The plans are attached.') && prompt.includes('The job already has these levels: Level 1.'), prompt.slice(0, 120));
    expect('takes the plans away once read', removed.length === 1 && removed[0] === pdf, JSON.stringify(removed));

    claudeAsked = null;
    const sheets = [0, 1, 2].map((j) => ({ path: `${JOB}/plans/read-d-1-${j}.jpg`, type: 'jpeg' }));
    const pictures = await call({ jobId: JOB, files: sheets, levels: [], pieces: [2] });
    expect('reads pictures of a sheet, whole and in pieces', pictures.status === 200 && lastAsked()?.content?.filter((c) => c.type === 'image').length === 3, pictures.text.slice(0, 120));
    const note = lastAsked()?.content?.[3]?.text ?? '';
    expect('tells Claude what the pictures are', note.startsWith('The plans are attached as pictures of one sheet, in this order. Sheet 1: the whole sheet, then 2 pieces of it'), note.slice(0, 160));
  } finally {
    fn.kill();
    stub.close();
  }
  console.log(steps.map((s) => `  ${s}`).join('\n'));
  if (unknown.length > 0) console.log(`\nAsked of the stand-in but not stood in for:\n${unknown.map((u) => `  ${u}`).join('\n')}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} checks failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nThe function said:\n${log.slice(-2000)}`);
    process.exit(1);
  }
  console.log(`\nAll ${steps.length} checks of the read-plans function passed.`);
}

void main();
