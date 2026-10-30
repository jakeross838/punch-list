// Walks the preview page in Chromium at iPhone size, inside a sandboxed frame under a strict
// content security policy (no eval, scripts inline only), the way the preview link serves it.
// Saves a screenshot of each step to local/preview-shots.
//
//   (cd apps/mobile && npx expo export --platform web) && node tools/build-preview.mjs && npx tsx tools/preview-e2e.ts

import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// A stand-in job photo for the camera: a bathroom vanity wall, drawn, then saved as a JPEG.
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 390 520">
<rect width="390" height="520" fill="#DCD7CF"/><rect y="300" width="390" height="220" fill="#EFECE7"/>
<rect x="40" y="70" width="310" height="190" rx="6" fill="#C9D3D6" stroke="#B7BFC2" stroke-width="3"/>
<rect x="20" y="300" width="350" height="22" fill="#6B6560"/><rect x="40" y="322" width="310" height="198" fill="#F6F4F0"/>
<path d="M195 322v198M40 400h310" stroke="#D5CFC6" stroke-width="2"/><rect x="170" y="284" width="50" height="18" rx="3" fill="#9A958E"/></svg>`;

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

  // Make the camera's photo first.
  const photoPath = join(root, 'local', 'test-photo.jpg');
  {
    const p = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await p.setContent(`<html><body style="margin:0">${PHOTO_SVG}</body></html>`);
    writeFileSync(photoPath, await p.screenshot({ type: 'jpeg', quality: 85 }));
    await p.close();
  }

  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  });
  // The preview link can ask Claude about a photo (on the viewer's own account); here a stand-in
  // answers, a little slowly like the real thing, so drafts filling themselves in can be walked
  // without spending anything.
  // Passed as text, so the browser gets it exactly as written.
  await context.addInitScript(`
    (() => {
      const sample = Object.assign(async () => ({ text: '' }), {
        limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 20000000, mediaTypes: ['image/jpeg'] } }),
        json: async () => {
          await new Promise((done) => setTimeout(done, 2000));
          return { title: 'install towel bar', description: 'Left of the vanity, 24 inches.', trade: 'Carpentry', company: 'SMS Carpentry' };
        },
      });
      window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
    })();
  `);
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
  /** A finger drag on the markup photo, from and to fractions of it. */
  const drag = async (from: [number, number], to: [number, number]) => {
    const box = await app.getByTestId('markup-canvas').boundingBox();
    if (!box) throw new Error('No markup canvas');
    const x = (f: number) => box.x + box.width * f;
    const y = (f: number) => box.y + box.height * f;
    await tab.mouse.move(x(from[0]), y(from[1]));
    await tab.mouse.down();
    await tab.mouse.move(x(to[0]), y(to[1]), { steps: 10 });
    await tab.mouse.up();
    await settle(150);
  };
  const takePhoto = async () => {
    const chooser = tab.waitForEvent('filechooser');
    await app.getByTestId('shutter').click();
    await (await chooser).setFiles(photoPath);
    await app.getByTestId('markup-canvas').waitFor();
    await settle(500);
  };

  try {
    await tab.goto('http://localhost:4319/host.html');
    await step('jobs list opens', async () => {
      await app.getByText('Sample Job').waitFor({ timeout: 20_000 });
      await settle();
      await shot('01-jobs');
    });
    await step('the job opens to its levels and locations', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await shot('02-job-rooms');
    });
    await step('a location shows its items, calm', async () => {
      await app.getByTestId('group-room-1').click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
      await shot('03-room');
    });
    await step('the circle checks an item off', async () => {
      await app.getByTestId('check-item-3').click();
      await settle(200);
      await shot('04-checking');
      // A way back from a tap that was a mistake.
      await app.getByText('Completed Touch up paint').waitFor();
      await app.getByTestId('show-done').waitFor({ timeout: 5_000 });
      await app.getByTestId('show-done').click();
      await app.getByText('Completed', { exact: true }).waitFor();
      await settle(300);
      await shot('05-completed');
    });
    await step('swipe a row for Remove, then Undo', async () => {
      await app.getByTestId('item-item-2').evaluate((el) => {
        const row = el.closest('.pl-swipe');
        if (row) row.scrollTo({ left: 400, behavior: 'smooth' });
      });
      await settle(400);
      await shot('06-swipe-actions');
      await app.getByTestId('remove-item-2').click();
      await app.getByText('Removed Install pendant lights').waitFor();
      await settle(300);
      await app.getByRole('button', { name: 'Undo' }).click();
      await app.getByTestId('item-item-2').waitFor();
    });
    await step('walk to the next location and back', async () => {
      await app.getByTestId('room-next').click();
      await app.getByText('Guest Bedroom 114').first().waitFor();
      await settle();
      await shot('07-next-room');
      await app.getByTestId('room-previous').click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
    });
    await step('an item edits in place: Ready is a checkbox, Not Ready asks what it waits on', async () => {
      await app.getByTestId('item-item-1').click();
      await app.getByTestId('mark-complete').waitFor();
      await settle();
      await shot('08-item');
      await app.getByTestId('ready-check').click();
      await app.getByText('It can be done now.').waitFor();
      await app.getByTestId('ready-check').click();
      await app.getByTestId('not-ready-box').waitFor();
      await settle(400);
      if ((await app.getByTestId('not-ready-done').getAttribute('aria-disabled')) !== 'true') throw new Error('Done should wait for a choice');
      await app.getByTestId('waiting-Owner').click();
      await app.getByTestId('waiting-Volcano Stone').click();
      await app.getByTestId('not-ready-by').fill('2026-11-05');
      await settle(300);
      await shot('09-not-ready-box');
      await app.getByTestId('not-ready-done').click();
      await app.getByText('Waiting on Owner and Volcano Stone, ready by November 5').waitFor();
      await app.getByTestId('field-description').fill('Range wall, both sides of the hood, after the stone is set.');
      await app.getByTestId('field-description').blur();
      await settle(300);
      await shot('09b-item-edited');
      // The type: Additional brings up the order number; back to Incomplete.
      await app.getByRole('tab', { name: 'Additional' }).click();
      await app.getByTestId('field-po').waitFor();
      await app.getByText('Extra work. Add the purchase order or change order number once it is priced.').waitFor();
      await settle(300);
      await shot('09d-additional');
      await app.getByRole('tab', { name: 'Incomplete' }).click();
      await app.getByTestId('field-po').waitFor({ state: 'detached' });
      // Leave and come back: the changes were saved as they were made.
      await app.getByTestId('back').last().click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
      await app.getByTestId('item-item-1').click();
      await app.getByText('Waiting on Owner and Volcano Stone, ready by November 5').waitFor();
      if ((await app.getByTestId('field-description').inputValue()) !== 'Range wall, both sides of the hood, after the stone is set.') {
        throw new Error('The description did not save');
      }
      await app.getByTestId('mark-complete').click();
      await app.getByTestId('reopen').waitFor();
      await app.getByText(/By Jake Ross on/).waitFor();
      await settle(300);
      await shot('09c-item-complete');
      await app.getByTestId('back').last().click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
    });
    await step('the camera opens on the location', async () => {
      await app.getByTestId('camera').last().click();
      await app.getByTestId('shutter').waitFor();
      await app.getByText('Kitchen 109').last().waitFor();
      await settle(700);
      await shot('10-camera');
    });
    await step('take a photo and mark it up: a circle, a measurement, numbered spots and a quick note', async () => {
      await takePhoto();
      await shot('11-markup');
      await app.getByTestId('tool-circle').click();
      await drag([0.2, 0.12], [0.8, 0.45]);
      await app.getByTestId('tool-pen').click();
      await drag([0.1, 0.7], [0.35, 0.8]);
      await app.getByTestId('markup-undo').click();
      // A measurement: the size is written out on the photo as it is typed.
      await app.getByTestId('tool-measure').click();
      await app.getByText('Drag from one end to the other, then type the size.').waitFor();
      await drag([0.12, 0.58], [0.88, 0.58]);
      await app.getByTestId('markup-size').fill('24');
      await app.getByText('24 inches').first().waitFor();
      await app.getByTestId('unit-feet').click();
      await app.getByText('24 feet').first().waitFor();
      await app.getByTestId('markup-size').fill(`2'6"`);
      await app.getByText('2 feet 6 inches').first().waitFor();
      await app.getByTestId('markup-size').fill('30');
      await app.getByTestId('unit-inches').click();
      await app.getByText('30 inches').first().waitFor();
      await settle(300);
      await shot('12-measure');
      await app.getByTestId('markup-size-add').click();
      // Numbered spots: one tap each.
      await app.getByTestId('tool-number').click();
      await app.getByText('Tap each spot to number it.').waitFor();
      for (const x of [0.28, 0.5, 0.72]) await drag([x, 0.8], [x, 0.8]);
      await app.getByTestId('markup').getByText('3', { exact: true }).first().waitFor();
      // A note from the standard words.
      await app.getByTestId('tool-text').click();
      await drag([0.62, 0.3], [0.62, 0.3]);
      await app.getByTestId('quick-touch-up').waitFor();
      await settle(300);
      await shot('12b-quick-notes');
      await app.getByTestId('quick-gap').click();
      await app.getByTestId('markup').getByText('Gap', { exact: true }).first().waitFor();
      await settle(300);
      await shot('12c-marked-up');
    });
    await step('the form fills in from the title', async () => {
      await app.getByTestId('markup-next').click();
      await app.getByTestId('field-title').waitFor();
      await app.getByTestId('fill-in').waitFor();
      await settle(800);
      await shot('13-new-item');
      await app.getByTestId('field-title').fill('adj');
      await app.getByTestId('title-suggestions').waitFor();
      await settle(300);
      await shot('14-title-suggestions');
      await app.getByTestId('suggestion-0').click();
      await app.getByText('Company and trade filled in from the title.').waitFor();
      await app.getByText('SMS Carpentry').last().waitFor();
      await settle(300);
      await shot('15-filled-in');
    });
    await step('Save and Next goes back to the camera', async () => {
      await app.getByTestId('save-next').click();
      await app.getByText('Saved Adjust cabinet door').waitFor();
      await app.getByTestId('shutter').waitFor();
      await settle(700);
      await shot('16-saved-next');
    });
    await step('a new item that is not ready says what it waits on', async () => {
      await app.getByTestId('no-photo').click();
      await app.getByTestId('field-title').waitFor();
      await settle(800);
      await app.getByTestId('field-title').fill('Set mirror');
      await app.getByTestId('field-description').click();
      await app.getByTestId('pick-company').click();
      await app.getByRole('button', { name: 'Triple H Painting' }).click();
      await settle(400);
      await app.getByTestId('ready-check').click();
      await app.getByTestId('not-ready-box').waitFor();
      await settle(400);
      await shot('17-not-ready-box');
      await app.getByTestId('waiting-other').click();
      await app.getByTestId('waiting-new').fill('Coastal Mirror');
      await app.getByTestId('waiting-add').click();
      await app.getByTestId('waiting-Owner').click();
      await app.getByTestId('not-ready-by').fill('2026-11-05');
      await settle(300);
      await shot('18-waiting-on');
      await app.getByTestId('not-ready-done').click();
      await app.getByText('Waiting on Coastal Mirror and Owner, ready by November 5').waitFor();
      await settle(300);
      await app.getByTestId('save').click();
      await app.getByTestId('item-item-16').waitFor();
      await app.getByText('Set mirror').first().waitFor();
      await app.getByText('Adjust cabinet door').nth(1).waitFor();
      await settle(700);
      await shot('19-room-after-walk');
    });
    await step('the new item keeps its photo and marks', async () => {
      await app.getByText('Adjust cabinet door').nth(1).click();
      await app.getByTestId('item-photo').waitFor();
      await settle();
      await shot('20-new-item-detail');
      await app.getByTestId('item-photo').click();
      await app.getByTestId('viewer-done').waitFor();
      await settle(500);
      await shot('20b-whole-photo');
      await app.getByTestId('viewer-done').click();
      await app.getByTestId('viewer-done').waitFor({ state: 'detached' });
      await app.getByTestId('back').last().click();
      await settle();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Draft saves each photo as a draft, and Claude fills it in', async () => {
      await app.getByTestId('group-room-4').click();
      await settle();
      await app.getByTestId('camera').last().click();
      await app.getByTestId('shutter').waitFor();
      await app.getByTestId('mode-quick').click();
      await app.getByText('Each photo saves as a draft. Claude fills it in.').waitFor();
      await settle(400);
      for (let i = 0; i < 2; i += 1) {
        const chooser = tab.waitForEvent('filechooser');
        await app.getByTestId('shutter').click();
        await (await chooser).setFiles(photoPath);
        await app.getByText(`${i + 1} ${i === 0 ? 'draft' : 'drafts'} saved.`).waitFor();
        await settle(500);
      }
      await shot('21-quick-snap');
      await app.getByTestId('mode-item').click();
      await app.getByTestId('camera-close').click();
      await settle(700);
      await app.getByTestId('back').last().click();
      await app.getByTestId('open-unfinished').waitFor();
      await settle();
      await shot('22-job-unfinished');
    });
    await step('check them sitting down: each is filled in, Mark Up, then Next puts it on the lists', async () => {
      await app.getByTestId('open-unfinished').click();
      await app.getByText('3 drafts. Filling in from the photos.').waitFor();
      await app.getByText(/, filling in from the photo$/).first().waitFor();
      await settle(300);
      await shot('23-drafts-filling');
      await app.getByText('3 drafts. Tap one to finish it.').waitFor({ timeout: 20000 });
      if ((await app.getByText('No title yet').count()) !== 0) throw new Error('A draft did not fill in');
      await settle();
      await shot('23b-drafts-filled');
      await app.getByText('Install towel bar').first().click();
      await app.getByText('Check it over, then tap Next to put it on the lists.').waitFor();
      if ((await app.getByTestId('field-title').inputValue()) !== 'Install towel bar') throw new Error('The draft did not fill in its title');
      await app.getByText('SMS Carpentry').first().waitFor();
      if ((await app.getByTestId('fill-in').count()) !== 0) throw new Error('Fill In shows with nothing left to fill');
      await settle(400);
      await shot('24-draft-filled-in');
      await app.getByTestId('mark-up').click();
      await app.getByTestId('markup-canvas').waitFor();
      await settle(500);
      await app.getByTestId('tool-circle').click();
      await drag([0.3, 0.3], [0.6, 0.55]);
      await app.getByTestId('markup-next').click();
      await app.getByTestId('markup-canvas').waitFor({ state: 'detached' });
      await settle(400);
      await shot('26-marked-after');
      await app.getByTestId('next-unfinished').click();
      await settle();
      await app.getByText('Draft', { exact: true }).last().waitFor();
      await settle();
      await app.getByTestId('back').last().click();
      await app.getByText('2 drafts. Tap one to finish it.').waitFor();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      // The one checked over is on the lists now; the two still drafts are not.
      await app.getByTestId('open-search').click();
      await app.getByTestId('search').last().fill('towel');
      await app.getByText('Install towel bar').first().waitFor();
      if ((await app.getByText('Install towel bar').count()) !== 1) throw new Error('Next did not put the draft on the lists');
      await app.getByTestId('search-cancel').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('finishing a company in a location offers to free what waited on it', async () => {
      await app.getByTestId('group-room-7').click();
      await app.getByTestId('check-item-18').click();
      await app.getByText('Set vanity tops was waiting on Gator Plumbing. Ready now?').waitFor();
      await settle(300);
      await shot('27-release');
      await app.getByRole('button', { name: 'Mark Ready' }).click();
      await settle(500);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Past Due is on the Schedule, with a red count on its button', async () => {
      await app.getByTestId('schedule-badge').waitFor();
      await app.getByTestId('schedule').click();
      await app.getByTestId('schedule-past-due').click();
      await app.getByText('Hang front door').waitFor();
      await app.getByText(/Foyer 115, \d+ days? past due/).waitFor();
      await app.getByText(/Bathroom 116, visit ended \d+ days? ago/).waitFor();
      await settle();
      await shot('28-past-due');
      await app.getByTestId('back').last().click();
      await settle();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('View and Filter: by trade, saved as the default', async () => {
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(600);
      await shot('29-view');
      await app.getByRole('tab', { name: 'Trade' }).click();
      await app.getByTestId('show-not_ready').click();
      await settle(300);
      await app.getByTestId('save-default').click();
      await app.getByText('Saved as My Default').waitFor();
      await app.getByTestId('view-done').click();
      await app.getByText('Carpentry', { exact: true }).first().waitFor();
      await settle(600);
      await shot('29b-by-trade-not-ready');
      await app.getByTestId('filter').click();
      await app.getByTestId('view-standard').click();
      await app.getByTestId('save-default').click();
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('search finds an item', async () => {
      await app.getByTestId('open-search').click();
      await app.getByTestId('search').last().fill('toilet');
      await app.getByText('Install toilet').first().waitFor();
      await settle(300);
      await shot('30-search');
      await app.getByTestId('search-cancel').click();
      await app.getByTestId('group-room-1').waitFor();
    });
    await step('group by what items wait on, and clear a holdup for all its items at once', async () => {
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(600);
      await app.getByRole('tab', { name: 'Waiting' }).click();
      await settle(300);
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-ready').waitFor();
      await app.getByTestId('group-waiting:owner').waitFor();
      await settle(600);
      await shot('31-by-waiting');
      await app.getByTestId('group-waiting:owner').click();
      await app.getByText('Waiting on Owner').first().waitFor();
      await app.getByTestId('holdup-ready-by').fill('2026-11-12');
      await settle(300);
      await shot('32-waiting-on-owner');
      await app.getByTestId('holdup-clear').click();
      await app.getByRole('button', { name: /^Mark \d+ items? Ready$/ }).click();
      await app.getByText('No longer waiting on Owner').waitFor();
      await settle(300);
      await app.getByRole('button', { name: 'Undo' }).click();
      await app.getByTestId('group-waiting:owner').waitFor();
      await settle();
      await app.getByTestId('filter').click();
      await app.getByTestId('view-standard').click();
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('the schedule: schedule a visit from the plan, then confirm it', async () => {
      await app.getByTestId('schedule').click();
      await app.getByText('Not Scheduled').waitFor();
      await settle();
      await shot('33-schedule');
      await app.getByTestId('schedule-company-company-4').click();
      await app.getByTestId('book-ready').waitFor();
      await settle();
      await shot('34-plan');
      await app.getByTestId('book-ready').click();
      await app.getByTestId('visit-save').waitFor();
      await settle(600);
      await app.getByTestId('visit-days-more').click();
      await shot('35-book-visit');
      await app.getByTestId('visit-save').click();
      await app.getByTestId('visit-sheet').waitFor({ state: 'detached' });
      // The new visit on the plan (the schedule underneath shows visits too).
      const booked = app.getByTestId(/^visit-[0-9a-f]{8}-/).last();
      await booked.waitFor();
      await settle(400);
      await booked.click();
      await app.getByTestId('visit-confirmed').waitFor();
      await settle(600);
      await app.getByTestId('visit-confirmed').click();
      await app.getByTestId('visit-save').click();
      await app.getByTestId('visit-sheet').waitFor({ state: 'detached' });
      await booked.getByText('Confirmed', { exact: true }).waitFor();
      await settle(400);
      await shot('36-plan-booked');
      await app.getByTestId('back').last().click();
      await app.getByText('Schedule', { exact: true }).first().waitFor();
      await settle();
      await shot('37-schedule-booked');
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Send Lists: a company list and the whole job, ready to send', async () => {
      await app.getByTestId('send').last().click();
      await app.getByTestId('send-done').waitFor();
      await settle(700);
      await shot('38-send-lists');
      await app.getByTestId('send-company-4').click();
      const doc = app.getByTestId('doc-preview');
      await doc.getByText('Scheduled Visits', { exact: true }).waitFor();
      await doc.getByText('Waiting', { exact: true }).first().waitFor();
      await doc.getByText('New', { exact: true }).first().waitFor();
      await doc.getByText(/^How many days for (this item|these \d+ items)\?$/).first().waitFor();
      await settle(800);
      await shot('39-company-list');
      await app.getByTestId('mark-sent').click();
      await app.getByText('Marked as sent to SMS Carpentry').waitFor();
      await app.getByText(/Sent [A-Z][a-z]+\s\d+\./).first().waitFor();
      await settle(400);
      await app.getByTestId('send-party-owner').click();
      await doc.getByText('Decisions Needed', { exact: true }).first().waitFor();
      await settle(800);
      await shot('40-owner-list');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await settle(300);
      await app.getByTestId('send-job').click();
      await doc.getByText('Whole Job', { exact: true }).waitFor();
      await doc.getByText('Set mirror').waitFor();
      await settle(800);
      await shot('41-whole-job-list');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await app.getByTestId('send-done').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Item Form: fields, an added field and a standard title', async () => {
      await menu('item-form');
      await app.getByTestId('form-kind').waitFor();
      await settle(700);
      await shot('42-item-form');
      await app.getByTestId('add-field').click();
      await app.getByTestId('field-label').fill('Walk');
      await app.getByTestId('field-choices').fill('Owner Walk\nArchitect Walk\nRoss Built Walk');
      await settle(300);
      await shot('43-new-field');
      await app.getByTestId('field-save').click();
      await app.getByText('Walk', { exact: true }).waitFor();
      await app.getByTestId('standard-titles').click();
      await app.getByTestId('title-new').fill('Adjust cabinet hinge');
      await app.getByTestId('title-trade').click();
      await app.getByRole('button', { name: 'Carpentry', exact: true }).click();
      await settle(400);
      await app.getByTestId('title-add').click();
      await app.getByText('Adjust cabinet hinge').waitFor();
      await settle(300);
      await shot('44-standard-titles');
      await app.getByTestId('titles-done').click();
      await settle(400);
      await app.getByTestId('form-done').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('paste locations in Job Setup', async () => {
      await menu('job-setup');
      await app.getByTestId('paste-rooms').waitFor();
      await settle();
      await shot('45-setup');
      await app.getByTestId('paste-rooms').click();
      await app.getByTestId('field-rooms').waitFor();
      await settle(600);
      await app.getByTestId('field-rooms').fill('Level 3:\nRoof Deck 301\nOffice 302');
      await app.getByText('2 New').waitFor();
      await app.getByTestId('paste-add').click();
      await app.getByText('2 locations added').waitFor();
      await app.getByText('Roof Deck 301').first().waitFor();
      await settle(400);
    });
    await step('fix a location in Job Setup: a new name, then remove it and Undo', async () => {
      const row = (name: string) => app.getByTestId(/^setup-location-/).filter({ hasText: name });
      await row('Office 302').click();
      await app.getByTestId('field-location').waitFor();
      await settle(600);
      await app.getByTestId('field-location').fill('kitchen 109');
      await app.getByText('Kitchen 109 is already a location on this job.').waitFor();
      await app.getByTestId('field-location').fill('302 home office');
      await app.getByText('The new name shows on every item and list.').waitFor();
      await settle(300);
      await shot('47-location');
      await app.getByTestId('location-save').click();
      await app.getByText('Saved Home Office 302').waitFor();
      await row('Home Office 302').waitFor();
      await settle(500);
      await row('Home Office 302').click();
      await app.getByTestId('location-remove').waitFor();
      await settle(600);
      await app.getByTestId('location-remove').click();
      await app.getByText('Removed Home Office 302 from the job').waitFor();
      await row('Home Office 302').waitFor({ state: 'detached' });
      await settle(300);
      await app.getByRole('button', { name: 'Undo' }).click();
      await row('Home Office 302').waitFor();
      // A location with open items stays until they are done or moved.
      await app.getByTestId('setup-location-room-1').click();
      await app.getByText(/^It has \d+ open items\. Finish them or move them to another location first\.$/).waitFor();
      await settle(600);
      await shot('48-location-has-items');
      await app.getByTestId('location-cancel').click();
      await settle(500);
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
      await app.getByTestId('company-add').click();
      await app.getByText('Bayshore Glass added to the job').waitFor();
      await settle(400);
      await shot('46-companies');
    });
    await step('fix a company in Job Setup: a new name and trade, then remove it and Undo', async () => {
      const row = (name: string) => app.getByTestId(/^setup-company-/).filter({ hasText: name });
      await row('Bayshore Glass').click();
      await app.getByTestId('field-company-name').waitFor();
      await settle(600);
      await app.getByTestId('field-company-name').fill('sms carpentry');
      await app.getByText('Another company is already named sms carpentry.').waitFor();
      await app.getByTestId('field-company-name').fill('Bayshore Glass and Mirror');
      await app.getByTestId('pick-edit-trade').click();
      await app.getByRole('button', { name: 'Ross Built Crew', exact: true }).click();
      await app.getByText('Its items on this job move to the new trade.').waitFor();
      await settle(400);
      await shot('49-company');
      await app.getByTestId('company-save').click();
      await app.getByText('Saved Bayshore Glass and Mirror').waitFor();
      await row('Bayshore Glass and Mirror').getByText('Ross Built Crew').waitFor();
      await settle(500);
      await row('Bayshore Glass and Mirror').click();
      await app.getByTestId('company-remove').waitFor();
      await settle(600);
      await app.getByTestId('company-remove').click();
      await app.getByText('Removed Bayshore Glass and Mirror from the job').waitFor();
      await row('Bayshore Glass and Mirror').waitFor({ state: 'detached' });
      await app.getByRole('button', { name: 'Undo' }).click();
      await row('Bayshore Glass and Mirror').waitFor();
      // A company with open items stays on the job until they are done or given to another company.
      await row('SMS Carpentry').click();
      await app.getByText(/^It has \d+ open items on this job\. Finish them or pick another company for them first\.$/).waitFor();
      await settle(600);
      await shot('50-company-has-items');
      await app.getByTestId('company-edit-cancel').click();
      await settle(500);
    });
    await step('the job name and address change right where they are', async () => {
      await app.getByTestId('field-job-name').fill('Sample Job North');
      // Leaving a field saves it.
      await app.getByTestId('field-job-address').click();
      await app.getByTestId('field-job-address').fill('715 North Shore Drive');
      await app.getByTestId('field-job-name').click();
      await settle(400);
      await shot('51-job-fields');
      await app.getByTestId('back').last().click();
      await app.getByText('Sample Job North', { exact: true }).first().waitFor();
      await app.getByTestId('back').last().click();
      await app.getByText('715 North Shore Drive', { exact: true }).first().waitFor();
      await settle(500);
      await shot('52-jobs-renamed');
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
