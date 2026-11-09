// The App Store's iPhone screenshots, from the preview page with its sample data, at the 6.9 inch
// size Apple asks for (1320 by 2868). The sample job gets a house's name and address first, so the
// pictures read like a real job. Saved to local/app-store-shots.
//
//   npm run preview:build && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx tsx tools/app-store-shots.ts

import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = process.cwd();
const page = readFileSync(join(root, 'local', 'preview', 'index.html'));
const out = join(root, 'local', 'app-store-shots');
mkdirSync(out, { recursive: true });

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

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(4321, r));
  const browser = await chromium.launch();
  // 440 by 956 points at three times: the 6.9 inch iPhone.
  const context = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const tab = await context.newPage();
  const app = tab.frameLocator('iframe');
  const settle = (ms = 900) => tab.waitForTimeout(ms);
  const shot = async (name: string) => {
    await settle();
    await tab.screenshot({ path: join(out, `${name}.png`) });
    console.log(`  ${name}.png`);
  };
  const seen = (testId: string) => app.getByTestId(testId).filter({ visible: true }).last();
  const menu = async (testId: string) => {
    await seen('more').click();
    await app.getByTestId(testId).waitFor();
    await settle(400);
    await app.getByTestId(testId).click();
    await settle(400);
  };

  try {
    await tab.goto('http://localhost:4321/host.html');
    await app.getByTestId('job-job-preview').waitFor({ timeout: 30_000 });
    // A house's name and address in place of the sample's.
    await app.getByTestId('job-job-preview').click();
    await app.getByTestId('group-room-1').waitFor();
    await settle();
    await menu('edit-job');
    await app.getByTestId('edit-job-name').fill('Bay Isles House');
    await app.getByTestId('edit-job-address').fill('412 Bay Isles Road');
    await app.getByTestId('edit-job-save').click();
    await app.getByText('Bay Isles House', { exact: true }).filter({ visible: true }).first().waitFor();
    await shot('2-job');
    await seen('back').click();
    await app.getByTestId('job-job-preview').waitFor();
    // The second job too, held down for Edit.
    await app.getByTestId('job-job-bay').click({ delay: 700 });
    await app.getByRole('dialog').getByRole('button', { name: 'Edit the Name and Address' }).click();
    await app.getByTestId('edit-job-address').fill('27 Gulf Shore Drive');
    await app.getByTestId('edit-job-save').click();
    await app.getByText('27 Gulf Shore Drive').first().waitFor();
    // The preview's own note is not part of the app.
    await app.getByText(/^Preview with sample data/).evaluateAll((els) => els.forEach((el) => ((el as HTMLElement).style.visibility = 'hidden')));
    await shot('1-jobs');
    await app.getByTestId('job-job-preview').click();
    await app.getByTestId('group-room-1').waitFor();
    await settle();
    await app.getByTestId('group-room-1').click();
    await app.getByTestId('item-item-16').waitFor();
    await shot('3-location');
    await app.getByTestId('item-item-16').click();
    await app.getByTestId('item-summary').waitFor();
    await shot('4-item');
    await seen('back').click();
    await settle();
    await seen('back').click();
    await app.getByTestId('group-room-1').waitFor();
    await settle();
    await menu('plans');
    await app.getByTestId('plan-image').waitFor();
    await shot('5-plans');
    await seen('back').click();
    await settle();
    await app.getByTestId('tab-send').last().click();
    await app.getByText('SMS Carpentry').first().waitFor();
    await shot('6-send');
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`Saved in ${out}`);
}

void main();
