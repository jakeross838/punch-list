// Walks the job's station in Chromium against a stand-in for the company-page function: on a tablet
// the board opens from the station's link with the most ready company first, a company's list opens
// with a tap and the way back, an answer goes in under the name kept for that company, the board
// shows it, and the station goes back to every company on its own after a while untouched. On a TV
// the board shows in large type, a page at a time, with the code to open the station. A station that
// was turned off, and a company not on the job, each say so. Saves a screenshot of each step to
// local/station-shots.
//
//   COMPANY_PAGE_FUNCTION=http://localhost:4321/fn node tools/build-company-page.mjs && npx tsx tools/station-e2e.ts

import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = process.cwd();
const html = readFileSync(join(root, 'apps', 'company-page', 'dist', 's', 'index.html'), 'utf8');
if (!html.includes('localhost:4321/fn')) throw new Error('Build the station for the stand-in first: COMPANY_PAGE_FUNCTION=http://localhost:4321/fn node tools/build-company-page.mjs');
const shots = join(root, 'local', 'station-shots');
mkdirSync(shots, { recursive: true });

const STATION = 'ef'.repeat(32);
type Json = Record<string, unknown>;

let n = 0;
const item = (title: string, location: string, over: Json = {}): Json => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, number: n, title, description: '', location, floor: null, kind: 'completion',
    ready: true, waiting_on: [], waiting_for: [], ready_by: null, hours: null, priority: false, po_or_co: null, checklist: [],
    confirmed_at: null, marked_done_at: null, photos: [], holds_up: { items: 0, hours: 0 }, ...over,
  };
};

const companies: { id: string; name: string; trade: string | null; items: Json[] }[] = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Gator Plumbing', trade: 'Plumbing', items: [item('Set the toilet', 'Guest Bath 210', { ready: false, waiting_on: ['Owner'], ready_by: '2026-11-20' })] },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'SMS Carpentry', trade: 'Carpentry',
    items: [
      item('Install door stops', 'Guest Bedroom 114'),
      item('Install pocket door hardware', 'Primary Bath 207', { holds_up: { items: 1, hours: 3 } }),
      item('Adjust closet door', 'Primary Bedroom 206', { kind: 'deficiency' }),
    ],
  },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'Triple H Painting', trade: 'Painting', items: [item('Touch up paint', 'Kitchen 109')] },
  { id: 'aaaaaaaa-0000-4000-8000-000000000004', name: 'Bayshore Glass', trade: 'Glass', items: [] },
];
// More companies, for the TV to page through.
for (let k = 5; k <= 9; k += 1) companies.push({ id: `aaaaaaaa-0000-4000-8000-00000000000${k}`, name: `Company ${k}`, trade: null, items: [item(`Task for company ${k}`, 'Garage')] });
const comments: Json[] = [];
const said: Json[] = [];
let off = false;

