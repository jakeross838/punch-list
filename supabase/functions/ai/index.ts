// Claude's work in the app, on the app's key. The phone names one of the tasks in @punch/core and
// sends its input, with a photo or a few when the task takes them; this checks the caller is
// switched on at a company with some of this month's allowance left, builds the words from the
// core (so nothing else can be asked on the key), asks Claude and answers with Claude's text for the
// phone to check. What each answer cost is counted against the company.
//
//   supabase secrets set ANTHROPIC_API_KEY=...   (and optionally QUICK_MODEL and SHARP_MODEL)
//   supabase functions deploy ai
//
// { check: true } answers whether Claude is set up, and the allowance and what is used of it, in
// cents. tools/build-functions.mjs writes core.js and claude.ts here.

import { allowanceOf, askClaude, callerClient, claudeKey, keptOpen, NOT_SIGNED_IN, reply, USED_UP, usedUp } from './claude.ts';
import { CLAUDE_MODELS, CLAUDE_TASKS, isClaudeTask, taskPrompt } from './core.js';

/** A task as the core describes it (core.js is plain JavaScript). */
interface Task {
  tier: 'quick' | 'sharp';
  maxTokens: number;
  images: number;
  minImages: number;
  enough(input: unknown): boolean;
}
const TASKS = CLAUDE_TASKS as Record<string, Task>;

const MODELS: Record<Task['tier'], string> = {
  quick: Deno.env.get('QUICK_MODEL') || CLAUDE_MODELS.quick,
  sharp: Deno.env.get('SHARP_MODEL') || CLAUDE_MODELS.sharp,
};
/** A photo as the phone sends it, in base64: a few hundred kilobytes, well under this. */
const MOST_IMAGE_CHARS = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);

  const allowance = await allowanceOf(callerClient(req));
  if (!allowance) return reply({ error: NOT_SIGNED_IN }, 403);

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const key = claudeKey();
  if (body.check === true) return reply({ ready: key !== '', used: allowance.usedCents, limit: allowance.limitCents });
  if (key === '') return reply({ error: 'Claude is not set up yet' }, 503);

  const task = typeof body.task === 'string' && isClaudeTask(body.task) ? body.task : null;
  if (!task) return reply({ error: "Name one of the app's tasks" }, 400);
  const spec = TASKS[task]!;
  const images = Array.isArray(body.images) ? body.images : [];
  if (
    images.length < spec.minImages ||
    images.length > spec.images ||
    images.some((i) => typeof i !== 'string' || i.length === 0 || i.length > MOST_IMAGE_CHARS || !BASE64.test(i))
  ) {
    return reply({ error: spec.minImages > 0 ? 'Send the photo as a JPEG' : 'Send at most a few photos, as JPEGs' }, 400);
  }
  if (!spec.enough(body.input)) return reply({ error: 'There is nothing to ask Claude about' }, 400);
  if (usedUp(allowance)) return reply({ error: USED_UP, usedUp: true }, 429);

  const content = [
    ...(images as string[]).map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
    { type: 'text', text: taskPrompt(task, body.input) },
  ];
  return keptOpen(async () => {
    const answer = await askClaude(allowance, task, { model: MODELS[spec.tier], maxTokens: spec.maxTokens, content });
    return answer.text !== undefined ? { text: answer.text } : { error: answer.error };
  });
});
