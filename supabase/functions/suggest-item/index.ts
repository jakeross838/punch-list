// Fills in an item from its photo. The phone sends the prompt (built by @punch/core's suggestPrompt)
// and the photo; this checks the caller is an active Ross Built person, asks Claude, and returns
// its answer as text for the phone to read. The Claude key stays here, as a function secret.
//
//   supabase secrets set ANTHROPIC_API_KEY=...   (and optionally SUGGEST_MODEL)
//   supabase functions deploy suggest-item

import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('SUGGEST_MODEL') ?? 'claude-sonnet-5-5';
const HEADERS = { 'content-type': 'application/json' };

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: active } = await supabase.rpc('is_active_person');
  if (active !== true) return reply({ error: 'Only active Ross Built people can use this' }, 403);

  const { prompt, image } = (await req.json().catch(() => ({}))) as { prompt?: unknown; image?: unknown };
  if (typeof prompt !== 'string' || prompt.length > 60_000 || typeof image !== 'string' || image.length === 0 || image.length > 8_000_000) {
    return reply({ error: 'Send a prompt and one JPEG photo' }, 400);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return reply({ error: 'Claude did not answer' }, 502);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  return reply({ text });
});
