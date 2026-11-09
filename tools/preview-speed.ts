// The speed check: the preview page with a big job (a thousand items in sixty-two locations, three
// thousand photos, fifteen hundred comments), at iPhone size in Chromium, with the processor slowed
// down four times to be nearer a phone. Times what a superintendent does all day, and fails when
// any of it takes longer than its budget.
//
//   npm run preview:build && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx tsx tools/preview-speed.ts

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = process.cwd();
const page = readFileSync(join(root, 'local', 'preview', 'index.html'));
/** How much slower the processor runs than this machine's. */
const SLOWER = Number(process.env.SPEED_SLOWER ?? 4);

const server = createServer((req, res) => {
  if (req.url === '/host.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><iframe src="/artifact/preview/index.html" sandbox="allow-scripts allow-same-origin allow-forms" style="border:0;width:100vw;height:100vh"></iframe></body></html>');
  } else if (req.url === '/artifact/preview/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page);
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

interface Timing {
  what: string;
  ms: number;
  budget: number;
}

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(4320, r));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addInitScript('window.__PUNCH_BIG_JOB__ = true;');
  const tab = await context.newPage();
  const problems: string[] = [];
  tab.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const cdp = await context.newCDPSession(tab);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWER });

  const app = tab.frameLocator('iframe');
  const timings: Timing[] = [];
  /** Times from the tap to what shows when it is done. */
  const time = async (what: string, budget: number, act: () => Promise<void>, done: () => Promise<void>) => {
    const start = Date.now();
    await act();
    await done();
    // A frame more, so what showed is drawn.
    await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    timings.push({ what, ms: Date.now() - start, budget });
  };
  const settle = (ms = 700) => tab.waitForTimeout(ms);

  try {
    await time(
      'The app opens to Jobs',
      12_000,
      async () => void (await tab.goto('http://localhost:4320/host.html')),
      () => app.getByTestId('job-job-big').waitFor({ timeout: 60_000 }),
    );
    await settle(1500);
    await time(
      'The big job opens to its locations',
      2_500,
      () => app.getByTestId('job-job-big').click(),
      () => app.getByTestId('group-big-room-101').waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Assigned To groups the thousand items by company',
      2_500,
      () => app.getByTestId('group-by').getByText('Assigned To', { exact: true }).click(),
      () => app.getByTestId(/^group-company-/).first().waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Back to Location',
      2_500,
      () => app.getByTestId('group-by').getByText('Location', { exact: true }).click(),
      () => app.getByTestId('group-big-room-101').waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Searching the job for a word',
      2_500,
      async () => {
        await app.getByPlaceholder('Search items').click();
        await app.getByPlaceholder('Search items').fill('outlet');
      },
      () => app.getByText('Replace outlet cover').first().waitFor({ timeout: 30_000 }),
    );
    await app.getByPlaceholder('Search items').fill('');
    await settle();
    await time(
      'A location opens with its items',
      2_500,
      () => app.getByTestId('group-big-room-101').click(),
      () => app.getByTestId(/^item-big-item-/).first().waitFor({ timeout: 30_000 }),
    );
    await settle();
    const first = app.getByTestId(/^check-big-item-/).first();
    const id = ((await first.getAttribute('data-testid')) ?? '').replace('check-', '');
    await time(
      'An item checked off',
      1_500,
      () => first.click(),
      () => app.getByText(/^Completed /).first().waitFor({ timeout: 30_000 }),
    );
    await settle(1200);
    await time(
      'An item opens',
      2_500,
      () => app.getByTestId(/^item-big-item-/).first().click(),
      () => app.getByTestId('item-summary').waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Typing in its title',
      1_500,
      async () => {
        const title = app.getByTestId('field-title').last();
        await title.click();
        await title.press('End');
        await title.pressSequentially(' now', { delay: 0 });
      },
      async () => {
        const v = await app.getByTestId('field-title').last().inputValue();
        if (!v.endsWith(' now')) throw new Error(`The title says ${v}`);
      },
    );
    await settle();
    await time(
      'Back to the location',
      2_000,
      () => app.getByTestId('back').last().click(),
      () => app.getByTestId(/^item-big-item-/).first().waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Back to the job',
      2_000,
      () => app.getByTestId('back').last().click(),
      () => app.getByTestId('group-big-room-101').waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'The job scrolled to its end',
      2_500,
      async () => {
        await app.locator('[data-testid^="group-big-"]').last().scrollIntoViewIfNeeded();
        for (let i = 0; i < 12; i += 1) await tab.mouse.wheel(0, 900);
      },
      () => app.getByTestId('group-big-exterior').waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Send opens with each company',
      3_000,
      () => app.getByTestId('tab-send').last().click(),
      () => app.getByText('Metro Electric').first().waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Back to the job, and on to Jobs',
      2_500,
      async () => {
        // Out of Send, Jobs goes back to the job it was opened over; again, to the list of jobs.
        await app.getByTestId('tab-jobs').last().click();
        await app.getByTestId('group-big-room-101').filter({ visible: true }).waitFor({ timeout: 30_000 });
        await app.getByTestId('tab-jobs').last().click();
      },
      () => app.getByTestId('today').filter({ visible: true }).waitFor({ timeout: 30_000 }),
    );
    await settle();
    await time(
      'Today, across every job',
      3_000,
      () => app.getByTestId('today').click(),
      () => app.getByText('Big Job').first().waitFor({ timeout: 30_000 }),
    );
    await settle();
    await app.getByTestId('back').last().click();
    await app.getByTestId('updates').waitFor();
    await settle();
    await time(
      'Updates, newest first',
      3_000,
      () => app.getByTestId('updates').click(),
      () => app.getByText('Big Job').first().waitFor({ timeout: 30_000 }),
    );
    void id;
  } catch (e) {
    problems.push(`stopped: ${e instanceof Error ? e.message.split('\n').slice(0, 6).join(' | ') : String(e)}`);
  } finally {
    await browser.close();
    server.close();
  }

  const slow = timings.filter((t) => t.ms > t.budget);
  console.log(`\nThe big job, with the processor ${SLOWER} times slower:\n`);
  for (const t of timings) console.log(`  ${t.ms > t.budget ? 'SLOW' : 'ok  '}  ${String(t.ms).padStart(6)} ms  (budget ${t.budget})  ${t.what}`);
  for (const p of problems) console.log(`  ${p}`);
  if (slow.length > 0 || problems.length > 0) {
    console.log(`\n${slow.length} too slow, ${problems.length} problems.`);
    process.exit(1);
  }
  console.log('\nEverything was quick enough.');
}

void main();
