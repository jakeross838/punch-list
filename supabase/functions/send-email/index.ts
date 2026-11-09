// Email from the app's own address, through Resend: a company's list to its people with the PDF,
// and an invitation to someone just added under People. The words are made here by the core, from
// what the database says (who gets the company's lists, the job, the person invited, who is
// sending), so nothing else can be sent from the address, and replies go to whoever sent it. Each
// email is counted, and a company sends at most EMAILS_A_DAY a day from the app.
//
//   supabase secrets set RESEND_API_KEY=... EMAIL_FROM=lists@yourdomain
//   (and APP_LINK, where to get the app, for the invitation; PAGES_URL when the pages move)
//   supabase functions deploy send-email
//
// { check: true } answers whether email is set up. tools/build-functions.mjs writes core.js and
// claude.ts here.

import { allowanceOf, callerClient, NOT_SIGNED_IN, reply, serviceClient } from './claude.ts';
import { companyListEmail, inviteEmail } from './core.js';

const RESEND = Deno.env.get('RESEND_BASE_URL') ?? 'https://api.resend.com';
const PAGES = (Deno.env.get('PAGES_URL') ?? 'https://punch-list.expo.app').replace(/\/+$/, '');
const APP = Deno.env.get('APP_NAME') ?? 'Punch List';
/** The most people a company emails from the app in a day, its lists and invitations together. */
const EMAILS_A_DAY = Number(Deno.env.get('EMAILS_A_DAY') ?? 300);
/** A list's PDF in base64: photos and all, well under this. */
const MOST_PDF_CHARS = 14_000_000;
/** Resend's most for one email. */
const MOST_TO = 50;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Email {
  subject: string;
  body: string;
}
const listEmail = companyListEmail as (input: unknown) => Email;
const invitation = inviteEmail as (input: unknown) => Email;

/** The company's name as it shows in the From line, with nothing that would break it. */
const fromName = (name: string) => name.replace(/["<>\r\n\\]/g, '').trim() || APP;

/** A PDF's name kept to letters, numbers and plain marks. */
const pdfName = (name: unknown) => {
  const plain = (typeof name === 'string' ? name : '').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9 ._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return `${plain || 'List'}.pdf`;
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);

  const caller = callerClient(req);
  const who = await allowanceOf(caller);
  if (!who || !who.personId) return reply({ error: NOT_SIGNED_IN }, 403);

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const key = Deno.env.get('RESEND_API_KEY') ?? '';
  const sender = Deno.env.get('EMAIL_FROM') ?? '';
  const ready = key !== '' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(sender);
  if (body.check === true) return reply({ ready });
  if (!ready) return reply({ error: 'Email from the app is not set up yet' }, 503);

  const { data: me } = await caller.from('people').select('name, email, role').eq('id', who.personId).maybeSingle();
  if (!me || me.role === 'view_only') return reply({ error: 'View Only can look and comment, not send' }, 403);
  const { data: org } = await caller.from('orgs').select('name').eq('id', who.org).maybeSingle();
  const company = String(org?.name ?? '');

  let to: string[];
  let email: Email;
  let attachments: { filename: string; content: string }[] = [];
  if (body.kind === 'list') {
    const jobId = String(body.jobId ?? '');
    const companyId = String(body.companyId ?? '');
    const pdf = typeof body.pdf === 'string' ? body.pdf : '';
    if (!UUID.test(jobId) || !UUID.test(companyId)) return reply({ error: 'Name the job and the company' }, 400);
    if (pdf === '' || pdf.length > MOST_PDF_CHARS || !BASE64.test(pdf)) return reply({ error: 'Send the list as a PDF' }, 400);
    const { data: job } = await caller.from('jobs').select('name, address').eq('id', jobId).maybeSingle();
    const { data: theirs } = await caller.from('companies').select('name').eq('id', companyId).maybeSingle();
    if (!job || !theirs) return reply({ error: 'That list is not one of yours' }, 404);
    const { data: contacts } = await caller.from('company_contacts').select('name, email').eq('company_id', companyId).eq('active', true).eq('gets_lists', true);
    const people = (contacts ?? []).filter((c) => typeof c.email === 'string' && c.email !== '');
    if (people.length === 0) return reply({ error: `No one at ${theirs.name} has an email for the list. Add one in Companies` }, 400);
    const { data: link } = await caller.from('company_links').select('token').eq('job_id', jobId).eq('company_id', companyId).eq('revoked', false).limit(1).maybeSingle();
    to = [...new Set(people.map((p) => String(p.email).toLowerCase()))].slice(0, MOST_TO);
    const readyCount = Math.max(0, Math.min(9999, Math.floor(Number(body.ready) || 0)));
    email = listEmail({ job, contacts: people, from: me, company, ready: readyCount, link: link?.token ? `${PAGES}/c#${link.token}` : null });
    attachments = [{ filename: pdfName(body.filename), content: pdf }];
  } else if (body.kind === 'invite') {
    if (me.role !== 'admin') return reply({ error: 'Only an admin invites people' }, 403);
    const personId = String(body.personId ?? '');
    if (!UUID.test(personId)) return reply({ error: 'Name the person to invite' }, 400);
    const { data: person } = await caller.from('people').select('name, email, active').eq('id', personId).maybeSingle();
    if (!person || !person.active) return reply({ error: 'That person is not switched on at your company' }, 404);
    to = [String(person.email)];
    email = invitation({ person, from: me, company, app: APP, link: Deno.env.get('APP_LINK') || `${PAGES}/support/` });
  } else {
    return reply({ error: 'Say what to send: a list, or an invitation' }, 400);
  }

  // At most so many a day from the app's address, for each company.
  const service = serviceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: today, error: countError } = await service.from('email_sends').select('recipients').eq('org', who.org).gte('at', since);
  if (countError) return reply({ error: 'The email did not go. Try again in a minute' }, 502);
  const sentToday = (today ?? []).reduce((n, r) => n + (Number(r.recipients) || 0), 0);
  if (sentToday + to.length > EMAILS_A_DAY) {
    return reply({ error: "Your company has sent today's emails from the app. Send this one from your own email, or tomorrow", usedUp: true }, 429);
  }

  const sent = await fetch(`${RESEND}/emails`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `"${fromName(company)}" <${sender}>`,
      to,
      reply_to: String(me.email),
      subject: email.subject,
      text: email.body,
      ...(attachments.length > 0 ? { attachments } : {}),
    }),
  }).catch(() => null);
  if (!sent || !sent.ok) {
    console.warn('Resend', sent?.status, sent ? (await sent.text()).slice(0, 300) : 'no answer');
    return reply({ error: 'The email did not go. Try again in a minute' }, 502);
  }
  await service.from('email_sends').insert({ org: who.org, person_id: who.personId, kind: body.kind, recipients: to.length });
  return reply({ sent: to.length });
});