function act(body: Json): { status: number; body: unknown } {
  if (body.s !== STATION || off) return { status: 404, body: { error: 'This station is turned off. Ask for a new link.' } };
  said.push(body);
  const builder = 'Ross Built';
  const job = { name: 'Fish Residence', address: '715 North Shore Drive', closed: false };
  if (!body.company) return { status: 200, body: { builder, job, companies: companies.map(({ id, name, trade, items }) => ({ id, name, trade, items })) } };
  const company = companies.find((c) => c.id === body.company);
  if (!company) return { status: 403, body: { error: 'That company is not on this job' } };
  const it = company.items.find((i) => i.id === body.item);
  if (body.action === 'done' && it) it.marked_done_at = body.value === false ? null : new Date().toISOString();
  if (body.action === 'confirm' && it) it.confirmed_at = body.value === false ? null : new Date().toISOString();
  if (body.action === 'comment') comments.push({ id: `m${comments.length + 1}`, item_id: body.item ?? null, body: body.value, from_company: true, author: body.name ?? null, created_at: new Date().toISOString() });
  return { status: 200, body: { builder, job, company: { id: company.id, name: company.name }, items: company.items, completed: [], comments } };
}

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
  if (req.url?.startsWith('/s') || req.url?.startsWith('/tv')) {
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
  await new Promise<void>((r) => server.listen(4321, r));
  const browser = await chromium.launch();
  const errors: string[] = [];

  // ---------- a tablet, landscape ----------
  const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await tablet.newPage();
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.clock.install();
  const shot = (name: string) => page.screenshot({ path: join(shots, `${name}.png`) });

  await page.goto(`http://localhost:4321/s/#${STATION}`);
  await page.getByRole('heading', { name: 'Fish Residence' }).waitFor();
  const names = await page.locator('.tile-name').allTextContents();
  check(names[0] === 'SMS Carpentry', `the company with the most ready work comes first (${names.join(', ')})`);
  check(!names.includes('Bayshore Glass') && (await page.getByText('Nothing open for Bayshore Glass.').count()) === 1, 'a company with nothing open is named once, under the tiles');
  check((await page.locator('.tile').first().locator('.tile-next').textContent()) === 'Next: Install pocket door hardware, Primary Bath 207', 'each company says what to do next, in the order of its list');
  check((await page.locator('.tile', { hasText: 'Gator Plumbing' }).locator('.tile-next').textContent())?.startsWith('Nothing ready yet. Ready by') ?? false, 'a company with nothing ready says when it should be');
  await shot('01-board');

  await page.locator('.tile', { hasText: 'SMS Carpentry' }).click();
  await page.getByRole('heading', { name: 'SMS Carpentry' }).waitFor();
  check((await page.getByRole('button', { name: 'Back to every company' }).count()) === 1, 'a company list has the way back');
  const steps = await page.locator('article.item .step').allTextContents();
  check(steps.join(',') === '1,2,3', 'the list is numbered in the order to do it');
  await page.locator('#name').fill('Mike');
  await page.locator('#name').blur();
  await page.locator('article.item').first().getByRole('button', { name: 'Mark Done' }).click();
  await page.getByText('Marked done. Ross Built will check it.').waitFor();
  check(said.some((s) => s.action === 'done' && s.name === 'Mike' && s.company === companies[1]!.id && s.s === STATION), 'Mark Done goes in with the station, the company and the name');
  await shot('02-company-list');

  await page.getByRole('button', { name: 'Back to every company' }).click();
  await page.locator('.tile', { hasText: 'SMS Carpentry' }).locator('.tile-counts', { hasText: '1 to check' }).waitFor();
  check(true, 'the board shows what was marked done');

  await page.locator('.tile', { hasText: 'SMS Carpentry' }).click();
  await page.getByRole('heading', { name: 'SMS Carpentry' }).waitFor();
  check((await page.locator('#name').inputValue()) === 'Mike', "the name is kept for the company's next visit");
  await page.locator('.tile', { hasText: 'Triple H Painting' }).waitFor({ state: 'detached' });
  // Left alone, it goes back to every company for whoever comes next.
  await page.clock.fastForward('03:05');
  await page.locator('.tile').first().waitFor();
  check((await page.locator('.tile-name').count()) > 0, 'left alone a few minutes, the station goes back to every company');
  await page.locator('.tile', { hasText: 'Triple H Painting' }).click();
  await page.getByRole('heading', { name: 'Triple H Painting' }).waitFor();
  check((await page.locator('#name').inputValue()) === '', "each company's name is its own");
  await page.getByRole('button', { name: 'Back to every company' }).click();

  // A company taken off the job since the board was drawn.
  await page.locator('.tile').first().waitFor();
  const at = companies.findIndex((c) => c.name === 'Triple H Painting');
  const [taken] = companies.splice(at, 1);
  await page.locator('.tile', { hasText: 'Triple H Painting' }).click();
  await page.getByText('That company is not on this job').waitFor();
  check(true, 'a company no longer on the job says so, with the way back');
  await page.getByRole('button', { name: /All Companies/ }).click();
  await page.locator('.tile').first().waitFor();
  companies.splice(at, 0, taken!);

  // ---------- a TV ----------
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  tv.on('pageerror', (e: Error) => errors.push(e.message));
  await tv.clock.install();
  await tv.goto(`http://localhost:4321/tv/#${STATION}`);
  await tv.locator('.tv-card').first().waitFor();
  check((await tv.locator('.tv-card').count()) === 6, 'the TV shows six companies a page');
  check((await tv.locator('.tv-page').textContent())?.startsWith('Page 1 of 2') ?? false, 'it says which page it is on');
  check((await tv.locator('.tv-code svg').count()) === 1, 'it has the code to open the station on a phone');
  check((await tv.locator('.tv-card').first().locator('.tv-name').textContent()) === 'SMS Carpentry', 'the most ready company comes first on the TV too');
  await tv.screenshot({ path: join(shots, '03-tv.png') });
  await tv.clock.fastForward('00:16');
  await tv.locator('.tv-page', { hasText: 'Page 2 of 2' }).waitFor();
  check(true, 'it moves to the next page by itself');
  await tv.screenshot({ path: join(shots, '04-tv-page-2.png') });

  // A TV standing on its end.
  const tall = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  tall.on('pageerror', (e: Error) => errors.push(e.message));
  await tall.goto(`http://localhost:4321/tv/#${STATION}`);
  await tall.locator('.tv-card').first().waitFor();
  await tall.screenshot({ path: join(shots, '05-tv-portrait.png') });
  check(true, 'the TV board also stands on its end');

  // Turned off from the app: it says so.
  off = true;
  await tv.clock.fastForward('01:01');
  await tv.getByText('This station is turned off. Ask for a new link.').waitFor();
  check(true, 'a station that was turned off says so on the TV');
  const fresh = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await fresh.goto(`http://localhost:4321/s/#${STATION}`);
  await fresh.getByText('This station is turned off. Ask for a new link.').waitFor();
  check(true, 'and on a tablet');
  await fresh.goto('http://localhost:4321/s/#short');
  await fresh.getByText('The link is not complete.').waitFor();
  check(true, 'a broken station link says so');

  // The sample station, for the app's preview: made up companies, answered on the page itself.
  const demo = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  demo.on('pageerror', (e: Error) => errors.push(e.message));
  await demo.goto('http://localhost:4321/s/#sample');
  await demo.getByRole('heading', { name: 'Sample Job' }).waitFor();
  check((await demo.locator('.tile').count()) === 4 && (await demo.getByText('Nothing open for Sample Glass.').count()) === 1, 'the sample station shows its companies');
  await demo.locator('.tile', { hasText: 'Sample Carpentry' }).click();
  await demo.getByRole('heading', { name: 'Sample Carpentry' }).waitFor();
  await demo.locator('article.item').first().getByRole('button', { name: 'Mark Done' }).click();
  await demo.getByText('Marked done.', { exact: false }).first().waitFor();
  await demo.getByRole('button', { name: 'Back to every company' }).click();
  await demo.locator('.tile', { hasText: 'Sample Carpentry' }).locator('.tile-counts', { hasText: '1 to check' }).waitFor();
  check(true, 'an answer on a sample list shows on the sample board');
  await demo.screenshot({ path: join(shots, '06-sample.png') });
  await demo.goto('http://localhost:4321/tv/#sample');
  await demo.locator('.tv-card').first().waitFor();
  check((await demo.locator('.tv-card').count()) === 4, 'and on the sample TV');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await browser.close();
  server.close();
  console.log('Station: every step passed');
}

main().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
