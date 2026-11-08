// Walks the company's page in Chromium at iPhone size against a stand-in for the company-page
// function: the list opens from its link, a name is kept, an item is confirmed, given a time,
// commented on and marked done, the whole list gets a comment, a photo opens large with its marks,
// and a broken link says so. A company whose page is in Spanish sees it in Spanish, with a button to
// English, and its other jobs. The owner's page opens, sends something to look at with a photo, and
// signs off a place and the whole job. Saves a screenshot of each step to local/company-page-shots.
//
//   COMPANY_PAGE_FUNCTION=http://localhost:4320/fn node tools/build-company-page.mjs && npx tsx tools/company-page-e2e.ts

import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = process.cwd();
const html = readFileSync(join(root, 'apps', 'company-page', 'dist', 'c', 'index.html'), 'utf8');
const ownerHtml = readFileSync(join(root, 'apps', 'company-page', 'dist', 'o', 'index.html'), 'utf8');
if (!html.includes('localhost:4320/fn')) throw new Error('Build the page for the stand-in first: COMPANY_PAGE_FUNCTION=http://localhost:4320/fn node tools/build-company-page.mjs');
const shots = join(root, 'local', 'company-page-shots');
mkdirSync(shots, { recursive: true });

const TOKEN = 'ab'.repeat(32);
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#D8D2C8"/><rect x="120" y="520" width="960" height="380" fill="#EFE9DF"/><rect x="420" y="140" width="360" height="300" fill="#C9D3D6" stroke="#9AA8AD" stroke-width="8"/></svg>`;

type Json = Record<string, unknown>;
const now = new Date().toISOString();
const state = {
  builder: 'Ross Built',
  job: { name: 'Fish Residence', address: '715 North Shore Drive', closed: false },
  company: { id: 'c1', name: 'Gator Plumbing' },
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111', number: 12, title: 'Install vanity faucets', description: 'Both sinks in the primary bath.',
      location: 'Primary Bath 207', floor: 'Level 2', kind: 'completion', ready: true, waiting_on: [], waiting_for: [], ready_by: null, hours: null,
      priority: true, po_or_co: null, checklist: [], confirmed_at: null, marked_done_at: null,
      photos: [{ url: '/photo.jpg', width: 1200, height: 900, marks: [{ tool: 'circle', color: 'red', from: [0.33, 0.14], to: [0.67, 0.5] }, { tool: 'text', color: 'red', at: [0.5, 0.58], text: 'Faucet here' }] }],
    },
    {
      // Holds up the tile, the glass and the trim after it: it comes right after the Priority item.
      id: '55555555-5555-4555-8555-555555555555', number: 16, title: 'Set the shower valve', description: '',
      location: 'Primary Bath 207', floor: 'Level 2', kind: 'completion', ready: true, waiting_on: [], waiting_for: [], ready_by: null, hours: 3,
      priority: false, po_or_co: null, checklist: [], confirmed_at: null, marked_done_at: null, photos: [], holds_up: { items: 3, hours: 14 },
    },
    {
      id: '22222222-2222-4222-8222-222222222222', number: 14, title: 'Set the toilet', description: '',
      location: 'Guest Bath 210', floor: 'Level 2', kind: 'completion', ready: false, waiting_on: ['Owner'],
      waiting_for: [{ title: 'Install tile floor', company: 'Volcano Stone', location: 'Guest Bath 210' }], ready_by: '2026-11-20', hours: 2,
      priority: false, po_or_co: null, checklist: [], confirmed_at: null, marked_done_at: null, photos: [],
    },
    {
      id: '33333333-3333-4333-8333-333333333333', number: 19, title: 'Add a hose bib on the deck', description: 'Owner asked for one by the grill.',
      location: 'Deck', floor: null, kind: 'added_scope', ready: true, waiting_on: [], waiting_for: [], ready_by: null, hours: null,
      priority: false, po_or_co: null, checklist: [], confirmed_at: null, marked_done_at: null, photos: [],
    },
  ] as Json[],
  completed: [{ id: '44444444-4444-4444-8444-444444444444', number: 3, title: 'Cap the laundry lines', location: 'Laundry 112', completed_at: now }],
  comments: [{ id: 'm1', item_id: '22222222-2222-4222-8222-222222222222', body: 'Tile goes in next week.', from_company: false, author: 'Jake Ross', created_at: now }] as Json[],
};
const said: Json[] = [];
const photosSent: { size: number; width: number; height: number }[] = [];

