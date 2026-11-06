// Walks the company's page in Chromium at iPhone size against a stand-in for the company-page
// function: the list opens from its link, a name is kept, an item is confirmed, given a time,
// commented on and marked done, the whole list gets a comment, a photo opens large with its marks,
// and a broken link says so. Saves a screenshot of each step to local/company-page-shots.
//
//   COMPANY_PAGE_FUNCTION=http://localhost:4320/fn node tools/build-company-page.mjs && npx tsx tools/company-page-e2e.ts

import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = process.cwd();
const html = readFileSync(join(root, 'apps', 'company-page', 'dist', 'c', 'index.html'), 'utf8');
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

function act(body: Json): { status: number; body: unknown } {
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
    case 'comment':
      state.comments.push({ id: `m${state.comments.length + 1}`, item_id: body.item ?? null, body: body.value, from_company: true, author: body.name ?? null, created_at: new Date().toISOString() });
      break;
    default:
      return { status: 403, body: { error: 'That is not something the page can do' } };
  }
  return { status: 200, body: state };
}

let photoJpeg: Buffer | null = null;
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
  check((await page.getByText('Start at number 1: the first ones hold up the most other work.').count()) === 1, 'Ready Now says to start at number 1');
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
