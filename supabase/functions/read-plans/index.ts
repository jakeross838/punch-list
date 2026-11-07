// Reads a job's plans with Claude, to set up its locations. The phone puts the plans in the job's
// folder in storage (a PDF, or pictures of the sheets, each whole and in pieces) and sends where they
// are; this checks the caller is switched on at a company with some of this month's allowance for
// Claude left and can see the job, gives Claude a link to each file for a few minutes, and answers
// with Claude's reply as text for the phone to check. The files are taken away once Claude has read
// them, and what the reading cost is counted against the company. The Claude key stays here, as a
// function secret.
//
//   supabase secrets set ANTHROPIC_API_KEY=...   (and optionally PLANS_MODEL)
//   supabase functions deploy read-plans
//
// { check: true } answers whether reading is set up, so the app shows Read the Plans only then.
// The words Claude is asked come from @punch/core: tools/build-functions.mjs writes core.js and
// claude.ts here.

import { allowanceOf, askClaude, callerClient, claudeKey, keptOpen, NO_ANSWER, NOT_SIGNED_IN, reply, serviceClient, USED_UP, usedUp } from './claude.ts';
import { CLAUDE_MODELS, picturesNote, planPrompt } from './core.js';

const MODEL = Deno.env.get('PLANS_MODEL') || CLAUDE_MODELS.sharp;
const BUCKET = 'photos';
/** Claude takes up to 100 pictures at once; a few sheets in pieces is well under. */
const MOST_FILES = 90;
/** How long Claude's links to the files last, in seconds. */
const SIGNED_FOR = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PlanFileIn {
  path: string;
  type: 'pdf' | 'jpeg';
}

/** The request, checked: the job, its files in its own folder, the job's level names and the pieces of each picture. */
function readRequest(body: Record<string, unknown>): { jobId: string; files: PlanFileIn[]; levels: string[]; pieces: number[] } | null {
  const jobId = typeof body.jobId === 'string' && UUID.test(body.jobId) ? body.jobId : null;
  if (!jobId || !Array.isArray(body.files) || body.files.length === 0 || body.files.length > MOST_FILES) return null;
  const folder = `${jobId}/plans/read-`;
  const files: PlanFileIn[] = [];
  for (const f of body.files) {
    const file = f as Partial<PlanFileIn> | null;
    if (!file || typeof file.path !== 'string' || !file.path.startsWith(folder) || file.path.includes('..')) return null;
    if (file.type !== 'pdf' && file.type !== 'jpeg') return null;
    files.push({ path: file.path, type: file.type });
  }
  // One PDF, or pictures: not both.
  const pdfs = files.filter((f) => f.type === 'pdf').length;
  if (pdfs > 1 || (pdfs === 1 && files.length > 1)) return null;
  const levels = (Array.isArray(body.levels) ? body.levels : []).filter((l): l is string => typeof l === 'string').map((l) => l.slice(0, 40)).slice(0, 20);
  const pieces = (Array.isArray(body.pieces) ? body.pieces : []).map((n) => Math.max(0, Math.min(40, Math.floor(Number(n) || 0)))).slice(0, 10);
  return { jobId, files, levels, pieces };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);

  const supabase = callerClient(req);
  const allowance = await allowanceOf(supabase);
  if (!allowance) return reply({ error: NOT_SIGNED_IN }, 403);

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const key = claudeKey();
  if (body.check === true) return reply({ ready: key !== '' });
  if (key === '') return reply({ error: 'Reading the plans is not set up yet' }, 503);

  const request = readRequest(body);
  if (!request) return reply({ error: 'Send the job and the plans in its folder' }, 400);
  const { jobId, files, levels, pieces } = request;

  // Only someone who can see the job reads its plans: its row and its files are theirs to see.
  const { data: job } = await supabase.from('jobs').select('id').eq('id', jobId).maybeSingle();
  if (!job) return reply({ error: 'That job is not one of yours' }, 403);
  // The files go whatever happens next: they are only ever there to be read once.
  const takeAway = async () => {
    const { error } = await serviceClient().storage.from(BUCKET).remove(files.map((f) => f.path));
    if (error) console.error('Taking the plans away', error.message);
  };
  if (usedUp(allowance)) {
    await takeAway();
    return reply({ error: USED_UP, usedUp: true }, 429);
  }
  const { data: signed, error: signing } = await supabase.storage.from(BUCKET).createSignedUrls(
    files.map((f) => f.path),
    SIGNED_FOR,
  );
  if (signing || !signed || signed.some((s) => !s.signedUrl)) return reply({ error: 'The plans did not arrive. Try sending them again' }, 404);

  const pictures = files[0]?.type === 'jpeg';
  const content = [
    ...files.map((f, i) =>
      f.type === 'pdf'
        ? { type: 'document', source: { type: 'url', url: signed[i]!.signedUrl } }
        : { type: 'image', source: { type: 'url', url: signed[i]!.signedUrl } },
    ),
    { type: 'text', text: `${pictures ? `${picturesNote(pieces.length > 0 ? pieces : files.map(() => 0))}\n\n` : ''}${planPrompt({ levels })}` },
  ];

  return keptOpen(async () => {
    const answer = await askClaude(allowance, 'read-plans', { model: MODEL, maxTokens: 8000, content });
    if (answer.text !== undefined) return { text: answer.text };
    return { error: answer.status === 413 || answer.status === 400 ? 'Claude could not take plans this big. Send the floor plan pages on their own' : (answer.error ?? NO_ANSWER) };
  }, takeAway);
});