/** A company whose page is in Spanish, with its list's lines as Claude translated them, and another job. */
const SPANISH = 'ef'.repeat(32);
const OTHER_JOB = '9a'.repeat(32);
const spanishPage = () => ({
  ...state,
  company: { id: 'c2', name: 'Gulf Tile', language: 'es' },
  items: [state.items[0], state.items[2]],
  comments: [],
  translations: {
    'Install vanity faucets': 'Instalar llaves del lavabo',
    'Faucet here': 'Llave aquí',
    'Both sinks in the primary bath.': 'Los dos lavabos del baño principal.',
    'Set the toilet': 'Instalar el inodoro',
    'Install tile floor': 'Instalar piso de cerámica',
    Owner: 'Dueño',
  },
  other_jobs: [{ name: 'Walsh Residence', address: '20 Bay Road', token: OTHER_JOB, open: 3 }],
});

/** The owner's page, as the stand-in keeps it. */
const OWNER = '7c'.repeat(32);
const KITCHEN = 'a1111111-1111-4111-8111-111111111111';
const owner = {
  builder: 'Ross Built',
  job: { name: 'Fish Residence', address: '715 North Shore Drive', closed: false },
  owner: 'Karen',
  locations: [
    {
      id: KITCHEN, label: 'Kitchen 109', floor: 'Level 1',
      open: [{ id: 'k1', title: 'Adjust cabinet door', ready: true, waits_on_owner: false }, { id: 'k2', title: 'Pick the pendant lights', ready: false, waits_on_owner: true }],
      done: [{ id: 'k3', title: 'Replace outlet cover', completed_at: now, photos: [{ url: '/photo.jpg', width: 1200, height: 900, marks: [], done: true }] }],
    },
    { id: 'b2222222-2222-4222-8222-222222222222', label: 'Primary Bath 207', floor: 'Level 2', open: [{ id: 'b1', title: 'Install vanity faucets', ready: true, waits_on_owner: false }], done: [] },
  ],
  added: [] as Json[],
  sign_offs: [] as Json[],
};
const ownerSaid: Json[] = [];

function ownerAct(body: Json): { status: number; body: unknown } {
  if (body.o !== OWNER) return { status: 404, body: { error: 'This link no longer works. Ask your builder for a new one.' } };
  ownerSaid.push(body);
  if (body.action === 'add') {
    const words = String(body.words ?? '').trim();
    if (!words && !body.photo) return { status: 403, body: { error: 'Say what to look at, or add a photo' } };
    if (body.photo && !(Number(body.width) > 0)) return { status: 403, body: { error: 'Send the photo as a JPEG' } };
    const place = owner.locations.find((l) => l.id === body.location);
    owner.added.unshift({ id: `o${owner.added.length + 1}`, words, title: null, location: place?.label ?? null, status: 'received', created_at: new Date().toISOString() });
  } else if (body.action === 'sign-off') {
    if (String(body.name ?? '').trim().length < 2) return { status: 403, body: { error: 'Type your name to sign off' } };
    const place = owner.locations.find((l) => l.id === body.location);
    owner.sign_offs.unshift({ name: body.name, location: place?.label ?? null, open: place ? place.open.length : 3, at: new Date().toISOString() });
  } else if (body.action !== 'page') {
    return { status: 403, body: { error: 'That is not something the page can do' } };
  }
  return { status: 200, body: owner };
}

function act(body: Json): { status: number; body: unknown } {
  if (body.o !== undefined) return ownerAct(body);
  if (body.t === SPANISH) return { status: 200, body: spanishPage() };
  if (body.t !== TOKEN) return { status: 404, body: { error: 'This link no longer works. Ask for a new one.' } };
  said.push(body);
  const item = state.items.find((i) => i.id === body.item);
  switch (body.action) {
    case 'page':
      break;
    case 'confirm':
      if (!item) return { status: 403, body: { error: 'That item is not on this list' } };
      item.confirmed_at = body.value === false ? null : new Date().toISOString();
      break;
    case 'hours':
      if (!item) return { status: 403, body: { error: 'That item is not on this list' } };
      item.hours = typeof body.value === 'number' ? body.value : null;
      break;
    case 'done':
      if (!item) return { status: 403, body: { error: 'That item is not on this list' } };
      item.marked_done_at = body.value === false ? null : new Date().toISOString();
      break;
    case 'photo': {
      if (!item) return { status: 403, body: { error: 'That item is not on this list' } };
      if (typeof body.value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.value) || !(Number(body.width) > 0)) return { status: 403, body: { error: 'Send the photo as a JPEG' } };
      photosSent.push({ size: body.value.length, width: Number(body.width), height: Number(body.height) });
      (item.photos as Json[]).push({ url: '/photo.jpg', width: body.width, height: body.height, marks: [], done: true });
      break;
    }
    case 'comment':
      state.comments.push({ id: `m${state.comments.length + 1}`, item_id: body.item ?? null, body: body.value, from_company: true, author: body.name ?? null, created_at: new Date().toISOString() });
      break;
    default:
      return { status: 403, body: { error: 'That is not something the page can do' } };
  }
  return { status: 200, body: state };
}

