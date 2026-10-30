// Walks the preview page in Chromium at iPhone size, inside a sandboxed frame under a strict
// content security policy (no eval, scripts inline only), the way the preview link serves it.
// Saves a screenshot of each step to local/preview-shots.
//
//   (cd apps/mobile && npx expo export --platform web) && node tools/build-preview.mjs && npx tsx tools/preview-e2e.ts

import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = process.cwd();
const page = readFileSync(join(root, 'local', 'preview', 'index.html'));
const shots = join(root, 'local', 'preview-shots');
mkdirSync(shots, { recursive: true });

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self'",
].join('; ');

const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
  } else if (req.url === '/host.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><iframe src="/artifact/preview/index.html" sandbox="allow-scripts allow-same-origin allow-forms" style="border:0;width:100vw;height:100vh"></iframe></body></html>');
  } else if (req.url === '/artifact/preview/index.html') {
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': CSP });
    res.end(page);
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(4319, r));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  });
  const tab = await context.newPage();
  const problems: string[] = [];
  tab.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  tab.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  tab.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });

  const app = tab.frameLocator('iframe');
  const shot = async (name: string) => tab.screenshot({ path: join(shots, `${name}.png`) });
  const steps: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    await fn();
    steps.push(name);
  };

  // Lets a slide or a sheet finish before a screenshot.
  const settle = (ms = 650) => tab.waitForTimeout(ms);
  const menu = async (testId: string) => {
    await app.getByTestId('more').last().click();
    await app.getByTestId(testId).waitFor();
    await settle(350);
    await app.getByTestId(testId).click();
    await settle(300);
  };

  try {
    await tab.goto('http://localhost:4319/host.html');
    await step('jobs list opens', async () => {
      await app.getByText('Sample Job').waitFor({ timeout: 20_000 });
      await settle();
      await shot('01-jobs');
    });
    await step('completion list by room, with count tiles', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByText('Kitchen 109').first().waitFor();
      await settle();
      await shot('02-list-by-room');
    });
    await step('a tile filters the list', async () => {
      await app.getByTestId('tile-not_ready').click();
      await app.getByText('Hang front door').first().waitFor();
      await settle(400);
      await shot('03-not-ready');
      await app.getByTestId('tile-open').click();
    });
    await step('group by trade from the menu', async () => {
      await app.getByTestId('more').last().click();
      await app.getByTestId('group-trade').waitFor();
      await settle(400);
      await shot('04-menu');
      await app.getByTestId('group-trade').click();
      await app.getByText('Air Conditioning', { exact: true }).first().waitFor();
      await settle(400);
      await shot('05-by-trade');
      await menu('group-room');
    });
    await step('search narrows the list', async () => {
      await app.getByTestId('search').last().fill('toilet');
      await app.getByText('Install toilet').first().waitFor();
      await settle(300);
      await shot('06-search');
      await app.getByTestId('search').last().fill('');
    });
    await step('the circle checks an item off', async () => {
      await app.getByTestId('check-item-6').click();
      await settle(200);
      await shot('07-checking');
      await app.getByTestId('item-item-6').waitFor({ state: 'detached', timeout: 5_000 });
      await menu('toggle-completed');
      await app.getByText(/Completed .* by Jake Ross/).first().waitFor();
      await settle(300);
      await shot('08-show-completed');
      await menu('toggle-completed');
    });
    await step('swipe a row for Remove, then Undo', async () => {
      await app.getByTestId('item-item-3').scrollIntoViewIfNeeded();
      await app.getByTestId('item-item-3').evaluate((el) => {
        const row = el.closest('.pl-swipe');
        if (row) row.scrollTo({ left: 400, behavior: 'smooth' });
      });
      await settle(400);
      await shot('09-swipe-actions');
      await app.getByTestId('remove-item-3').click();
      await app.getByText('Removed Touch up paint').waitFor();
      await settle(400);
      await shot('10-removed-toast');
      await app.getByRole('button', { name: 'Undo' }).click();
      await app.getByTestId('item-item-3').waitFor();
    });
    await step('open an item in its sheet', async () => {
      await app.getByTestId('item-item-1').click();
      await app.getByTestId('mark-complete').waitFor();
      await settle(700);
      await shot('11-item-sheet');
    });
    await step('mark it complete from the sheet', async () => {
      await app.getByTestId('mark-complete').click();
      await app.getByText(/Completed by Jake Ross on/).waitFor();
      await settle(300);
      await shot('12-item-complete');
      await app.getByTestId('save').click();
      await app.getByTestId('item-item-1').waitFor({ state: 'detached' });
      await settle();
    });
    await step('add an item', async () => {
      await app.getByTestId('new-item').click();
      await app.getByTestId('field-title').waitFor();
      await settle(700);
      await app.getByTestId('field-title').fill('Install towel bar');
      await app.getByTestId('field-description').fill('Master bathroom, right of the vanity.');
      await app.getByTestId('pick-company').click();
      await app.getByRole('button', { name: 'Gator Plumbing' }).waitFor();
      await settle(600);
      await shot('13-company-picker');
      await app.getByRole('button', { name: 'Gator Plumbing' }).click();
      await settle(500);
      await shot('14-new-item');
      await app.getByTestId('save').click();
      await app.getByText('Install towel bar').first().waitFor();
      await settle();
      await shot('15-list-with-new-item');
    });
    await step('a not ready item needs Waiting On', async () => {
      await app.getByTestId('new-item').click();
      await app.getByTestId('field-title').waitFor();
      await settle(700);
      await app.getByTestId('field-title').fill('Set mirror');
      await app.getByTestId('pick-company').click();
      await app.getByRole('button', { name: 'Triple H Painting' }).click();
      await settle(400);
      await app.getByRole('switch', { name: 'Ready' }).click();
      await app.getByTestId('save').click();
      await app.getByText('Not ready: say what it is waiting on.').waitFor();
      await settle(300);
      await shot('16-rule-blocks-save');
      await app.getByTestId('pick-waiting-on').click();
      await app.getByRole('button', { name: 'Owner', exact: true }).click();
      await settle(400);
      await app.locator('input[type="date"]').fill('2026-11-05');
      await settle(300);
      await shot('17-waiting-on');
      await app.getByTestId('save').click();
      await app.getByText('Waiting on Owner · Ready by November 5').first().waitFor();
    });
    await step('Cancel asks before throwing away changes', async () => {
      await app.getByTestId('new-item').click();
      await app.getByTestId('field-title').waitFor();
      await settle(700);
      await app.getByTestId('field-title').fill('Caulk window');
      await app.getByTestId('cancel').click();
      await app.getByRole('button', { name: 'Discard Changes' }).waitFor();
      await settle(500);
      await shot('18-discard');
      await app.getByRole('button', { name: 'Discard Changes' }).click();
      await app.getByTestId('field-title').waitFor({ state: 'detached' });
      await settle();
    });
    await step('paste rooms in Job Setup', async () => {
      await menu('job-setup');
      await app.getByTestId('paste-rooms').waitFor();
      await settle();
      await shot('19-setup');
      await app.getByTestId('paste-rooms').click();
      await app.getByTestId('field-rooms').waitFor();
      await settle(600);
      await app.getByTestId('field-rooms').fill('Level 3:\nRoof Deck 301\nOffice 302');
      await app.getByText('2 New').waitFor();
      await settle(300);
      await shot('20-paste-rooms');
      await app.getByTestId('paste-add').click();
      await app.getByText('2 rooms added').waitFor();
      await app.getByText('Roof Deck 301').first().waitFor();
      await settle(400);
      await shot('21-rooms-added');
    });
    await step('add a company to the job', async () => {
      await app.getByRole('tab', { name: 'Companies' }).click();
      await app.getByTestId('add-company').click();
      await app.getByTestId('field-new-company').waitFor();
      await settle(600);
      await app.getByTestId('field-new-company').fill('Bayshore Glass');
      await app.getByTestId('pick-company-trade').click();
      await app.getByRole('button', { name: 'Carpentry', exact: true }).click();
      await settle(400);
      await shot('22-add-company');
      await app.getByTestId('company-add').click();
      await app.getByText('Bayshore Glass added to the job').waitFor();
      await settle(400);
      await shot('23-companies');
    });
  } catch (e) {
    await shot('zz-failure');
    problems.push(`step failed after "${steps.at(-1) ?? 'start'}": ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`Steps passed (${steps.length}): ${steps.join(' > ')}`);
  console.log(problems.length ? `Problems:\n  ${problems.join('\n  ')}` : 'No console errors, no page errors.');
  console.log(`Screenshots: ${shots}`);
  if (problems.length) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
