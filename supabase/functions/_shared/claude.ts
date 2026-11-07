// What the functions that ask Claude share: who is asking and what their company has left of this
// month's allowance, asking Claude on the app's key, counting what each answer cost against the
// company, and keeping the phone's connection open while Claude works. The Claude key stays here,
// as a function secret.
//
// tools/build-functions.mjs copies this file into each function's folder as claude.ts, next to the
// core.js it writes there (a function cannot reach other folders once it is deployed).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { costCents } from './core.js';

/** Where Claude is asked: set otherwise only to check a function with a stand-in. */
const CLAUDE = Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com';
/** A space this often keeps the phone's connection open while Claude works. */
const KEEP_OPEN_MS = 10_000;

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export const claudeKey = () => Deno.env.get('ANTHROPIC_API_KEY') ?? '';

export const NOT_SIGNED_IN = 'Sign in to your company to use this';
export const USED_UP = "Your company has used this month's allowance for Claude. It starts again on the first of the month";
export const NO_ANSWER = 'Claude did not answer. Try again in a minute';

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    return (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default ?? '';
  } catch {
    return '';
  }
}

/** The database as the caller: they see only what the access rules let them. */
export function callerClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The database as the service role, for what the app never does itself: counting, and taking files away. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Allowance {
  org: string;
  personId: string | null;
  /** This month's allowance and what is used of it, in cents. */
  limitCents: number;
  usedCents: number;
}

/** The caller's company and its allowance; null for anyone not switched on at a company. */
export async function allowanceOf(caller: SupabaseClient): Promise<Allowance | null> {
  const { data, error } = await caller.rpc('ai_allowance');
  if (error || !data || typeof data !== 'object') return null;
  const a = data as Record<string, unknown>;
  if (typeof a.org !== 'string' || a.org === '') return null;
  return {
    org: a.org,
    personId: typeof a.person_id === 'string' ? a.person_id : null,
    limitCents: Number(a.limit_cents) || 0,
    usedCents: Number(a.used_cents) || 0,
  };
}

export const usedUp = (a: Allowance) => a.usedCents >= a.limitCents;

export interface ClaudeAnswer {
  text?: string;
  error?: string;
  /** Claude's own status when it turned the request down. */
  status?: number;
}

/** Asks Claude once, and counts what the answer cost against the company. */
export async function askClaude(a: Allowance, task: string, ask: { model: string; maxTokens: number; content: unknown[] }): Promise<ClaudeAnswer> {
  try {
    const res = await fetch(`${CLAUDE}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': claudeKey(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: ask.model, max_tokens: ask.maxTokens, messages: [{ role: 'user', content: ask.content }] }),
    });
    if (!res.ok) {
      console.error('Claude answered', res.status, (await res.text()).slice(0, 500));
      return { error: NO_ANSWER, status: res.status };
    }
    const out = (await res.json()) as { model?: string; content?: { type: string; text?: string }[]; usage?: Record<string, number> };
    await countUse(a, task, out.model ?? ask.model, out.usage ?? {});
    return { text: (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') };
  } catch (e) {
    console.error('Asking Claude', e);
    return { error: NO_ANSWER };
  }
}

/** One answer's tokens and what they cost, counted by the service role. */
async function countUse(a: Allowance, task: string, model: string, usage: Record<string, number>): Promise<void> {
  const { error } = await serviceClient()
    .from('ai_usage')
    .insert({
      org: a.org,
      person_id: a.personId,
      task,
      model: model.slice(0, 80),
      input_tokens: Math.max(0, Math.floor(usage.input_tokens ?? 0)),
      output_tokens: Math.max(0, Math.floor(usage.output_tokens ?? 0)),
      cost_cents: costCents(model, usage),
    });
  if (error) console.error('Counting what Claude cost', error.message);
}

/**
 * The answer, with a space now and then before it so the phone's connection stays open while Claude
 * works. after runs once the answer is written, before the connection closes.
 */
export function keptOpen(work: () => Promise<unknown>, after?: () => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const keepOpen = setInterval(() => controller.enqueue(encoder.encode(' ')), KEEP_OPEN_MS);
      let answer: unknown;
      try {
        answer = await work();
      } catch (e) {
        console.error('Working with Claude', e);
        answer = { error: NO_ANSWER };
      } finally {
        clearInterval(keepOpen);
      }
      controller.enqueue(encoder.encode(JSON.stringify(answer)));
      if (after) await after().catch((e) => console.error('After the answer', e));
      controller.close();
    },
  });
  return new Response(stream, { headers: HEADERS });
}