let photoJpeg: Buffer | null = null;
/** A phone-sized photo, bigger than the page sends. */
let photoBig: Buffer | null = null;
const server = createServer((req, res) => {
  if (req.url === '/fn' && req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' });
    res.end();
    return;
  }
  if (req.url === '/fn' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const out = act(JSON.parse(raw) as Json);
      res.writeHead(out.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(out.body));
    });
    return;
  }
  if (req.url === '/photo.jpg' && photoJpeg) {
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end(photoJpeg);
    return;
  }
  if (req.url?.startsWith('/c')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
    return;
  }
  if (req.url?.startsWith('/o')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(ownerHtml);
    return;
  }
  res.writeHead(404);
  res.end();
});

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok  ${what}`);
}

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(4320, r));
  const browser = await chromium.launch();
  {
    const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await p.setContent(`<html><body style="margin:0">${PHOTO_SVG}</body></html>`);
    photoJpeg = await p.screenshot({ type: 'jpeg', quality: 85 });
    await p.setViewportSize({ width: 2400, height: 1800 });
    await p.setContent(`<html><body style="margin:0">${PHOTO_SVG.replace('width="1200" height="900"', 'width="2400" height="1800" viewBox="0 0 1200 900"')}</body></html>`);
    photoBig = await p.screenshot({ type: 'jpeg', quality: 85 });
    await p.close();
  }
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (name: string) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: false });

  await page.goto(`http://localhost:4320/c/#${TOKEN}`);
  await page.getByRole('heading', { name: 'Gator Plumbing' }).waitFor();
  check((await page.locator('.counts').textContent())?.includes('4 open items') ?? false, 'the list opens from its link, with its counts');
  const order = await page.locator('article.item').evaluateAll((els) =>
    els.map((el) => `${el.querySelector('.step')?.textContent ?? '-'} ${el.querySelector('h3')?.textContent ?? ''}`),
  );
  check(
    order.join('|') === '1 Install vanity faucets|2 Set the shower valve|3 Set the toilet|- Add a hose bib on the deck',
    `the work is numbered in the order to do it, Priority first, then what holds up the most (${order.join('|')})`,
  );
  check((await page.getByText('Holds up 3 items').count()) === 1, 'an item says what it holds up');
  check((await page.getByText('Start at number 1: it holds up the most other work.').count()) === 1, 'Ready Now says to start at number 1');
  check((await page.getByText('On Install tile floor (Volcano Stone, Guest Bath 210) and Owner · Ready by Friday, November 20').count()) === 1, 'a waiting item says what it waits on and when it should be ready');
  check((await page.locator('.section h2').allTextContents()).join('|') === 'Ready Now|Waiting|To Be Quoted|The Whole List|Checked Off Lately', 'the sections are in order');
  await shot('01-opened');

  await page.locator('#name').fill('Mike');
  await page.locator('#name').blur();
  const first = page.locator('#item-11111111-1111-4111-8111-111111111111');
  await first.getByRole('button', { name: 'Confirm' }).click();
  await first.getByRole('button', { name: '✓ Confirmed' }).waitFor();
  check(said.some((s) => s.action === 'confirm' && s.name === 'Mike'), 'confirming says who');
  await first.getByRole('button', { name: '2 hours' }).click();
  await page.locator('#item-11111111-1111-4111-8111-111111111111 .chip.on', { hasText: '2 hours' }).waitFor();
  check(state.items[0]!.hours === 2, 'a time one tap away is kept');
  await first.getByRole('button', { name: 'Other' }).click();
  await first.locator('select').selectOption('2.5');
  await page.locator('#item-11111111-1111-4111-8111-111111111111 .chip.on', { hasText: '2.5 hours' }).waitFor();
  check(state.items[0]!.hours === 2.5, 'another time from the list is kept');
  await shot('02-confirmed-with-time');

  await first.locator('textarea').fill('Do you want the brushed nickel ones?');
  await first.getByRole('button', { name: 'Send' }).click();
  await first.getByText('Do you want the brushed nickel ones?').waitFor();
  check(state.comments.some((c) => c.author === 'Mike' && c.item_id === state.items[0]!.id), 'a comment on an item goes in under the name');

  await first.getByRole('button', { name: 'Mark Done' }).click();
  await page.getByText('Marked done. Ross Built will check it.').waitFor();
  check((await page.locator('.section h2').allTextContents()).includes('Marked Done'), 'marked done moves it to Marked Done');
  await shot('03-marked-done');
  // A photo of the finished work: picked on the phone, made smaller, sent, and shown as a done photo.
  await page.locator(`input[data-photo="${state.items[0]!.id}"]`).setInputFiles({ name: 'faucets.jpg', mimeType: 'image/jpeg', buffer: photoBig! });
  await page.getByText('Photo sent. Ross Built sees it on the item.').waitFor();
  const sentPhoto = photosSent[0];
  check(!!sentPhoto && Math.max(sentPhoto.width, sentPhoto.height) === 1600 && sentPhoto.size < 1_500_000, 'a done photo goes smaller, as a JPEG');
  check((await page.locator(`#item-${state.items[0]!.id} .ph .tag`).allTextContents()).join() === 'Done', 'the done photo shows as one on the item');
  check((await page.getByText('Add Another Done Photo').count()) === 1, 'the next photo is another done photo');
  await shot('03b-done-photo');
  await page.getByRole('button', { name: 'Not Done After All' }).click();
  await page.getByRole('button', { name: 'Mark Done' }).first().waitFor();
  check(state.items[0]!.marked_done_at === null, 'Not Done After All puts it back');

  const whole = page.locator('textarea[data-draft="list"]');
  await whole.fill('We can be there Tuesday.');
  await whole.locator('xpath=..').getByRole('button', { name: 'Send' }).click();
  await page.getByText('We can be there Tuesday.').waitFor();
  check(state.comments.some((c) => c.item_id === null), 'a comment on the whole list goes in');

  await page.locator('.ph.big').first().click();
  await page.locator('.viewer .frame svg').waitFor();
  await shot('04-photo-large');
  await page.getByRole('button', { name: 'Close' }).click();
  check((await page.locator('.viewer').count()) === 0, 'the large photo closes');

  await page.reload();
  await page.getByRole('heading', { name: 'Gator Plumbing' }).waitFor();
  check((await page.locator('#name').inputValue()) === 'Mike', 'the name is kept for next time');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('05-bottom');

  const broken = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await broken.goto('http://localhost:4320/c/#not-a-token');
  await broken.getByText('The link is not complete.').waitFor();
  await broken.goto(`http://localhost:4320/c/#${'cd'.repeat(32)}`);
  await broken.getByText('This link no longer works. Ask for a new one.').waitFor();
  check(true, 'a broken link and a taken back one each say so');

  // ---------- a company's page in Spanish ----------
  const es = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  es.on('pageerror', (e) => errors.push(e.message));
  await es.goto(`http://localhost:4320/c/#${SPANISH}`);
  await es.getByRole('heading', { name: 'Gulf Tile' }).waitFor();
  check((await es.locator('.section h2').allTextContents()).slice(0, 2).join('|') === 'Listo Ahora|En Espera', 'a company whose page is in Spanish sees it in Spanish');
  check((await es.getByRole('heading', { name: 'Instalar llaves del lavabo' }).count()) === 1 && (await es.getByText('Los dos lavabos del baño principal.').count()) === 1, "its list's lines show as Claude translated them");
  check((await es.getByText('Depende de Instalar piso de cerámica (Volcano Stone, Guest Bath 210), Dueño').count()) === 1, 'what an item waits on is in Spanish, names and rooms as they are');
  check((await es.locator('.ph svg').first().textContent())?.includes('Llave aquí') ?? false, 'words written on a photo are in Spanish too');
  // The faucets were confirmed above.
  check(
    (await es.locator('.counts').textContent()) === '2 trabajos pendientes · 1 listo · 1 en espera · 1 confirmado' &&
      (await es.getByRole('button', { name: 'Confirmar', exact: true }).count()) === 1 &&
      (await es.getByRole('button', { name: '✓ Confirmado' }).count()) === 1,
    'the counts and the buttons are in Spanish',
  );
  check((await es.getByRole('link', { name: /Walsh Residence/ }).getAttribute('href')) === `/c#${OTHER_JOB}`, "the company's other jobs with the builder are a tap away");
  await es.screenshot({ path: join(shots, '06-spanish.png') });
  await es.getByRole('button', { name: 'English' }).click();
  await es.getByRole('heading', { name: 'Install vanity faucets' }).waitFor();
  check((await es.locator('.section h2').first().textContent()) === 'Ready Now', 'English is a tap away');
  await es.reload();
  await es.getByRole('heading', { name: 'Install vanity faucets' }).waitFor();
  check((await es.getByRole('button', { name: 'Español' }).count()) === 1, 'the language picked is kept on the phone, with Spanish a tap back');
  await es.getByRole('button', { name: 'Español' }).click();
  await es.getByRole('heading', { name: 'Instalar llaves del lavabo' }).waitFor();
  await es.close();

  // ---------- the owner's page ----------
  const o = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  o.on('pageerror', (e) => errors.push(e.message));
  await o.goto(`http://localhost:4320/o/#${OWNER}`);
  await o.getByRole('heading', { name: 'Fish Residence' }).waitFor();
  check((await o.locator('#name').inputValue()) === 'Karen', "the owner's page opens with the name the builder gave");
  check((await o.locator('.section h2').allTextContents()).join('|') === 'Waiting on You|Send Something to Look At|Finished Lately|Each Place|Sign Off', "the owner's page shows what waits on them first");
  const waitsOnYou = o.locator('section').filter({ has: o.getByRole('heading', { name: 'Waiting on You' }) });
  check((await waitsOnYou.getByText('Pick the pendant lights').count()) === 1 && (await waitsOnYou.getByText('Adjust cabinet door').count()) === 0, 'what waits on the owner is there, and only that');
  await o.screenshot({ path: join(shots, '07-owner.png') });
  check(await o.getByRole('button', { name: 'Send', exact: true }).isDisabled(), 'Send waits for words or a photo');
  await o.locator('#words').fill('The pantry door sticks at the top');
  await o.locator('#where').selectOption(KITCHEN);
  await o.locator('#photo').setInputFiles({ name: 'door.jpg', mimeType: 'image/jpeg', buffer: photoBig! });
  await o.locator('.picked img').waitFor();
  await o.getByRole('button', { name: 'Send', exact: true }).click();
  await o.getByText('Sent. Ross Built has it.').waitFor();
  const sent = ownerSaid.find((x) => x.action === 'add') ?? {};
  check(sent.words === 'The pantry door sticks at the top' && sent.location === KITCHEN && sent.name === 'Karen' && typeof sent.photo === 'string' && Number(sent.width) === 1600, 'what the owner sends goes with their words, the place, their name and a smaller photo');
  check((await o.locator('.sent').first().textContent())?.includes('Received') ?? false, 'it shows under What You Sent, received');
  check((await o.locator('#words').inputValue()) === '' && (await o.locator('.picked').count()) === 0, 'the box is ready for the next one');
  await o.screenshot({ path: join(shots, '08-owner-sent.png') });
  await o.locator(`#place-${KITCHEN}`).getByRole('button', { name: 'Sign Off' }).click();
  await o.getByText('Sign off Kitchen 109 as Karen? 2 items still open there.').waitFor();
  await o.getByRole('button', { name: 'Yes, Sign Off' }).click();
  await o.getByText('Signed off Kitchen 109. Thank you.').waitFor();
  check(ownerSaid.some((x) => x.action === 'sign-off' && x.location === KITCHEN && x.name === 'Karen'), 'a place is signed off under the name, after a yes');
  await o.getByRole('button', { name: 'Sign Off the Whole Job' }).click();
  await o.getByRole('button', { name: 'Not Yet' }).click();
  check(!ownerSaid.some((x) => x.action === 'sign-off' && x.location === null), 'Not Yet signs nothing off');
  await o.getByRole('button', { name: 'Sign Off the Whole Job' }).click();
  await o.getByRole('button', { name: 'Yes, Sign Off' }).click();
  await o.getByText('Signed off the whole job. Thank you.').waitFor();
  check((await o.getByText('✓ Karen signed off the whole job').count()) === 1 && (await o.getByText('✓ Karen signed off Kitchen 109').count()) === 1, 'the sign offs show on the page');
  await o.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await o.screenshot({ path: join(shots, '09-owner-signed.png') });
  await o.goto(`http://localhost:4320/o/#${'cd'.repeat(32)}`);
  await o.getByText('This link no longer works. Ask your builder for a new one.').waitFor();
  check(true, "an owner's link taken back says so");
  await o.goto('http://localhost:4320/o/#sample');
  await o.getByRole('heading', { name: 'Sample Job' }).waitFor();
  check((await o.getByText('This is a sample').count()) === 1, "the sample owner's page opens");
  await o.close();

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await browser.close();
  server.close();
  console.log('Company page: every step passed');
}

main().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
