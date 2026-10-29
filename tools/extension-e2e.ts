// End-to-end check of the built extension in a real Chromium, against the in-memory stand-in for
// Buildertrend. Every request to buildertrend.net is answered by the stand-in, so nothing real is touched.
//
//   npm run build:extension && npx tsx tools/extension-e2e.ts

import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JOBS } from '@punch/buildertrend';
import { FakeBuildertrend, fishFixture } from '../packages/buildertrend/test/fakeBuildertrend.js';

// The workspace's preinstalled Playwright resolves through require, not through import.
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const extensionPath = join(process.cwd(), 'apps', 'extension', 'dist');
const shotPath = join(process.cwd(), 'local', 'extension-panel.png');

async function main(): Promise<void> {
  const fake = new FakeBuildertrend([
    ...fishFixture(JOBS.fish),
    ...fishFixture(JOBS.sandbox).slice(0, 2).map((t) => ({ ...t, externalId: `sb-${t.externalId}`, taskId: t.taskId + 1000 })),
  ]);
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'bridge-')), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: { width: 1280, height: 900 },
  });
  await context.route('https://buildertrend.net/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.resourceType() === 'document') {
      await route.fulfill({ contentType: 'text/html', body: '<html><body style="background:#eef2f3"><h1>Buildertrend (stand-in)</h1></body></html>' });
      return;
    }
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
    const res = await fake.request(req.method() as never, url.pathname + url.search, body);
    await route.fulfill({ status: res.status, contentType: 'application/json', body: res.text });
  });

  const page = await context.newPage();
  await page.goto('https://buildertrend.net/app/');
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await page.waitForTimeout(500);
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://buildertrend.net/*' });
    if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
  });

  await page.getByText('1. Run read checks (Fish, read only)').click();
  await page.getByText('Done. Download the report').waitFor({ timeout: 20_000 });
  await page.getByText('2. Run write checks (sandbox only)').click();
  await page.getByText('Write checks', { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByText('Done. Download the report').waitFor({ timeout: 20_000 });

  const download = page.waitForEvent('download');
  await page.getByText('3. Download the report').click();
  const file = await download;

  const rows = await page.locator('div').filter({ hasText: /^(Pass|Fail|Look|Blocked|Skipped)$/ }).allTextContents();
  const fishUntouched = fake.tasks.filter((t) => t.jobId === JOBS.fish).length === fishFixture(JOBS.fish).length;
  const sandboxLeft = fake.tasks.filter((t) => t.jobId === JOBS.sandbox).length;
  const writesToFish = fake.calls.filter((c) => !c.startsWith('GET') && c !== 'POST /apix/v2/Tasks/list' && c.includes(String(JOBS.fish)));

  await page.screenshot({ path: shotPath, fullPage: false });
  await context.close();

  const counts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {});
  console.log('Check results in the panel:', counts);
  console.log('Report download:', file.suggestedFilename());
  console.log('Fish untouched:', fishUntouched, '| sandbox tasks left:', sandboxLeft, '| writes naming Fish:', writesToFish.length);
  console.log('Screenshot:', shotPath);
  if (!fishUntouched || sandboxLeft !== 2 || writesToFish.length > 0 || (counts.Fail ?? 0) > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
