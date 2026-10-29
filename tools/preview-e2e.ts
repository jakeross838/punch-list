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

  try {
    await tab.goto('http://localhost:4319/host.html');
    await step('jobs list opens', async () => {
      await app.getByText('Preview job (sample data)').waitFor({ timeout: 20_000 });
      await shot('01-jobs');
    });
    await step('completion list by room', async () => {
      await app.getByText('Preview job (sample data)').click();
      await app.getByText('By room').waitFor();
      await app.getByText('Kitchen 109').first().waitFor();
      await shot('02-list-by-room');
    });
    await step('switch to by trade', async () => {
      await app.getByText('By trade').click();
      await app.getByText('Plumbing', { exact: true }).first().waitFor();
      await shot('03-list-by-trade');
      await app.getByText('By room').click();
    });
    await step('open an item', async () => {
      await app.getByText(/Install toilet/).first().click();
      await app.getByText('Mark complete').waitFor();
      await shot('04-item');
    });
    await step('mark it complete', async () => {
      await app.getByText('Mark complete').click();
      await app.getByText(/Completed by Jake Ross/).waitFor();
      await shot('05-complete');
    });
    await step('back to the list', async () => {
      await app.locator('[aria-label="Go back"]:visible').first().click();
      await app.getByText('Add an item').waitFor();
    });
    await step('paste rooms in job setup', async () => {
      await app.getByText('Setup', { exact: true }).click();
      await app.getByText('Paste the room list from the plans, in floor order').waitFor();
      await app.getByPlaceholder(/Level 1:/).fill('Level 3:\nRoof Deck 301\nOffice 302');
      await app.getByText('Add 2 rooms').click();
      await app.getByText(/2 added/).waitFor();
      await shot('06-setup');
      await app.locator('[aria-label="Go back"]:visible').first().click();
    });
    await step('add an item', async () => {
      await app.getByText('Add an item').click();
      await app.getByPlaceholder('Install toilet').fill('Install towel bar');
      await app.getByPlaceholder('Where exactly, and what is involved').fill('Master bathroom, right of the vanity.');
      await app.getByText('Company', { exact: true }).locator('xpath=..').getByText('Choose').click();
      await app.getByText('Gator Plumbing').last().click();
      await shot('07-new-item');
      await app.getByText('Add to the list').click();
      await app.getByText(/Install towel bar/).first().waitFor();
      await shot('08-list-with-new-item');
    });
    await step('a not ready item needs Waiting On', async () => {
      await app.getByText('Add an item').click();
      await app.getByPlaceholder('Install toilet').fill('Set mirror');
      await app.getByText('Company', { exact: true }).locator('xpath=..').getByText('Choose').click();
      await app.getByText('Triple H Painting').last().click();
      await app.getByRole('switch', { name: 'Ready' }).click();
      await app.getByText('Add to the list').click();
      await app.getByText('Not ready: say what it is waiting on').waitFor();
      await shot('09-rule-blocks-save');
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
