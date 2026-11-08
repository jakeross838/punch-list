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

  // A floor plan as an architect's PDF: room tags and a title block in its text.
  const plansPath = join(root, 'local', 'test-plans.pdf');
  {
    const p = await browser.newPage();
    const tag = (x: number, y: number, name: string, number: string) =>
      `<div style="position:absolute;left:${x}in;top:${y}in;text-align:center;font:bold 11pt Arial">${name}<br>${number}<br><span style="font:8pt Arial">12'-6" x 14'-0"</span></div>`;
    await p.setContent(
      `<html><body style="margin:0;position:relative;width:36in;height:24in">` +
        tag(4, 4, 'GARAGE', '101') +
        tag(12, 4, 'LIVING', '107') +
        tag(18, 4, 'KITCHEN', '109') +
        tag(22, 4, 'PANTRY', '110') +
        tag(18, 10, 'MUDROOM', '120') +
        `<div style="position:absolute;left:1in;top:21in;font:bold 20pt Arial">FIRST FLOOR PLAN</div>` +
        `<div style="position:absolute;left:28in;top:20in;font:10pt Arial">PREVIEW RESIDENCE<br>412 BAY ISLES ROAD, LONGBOAT KEY, FLORIDA 34228</div>` +
        `</body></html>`,
    );
    writeFileSync(plansPath, await p.pdf({ width: '36in', height: '24in', printBackground: true }));
    await p.close();
  }

  // A punch list someone else wrote, as a PDF of text.
  const listPath = join(root, 'local', 'test-list.pdf');
  {
    const p = await browser.newPage();
    await p.setContent(
      `<html><body style="font:12pt Arial;padding:40px"><h2>Owner Walkthrough Punch List</h2><h3>Kitchen 109</h3><p>1. Pantry door sticks at the top.</p><h3>Laundry 119</h3><p>2. Touch up paint by the dryer.</p><p>3. Dryer vent cover is missing. DONE</p></body></html>`,
    );
    writeFileSync(listPath, await p.pdf({ format: 'Letter', printBackground: true }));
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
        json: async (input, options) => {
          await new Promise((done) => setTimeout(done, 2000));
          // Reading the plans: what it was asked is kept, and it answers like Claude reading a set of plans.
          if (typeof input === 'string' && /These are the plans for a house/.test(input)) {
            window.__plansAsked = { input, images: (options && options.images ? options.images.length : 0) };
            return {
              name: 'Preview Residence',
              address: '412 Bay Isles Road, Longboat Key, Florida 34228',
              levels: [
                { name: 'Level 1', rooms: [{ name: 'Garage', number: '101' }, { name: 'Living', number: '107' }, { name: 'Kitchen', number: '109' }, { name: 'Pantry', number: '110' }, { name: 'Mudroom', number: '120' }] },
                { name: 'Level 2', rooms: [{ name: 'Master Bedroom', number: '206' }, { name: 'Master Bathroom', number: '207' }, { name: 'Master Closet', number: null }] },
                { name: 'Level 3', rooms: [{ name: 'Bunk Room', number: '303' }] },
              ],
              outside: ['Pool', 'Driveway', 'Dock'],
              notes: 'The third floor sheet was hard to read: check its rooms.',
            };
          }
          // Every other question is kept too, with how many photos went and which model.
          window.__asked = window.__asked || [];
          window.__asked.push({ input, images: options && options.images ? options.images.length : 0, tier: options && options.modelTier });
          // Say It: three things said, one of them on the list already and one with no location.
          if (/said what is left to do/.test(input)) {
            return {
              items: [
                { title: 'Adjust cabinet door', description: 'left of the hood, it rubs.', location: 'Kitchen 109', assignedTo: 'SMS Carpentry', waitingOn: null },
                { title: 'Caulk window sill', description: 'By the sink.', location: 'Kitchen 109', assignedTo: 'Triple H Painting', waitingOn: null },
                { title: 'Install mirror', description: 'Over the vanity, once the owner picks one.', location: null, assignedTo: null, waitingOn: 'Owner' },
              ],
            };
          }
          // The same work as one on the list: the closest one, always.
          if (/Is it the same work as one already on the list/.test(input)) {
            const m = input.match(/^- #(\\d+) /m);
            return { same: m ? Number(m[1]) : null };
          }
          // Find Duplicates: the pairs about a cabinet door are the same work; the others are not.
          if (/pairs of items on the running list/.test(input)) {
            return { same: [...input.matchAll(/^Pair (\\d+): (.*)$/gm)].filter((m) => /cabinet door/i.test(m[2])).map((m) => Number(m[1])) };
          }
          // Read a List: the two things on the owner's list that are not done.
          if (/This is a punch list for a house being built/.test(input)) {
            return {
              items: [
                { title: 'Adjust pantry door', description: 'It sticks at the top.', location: 'Kitchen 109', assignedTo: 'SMS Carpentry', waitingOn: null },
                { title: 'Touch up paint', description: 'By the dryer.', location: 'Laundry 119', assignedTo: 'Triple H Painting', waitingOn: null },
              ],
            };
          }
          // A company from an email signature.
          if (/Read a company's details/.test(input)) {
            return { name: 'Island Paint Company', trade: 'Painting', phone: '941-555-0140', email: 'office@islandpaint.example', people: [{ name: 'Rosa Diaz', phone: '941-555-0141', email: 'rosa@islandpaint.example' }] };
          }
          // What a new item waits on: the first open item in the location.
          if (/Does it have to wait for any of the other open items/.test(input)) {
            const m = input.match(/^- #(\\d+) /m);
            return { waits: m ? [Number(m[1])] : [] };
          }
          // The done check: the hinge still looks loose.
          if (/Check the work from two photos/.test(input)) return { done: 'no', left: 'the left hinge still looks loose' };
          // Standard wording: a switch cover is the switch plate.
          if (/list of standard titles/.test(input)) {
            const typed = (input.match(/They typed: "(.*)"/) || [])[1] || '';
            return { title: /switch/i.test(typed) ? 'Install switch plate' : null };
          }
          // Fill In From Photo: one more thing when they mention the tub caulk.
          const others = /tub caulk/i.test(input) ? [{ title: 'Caulk tub surround', description: 'Corner at the valve wall.', trade: 'Tile', company: 'Rangel Custom Tile' }] : [];
          return { title: 'install towel bar', description: 'Left of the vanity, 24 inches.', trade: 'Carpentry', company: 'SMS Carpentry', others };
        },
      });
      // The page's host saves files for it, after asking the viewer: here it keeps what it was given.
      const downloads = { save: async ({ filename, data }) => { window.__saved = { filename, data: String(data) }; return { status: 'saved' }; } };
      window.claude = { use: async (name) => (name === 'sample' ? sample : name === 'downloads' ? downloads : null) };
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
  // E2E_ONLY=new walks only the steps for what is new, on fresh sample data: a quick check.
  const only = process.env.E2E_ONLY;
  const step = async (name: string, fn: () => Promise<void>) => {
    if (only === 'new' && !name.startsWith('New: ') && name !== 'jobs list opens') return;
    await fn();
    steps.push(name);
  };

  // Lets a slide or a sheet finish before a screenshot.
  const settle = (ms = 650) => tab.waitForTimeout(ms);
  /** The element with this test name that can be seen: late in the walk, screens behind keep theirs. */
  const seen = (testId: string) => app.getByTestId(testId).filter({ visible: true }).last();
  const menu = async (testId: string) => {
    await seen('more').click();
    await app.getByTestId(testId).waitFor();
    await settle(350);
    await app.getByTestId(testId).click();
    await settle(300);
  };
  /** Undo on the toast that says this: the one before may still be sliding away. */
  const undo = async (message: string | RegExp) => {
    await app.getByRole('status').filter({ hasText: message }).getByRole('button', { name: 'Undo' }).click();
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
      await app.getByText('Sample Job', { exact: true }).first().waitFor({ timeout: 20_000 });
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
    await step('the circle checks an item off, and it goes under Completed, crossed off', async () => {
      await app.getByTestId('check-item-3').click();
      await settle(200);
      await shot('04-checking');
      // A way back from a tap that was a mistake.
      await app.getByText('Completed Touch up paint').waitFor();
      // It goes under Completed at the end, closed, which opens and closes with a tap.
      await app.getByTestId('completed-toggle').waitFor({ timeout: 5_000 });
      await app.getByTestId('item-item-3').waitFor({ state: 'detached' });
      await app.getByTestId('completed-toggle').click();
      await app.getByTestId('item-item-3').waitFor();
      // Checked off and crossed off, with when and by whom.
      await app.getByTestId('done-item-3').getByText(/^[A-Z][a-z]+ \d+ · Jake Ross$/).waitFor();
      const crossed = await app.getByTestId('item-item-3').getByText('Touch up paint', { exact: true }).evaluate((el) => getComputedStyle(el).textDecorationLine);
      if (!crossed.includes('line-through')) throw new Error(`The completed item is not crossed off: ${crossed}`);
      await settle(300);
      await shot('05-completed');
      await app.getByTestId('completed-toggle').click();
      await app.getByTestId('item-item-3').waitFor({ state: 'detached' });
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
      await app.getByTestId('next-location').click();
      await app.getByText('Guest Bedroom 114').first().waitFor();
      await settle();
      await shot('07-next-room');
      await app.getByTestId('previous-location').click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
    });
    await step('an item edits in place: Ready is a checkbox, Not Ready picks the task to be done first', async () => {
      await app.getByTestId('item-item-1').click();
      await app.getByTestId('mark-complete').waitFor();
      // It waits on the range backsplash: the task, and the company doing it.
      await app.getByText('Waiting on Install range backsplash (Volcano Stone)', { exact: true }).last().waitFor();
      await settle();
      await shot('08-item');
      await app.getByTestId('ready-check').click();
      await app.getByText('It can be done now.').waitFor();
      await app.getByTestId('ready-check').click();
      await app.getByTestId('not-ready-box').waitFor();
      await settle(700);
      if ((await app.getByTestId('not-ready-done').last().getAttribute('aria-disabled')) !== 'true') throw new Error('Done should wait for a choice');
      // This location's tasks come first; the owner is for what is not a task on the list.
      await app.getByTestId('waiting-task-item-25').click();
      await app.getByTestId('waiting-Owner').click();
      // When it should be ready, if known: the company sees it on its list and its page.
      await app.getByTestId('not-ready-by').last().fill('2026-11-20');
      await app.getByText('November 20, 2026').last().waitFor();
      await settle(300);
      await shot('09-not-ready-box');
      await app.getByTestId('not-ready-done').last().click();
      await app.getByTestId('not-ready-box').waitFor({ state: 'detached' });
      await app.getByText('Waiting on Install range backsplash (Volcano Stone) and Owner', { exact: true }).last().waitFor();
      // The type, the order and how long it takes wait under Details.
      await app.getByTestId('item-details').click();
      await app.getByTestId('hours-2').last().click();
      await app.getByTestId('item-details').last().getByText(/2 hours/).waitFor();
      await app.getByTestId('field-description').fill('Range wall, both sides of the hood, after the stone is set.');
      await app.getByTestId('field-description').blur();
      await settle(300);
      await shot('09b-item-edited');
      // The type: Additional brings up its order, a purchase order, variance purchase order or change order; back to Incomplete.
      await app.getByRole('tab', { name: 'Additional' }).click();
      await app.getByTestId('field-po').waitFor();
      await app.getByText('Extra work, to be quoted. It goes ahead once it has its purchase order, variance purchase order or change order.').waitFor();
      await app.getByTestId('order-co').click();
      await app.getByTestId('order-vpo').waitFor();
      await settle(300);
      await shot('09d-additional');
      await app.getByRole('tab', { name: 'Incomplete' }).click();
      await app.getByTestId('field-po').waitFor({ state: 'detached' });
      // Leave and come back: the changes were saved as they were made, and the row says them.
      await app.getByTestId('back').last().click();
      await app.getByTestId('item-item-16').waitFor();
      if ((await app.getByTestId('time-item-1').count()) !== 0) throw new Error('The row still shows a time');
      // In a location the items go by company; the usual type, Incomplete, is not said on the row.
      if ((await app.getByTestId('item-item-1').getByText(/Additional/).count()) > 0) throw new Error('The row still says Additional');
      await settle();
      await shot('09e-row');
      await app.getByTestId('item-item-1').click();
      await app.getByText('Waiting on Install range backsplash (Volcano Stone) and Owner', { exact: true }).last().waitFor();
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
    await step('the shutter never asks for anything first: with no location picked, the photo saves to finish later', async () => {
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      // From Jobs, Capture opens on the last job with no location; on a job it carries on the walk.
      await app.getByTestId('back').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle();
      await app.locator('[data-testid="camera"]:visible').last().click();
      await app.getByTestId('shutter').waitFor();
      await app.getByText('Choose Location').waitFor();
      const chooser = tab.waitForEvent('filechooser');
      await app.getByTestId('shutter').click();
      await (await chooser).setFiles(photoPath);
      await app.getByText('Saved, with no location yet').waitFor();
      // No finish date: the schedule is not part of the app for now.
      if ((await app.getByText(/^Done by /).count()) !== 0) throw new Error('The camera still says a finish date');
      await settle(400);
      await shot('09f-no-location');
      await app.getByTestId('camera-close').click();
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await app.getByTestId('group-room-1').click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
    });
    await step('the camera opens on the location', async () => {
      await app.locator('[data-testid="camera"]:visible').last().click();
      await app.getByTestId('shutter').waitFor();
      await app.getByText('Kitchen 109').last().waitFor();
      await app.getByText('Each photo saves as an item. Claude fills it in.').waitFor();
      await settle(700);
      await shot('10-camera');
    });
    await step('each photo saves as an item in the location straight away', async () => {
      const chooser = tab.waitForEvent('filechooser');
      await app.getByTestId('shutter').click();
      await (await chooser).setFiles(photoPath);
      await app.getByText('Saved in Kitchen 109').waitFor();
      await app.getByText('1 saved on this walk. Tap the photo to finish it now.').waitFor();
      await app.getByTestId('camera-last').waitFor();
      await settle(400);
      await shot('11-camera-saved');
    });
    await step('tap the last photo to finish it now: Claude filled it in; mark it up with a circle, a measurement, numbered spots, a quick note and a note that points, then change the marks', async () => {
      await app.getByTestId('camera-last').click();
      await app.getByTestId('done-camera').waitFor();
      // The stand-in for Claude answers after a moment.
      await app.getByText('Check it over, then tap Done to put it on the lists.').waitFor({ timeout: 20000 });
      if ((await app.getByTestId('field-title').inputValue()) !== 'Install towel bar') throw new Error('The photo did not fill in its title');
      await app.getByTestId('pick-assigned').last().getByText('SMS Carpentry').waitFor();
      await settle(400);
      await shot('11b-finish-now');
      await app.getByTestId('mark-up').click();
      await app.getByTestId('markup-canvas').waitFor();
      await settle(500);
      await shot('11c-markup');
      await app.getByTestId('tool-circle').click();
      await drag([0.2, 0.12], [0.8, 0.45]);
      // Text is a tool of its own, and a tap anywhere with any tool starts typing there.
      await app.getByTestId('tool-text').getByText('Text', { exact: true }).waitFor();
      await drag([0.1, 0.92], [0.1, 0.92]);
      await app.getByTestId('markup-note').waitFor();
      await app.getByTestId('markup-note-cancel').click();
      await app.getByTestId('markup-note').waitFor({ state: 'detached' });
      await app.getByTestId('tool-pen').click();
      await drag([0.1, 0.7], [0.35, 0.8]);
      await app.getByTestId('markup-undo').click();
      // Redo puts the line back, and Undo takes it off again.
      await app.getByTestId('markup-redo').click();
      await app.getByTestId('markup-undo').click();
      // A measurement, under More: the size is written out on the photo as it is typed.
      await app.getByTestId('tool-more').click();
      await settle(200);
      await shot('11d-more-tools');
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
      // Numbered spots, under More: one tap each.
      await app.getByTestId('tool-more').click();
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
      // A note that points: a drag from where the words go to the spot.
      await drag([0.2, 0.95], [0.42, 0.68]);
      await app.getByTestId('markup-note').fill('chip in the paint');
      await app.getByTestId('markup-note-add').click();
      await app.getByTestId('markup').getByText('Chip in the paint', { exact: true }).first().waitFor();
      // Tap the circle's line to pick it: another color, then dragged by its line.
      await drag([0.5, 0.12], [0.5, 0.12]);
      await app.getByTestId('markup-picked').waitFor();
      await app.getByText('Drag it, or drag a corner.').waitFor();
      await app.getByTestId('color-yellow').click();
      await drag([0.5, 0.12], [0.5, 0.18]);
      await settle(300);
      await shot('12c-picked');
      // Delete takes it off, and Undo puts it back.
      await app.getByTestId('markup-delete').click();
      await app.getByTestId('markup-picked').waitFor({ state: 'detached' });
      await app.getByTestId('markup-undo').click();
      // A tap picks the note, and a second tap opens its words.
      await drag([0.62, 0.3], [0.62, 0.3]);
      await app.getByText('Drag to move it.').waitFor();
      await drag([0.62, 0.3], [0.62, 0.3]);
      await app.getByTestId('markup-note').fill('Gap at the corner');
      await app.getByTestId('markup-note-add').getByText('Save').waitFor();
      await app.getByTestId('markup-note-add').click();
      await app.getByTestId('markup').getByText('Gap at the corner', { exact: true }).first().waitFor();
      await settle(300);
      await shot('12d-marked-up');
      await app.getByTestId('markup-next').click();
      await app.getByTestId('markup-canvas').waitFor({ state: 'detached' });
      await settle(400);
      // Done puts it on the lists and goes back to the camera.
      await app.getByTestId('done-camera').click();
      await app.getByTestId('shutter').waitFor();
      await settle(500);
    });
    await step('Type an Item: the form fills in from the title, the rest under Details', async () => {
      await app.getByTestId('no-photo').click();
      await app.getByTestId('field-title').waitFor();
      await settle(800);
      await shot('13-new-item');
      await app.getByTestId('field-title').fill('adj');
      await app.getByTestId('title-suggestions').waitFor();
      await settle(300);
      await shot('14-title-suggestions');
      await app.getByTestId('suggestion-0').click();
      await app.getByText('Assigned To filled in from the title.').waitFor();
      await app.getByText('SMS Carpentry').last().waitFor();
      if ((await app.getByTestId('pick-trade').count()) !== 0) throw new Error('The form still asks for the trade');
      await app.getByTestId('item-details').getByText('Incomplete', { exact: true }).waitFor();
      await app.getByTestId('item-details').click();
      if ((await app.getByTestId(/^estimate-/).count()) !== 0) throw new Error('The title filled in a time');
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
    await step('a new item that is not ready waits on a task added right there, and on the owner', async () => {
      await app.getByTestId('no-photo').click();
      await app.getByTestId('field-title').waitFor();
      await settle(800);
      await app.getByTestId('field-title').fill('Set mirror');
      await app.getByTestId('field-description').click();
      await app.getByTestId('pick-assigned').click();
      // Recent goes first in Assigned To: the company in its own group is the last one.
      await app.getByRole('button', { name: 'Triple H Painting' }).last().click();
      await settle(400);
      await app.getByTestId('ready-check').click();
      await app.getByTestId('not-ready-box').waitFor();
      await settle(700);
      await shot('17-not-ready-box');
      // The wallpaper is not on the list yet: Add a Task puts it there and picks it.
      await app.getByTestId('waiting-add-task').click();
      await app.getByTestId('waiting-task-title').fill('Hang wallpaper');
      await app.getByTestId('waiting-task-assigned').click();
      await settle(600);
      await app.getByRole('button', { name: 'Triple H Painting' }).last().click();
      await settle(600);
      await app.getByTestId('waiting-task-save').click();
      await app.getByTestId('waiting-add-task').waitFor();
      await app.getByTestId('waiting-Owner').click();
      await settle(300);
      await shot('18-waiting-on');
      await app.getByTestId('not-ready-done').last().click();
      await app.getByTestId('not-ready-box').waitFor({ state: 'detached' });
      await app.getByText('Waiting on Hang wallpaper (Triple H Painting) and Owner').last().waitFor();
      await settle(300);
      await app.getByTestId('save').click();
      await app.getByTestId('item-item-16').waitFor();
      await app.getByText('Set mirror').first().waitFor();
      await app.getByText('Adjust cabinet door').nth(1).waitFor();
      await app.getByText('Install towel bar').first().waitFor();
      await settle(700);
      await shot('19-room-after-walk');
    });
    await step('the item from the walk keeps its photo and marks', async () => {
      await app.getByText('Install towel bar').first().click();
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
    await step('a walk saves each photo to check over later, and Claude fills each in', async () => {
      await app.getByTestId('group-room-4').click();
      await settle();
      await app.locator('[data-testid="camera"]:visible').last().click();
      await app.getByTestId('shutter').waitFor();
      await settle(400);
      for (let i = 0; i < 2; i += 1) {
        const chooser = tab.waitForEvent('filechooser');
        await app.getByTestId('shutter').click();
        await (await chooser).setFiles(photoPath);
        await app.getByText(`${i + 1} saved on this walk. Tap the photo to finish it now.`).waitFor();
        await settle(500);
      }
      await shot('21-quick-snap');
      // Common Tasks: the usual work for a bathroom, a tap each, with what is on the list here already marked.
      await app.getByTestId('camera-common').click();
      await app.getByTestId('common-tasks').waitFor();
      if ((await app.getByTestId('common-kind-bathroom').getAttribute('aria-checked')) === 'false') throw new Error('The bathroom was not seen as a bathroom');
      await app.getByTestId('common-task-Trim out toilet').click();
      await app.getByTestId('common-task-Install shower trim').click();
      await settle(500);
      await shot('21b-common-tasks');
      await app.getByTestId('common-add').click();
      await app.getByText('Added 2 items to Bathroom 116').waitFor();
      // Done here: the location is walked, and the camera goes on to the next one.
      await app.getByTestId('camera-next').click();
      await app.getByText(/^Bathroom 116 walked\. Now in [A-Z]/).waitFor();
      await app.getByTestId('camera-walked').getByText(/^1 of \d+ walked\.$/).waitFor();
      await settle(400);
      await shot('21c-next-location');
      await app.getByTestId('camera-close').click();
      await settle(700);
      await app.getByTestId('back').last().click();
      await app.getByTestId('open-unfinished').waitFor();
      await settle();
      await shot('22-job-unfinished');
    });
    await step('check them sitting down: one is on the list already, so its photo goes there; Mark Up, then Next puts one on the lists', async () => {
      await app.getByTestId('open-unfinished').click();
      await app.getByText('Claude is filling them in.').waitFor();
      await app.getByText('Filling in from the photo', { exact: true }).first().waitFor();
      await settle(300);
      await shot('23-drafts-filling');
      await app.getByText('Claude is filling them in.').waitFor({ state: 'detached', timeout: 20000 });
      if ((await app.getByTestId(/^item-item-|^item-[0-9a-f-]{36}$/).count()) < 4) throw new Error('Drafts does not list the four drafts');
      if ((await app.getByText('No title yet').count()) !== 0) throw new Error('A draft did not fill in');
      await settle();
      await shot('23b-drafts-filled');
      // The one snapped in the kitchen earlier is the towel bar already on the list there.
      await app.getByText('Install towel bar').first().click();
      await app.getByTestId('duplicate-note').getByText(/^Already on the list in Kitchen 109: item \d+\./).waitFor();
      await settle(400);
      await shot('24-draft-twin');
      await app.getByTestId('twin-add').click();
      await app.getByText('Added the photo to Install towel bar').waitFor();
      // On to the next draft: the photo saved with no location, which is picked now.
      await app.getByText('Add a location to put it on the lists.').waitFor();
      await settle(700);
      await shot('24a-draft-no-location');
      await app.getByTestId('pick-room').last().click();
      await settle(500);
      await app.getByRole('button', { name: 'Laundry 119', exact: true }).last().click();
      // With its location it has everything, so it is on the lists now, and Next steps on.
      await app.getByTestId('item-status').waitFor({ state: 'detached' });
      await settle(700);
      if ((await app.getByTestId('field-title').last().inputValue()) !== 'Install towel bar') throw new Error('The draft did not fill in its title');
      await app.getByTestId('pick-assigned').last().getByText('SMS Carpentry').waitFor();
      if ((await app.getByTestId('fill-in').count()) !== 0) throw new Error('Fill In shows with nothing left to fill');
      await settle(400);
      await shot('24b-draft-filled-in');
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
      await app.getByRole('heading', { name: 'Drafts', exact: true }).last().waitFor();
      await app.getByTestId('back').last().click();
      // Gone once it has slid away, so only the job's own rows count below.
      await app.getByTestId(/^item-/).first().waitFor({ state: 'detached' });
      await app.getByTestId('group-room-1').waitFor();
      // The one checked over is on the lists now, with the one from the walk; the last draft is not.
      await app.getByTestId('search').last().fill('towel');
      await app.getByText('Install towel bar').first().waitFor();
      if ((await app.getByText('Install towel bar').count()) !== 2) throw new Error('Next did not put the draft on the lists');
      await app.getByTestId('search-clear').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('start with the words: New Item in a location, and Save and Next types the next one', async () => {
      await app.getByTestId('group-room-5').click();
      await app.getByTestId('new-item-row').waitFor();
      await settle();
      await shot('27a-location-new-item');
      await app.getByTestId('new-item-row').click();
      await app.getByTestId('field-title').waitFor();
      await settle(700);
      await app.getByTestId('field-title').fill('patch dry');
      await app.getByTestId('title-suggestions').waitFor();
      await app.getByTestId('suggestion-0').click();
      await app.getByText('Triple H Painting').last().waitFor();
      await app.getByTestId('save-next').click();
      await app.getByTestId('saved-note').getByText('Saved Patch drywall in Laundry 119').waitFor();
      if ((await app.getByTestId('field-title').inputValue()) !== '') throw new Error('Save and Next did not start a new item');
      await settle(400);
      await shot('27b-typed-save-next');
      await app.getByTestId('field-title').fill('touch up p');
      await app.getByTestId('title-suggestions').waitFor();
      await app.getByTestId('suggestion-0').click();
      await app.getByText('Triple H Painting').last().waitFor();
      await app.getByTestId('save').click();
      await app.getByText('Saved Touch up paint in Laundry 119').waitFor();
      await app.getByTestId(/^item-/).filter({ hasText: 'Patch drywall' }).waitFor();
      await settle(500);
      await shot('27c-typed-items');
    });
    await step('add the photo later: the empty photo slot takes it straight onto the item', async () => {
      const row = app.getByTestId(/^item-/).filter({ hasText: 'Patch drywall' });
      await row.getByTestId(/^add-photo-/).click();
      await takePhoto();
      await app.getByTestId('tool-circle').click();
      await drag([0.3, 0.3], [0.65, 0.55]);
      await app.getByTestId('markup-next').getByText('Add', { exact: true }).waitFor();
      await app.getByTestId('markup-next').click();
      await app.getByTestId('markup-canvas').waitFor({ state: 'detached' });
      await row.getByTestId(/^add-photo-/).waitFor({ state: 'detached' });
      await settle(500);
      await shot('27d-photo-added-later');
    });
    await step('photo first for an item typed earlier: the photo goes on that item, from the last photo', async () => {
      await app.locator('[data-testid="camera"]:visible').last().click();
      const chooser = tab.waitForEvent('filechooser');
      await app.getByTestId('shutter').click();
      await (await chooser).setFiles(photoPath);
      await app.getByText('Saved in Laundry 119').waitFor();
      await app.getByTestId('camera-last').click();
      await app.getByTestId('add-to-item').waitFor();
      await settle(700);
      await shot('27e-add-to-item');
      await app.getByTestId('add-to-item').click();
      await app.getByRole('button', { name: 'Touch up paint', exact: true }).click();
      await app.getByText('Added the photo to Touch up paint').waitFor();
      await app.getByTestId('shutter').waitFor();
      if ((await app.getByTestId('camera-last').count()) !== 0) throw new Error('The camera still offers the draft that went on another item');
      await settle(300);
      await shot('27f-added-to-item');
      await app.getByTestId('camera-close').click();
      await settle(700);
      await app.getByTestId(/^item-/).filter({ hasText: 'Touch up paint' }).getByTestId(/^add-photo-/).waitFor({ state: 'detached' });
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      // The plus on the job types one in too, in the last location used.
      await app.getByTestId('new-item').click();
      await app.getByTestId('field-title').waitFor();
      await app.getByText('Laundry 119').last().waitFor();
      await settle(600);
      await app.getByTestId('cancel').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Activity shows who added or changed what, and each item its History', async () => {
      await menu('activity');
      await app.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
      // The newest first: the sample job has a Patch drywall of its own from days ago.
      await app.getByText('Jake Ross added Patch drywall', { exact: true }).first().waitFor();
      await settle(500);
      await shot('28a-activity');
      await app.getByText('Jake Ross added Patch drywall', { exact: true }).first().click();
      await app.getByTestId('item-history-row').getByText(/^Jake Ross added it, /).waitFor();
      await app.getByTestId('item-history-row').click();
      await app.getByTestId('item-history').getByText('Jake Ross added it', { exact: true }).waitFor();
      await app.getByTestId('item-history').scrollIntoViewIfNeeded();
      await settle(400);
      await shot('28b-item-history');
      await app.getByTestId('back').last().click();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      // The towel bar from the walk has both photos: its own, and the one from the draft Sam snapped of it.
      await app.getByTestId('group-room-1').click();
      await app.getByText('Install towel bar').first().click();
      await app.getByTestId('item-history-row').click();
      const history = app.getByTestId('item-history');
      await history.getByText('Jake Ross added it', { exact: true }).waitFor();
      await history.getByText(/With 2 photos|added a photo to it/).first().waitFor();
      await history.scrollIntoViewIfNeeded();
      await settle(400);
      await shot('28c-draft-history');
      await app.getByTestId('back').last().click();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('finishing a task makes what waited on it ready, with Undo for both', async () => {
      await app.getByTestId('group-room-7').click();
      const waits = /^On Install pocket door hardware \(SMS Carpentry\)/;
      await app.getByText(waits).waitFor();
      await app.getByTestId('check-item-26').click();
      await app.getByText('Completed Install pocket door hardware. Paint pocket doors is ready now.').waitFor();
      if ((await app.getByText(waits).count()) !== 0) throw new Error('Paint pocket doors still waits');
      await settle(300);
      await shot('27-release');
      await app.getByRole('button', { name: 'Undo' }).click();
      await app.getByText(waits).waitFor();
      await app.getByTestId('item-item-26').waitFor();
      await settle(500);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('View and Filter: by Assigned To, saved as the default', async () => {
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(600);
      await shot('29-view');
      if ((await app.getByRole('tab', { name: 'Trade' }).count()) !== 0) throw new Error('The lists still group by trade');
      await app.getByTestId('view-group-company').click();
      await app.getByTestId('filter-state-not_ready').click();
      await settle(300);
      await app.getByTestId('save-default').click();
      await app.getByText('Saved as My Default').waitFor();
      await app.getByTestId('view-done').click();
      await app.getByText('SMS Carpentry', { exact: true }).first().waitFor();
      await app.getByTestId('chip-states:not_ready').waitFor();
      await settle(600);
      await shot('29b-by-company-not-ready');
      await app.getByTestId('filter').click();
      await app.getByTestId('view-standard').click();
      await app.getByTestId('save-default').click();
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('filters take several values, show as chips, and come off with a tap', async () => {
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(600);
      await app.getByTestId('filter-state-ready').click();
      await app.getByTestId('filter-company-company-4').click();
      await app.getByTestId('filter-company-company-2').click();
      await app.getByText(/^3 filters, \d+ open items$/).waitFor();
      await settle(300);
      await shot('29c-filters');
      await app.getByTestId('view-done').click();
      await app.getByTestId('chip-companyIds:company-4').waitFor();
      // The job's own count of what is open.
      await app.getByTestId('count-open').filter({ visible: true }).first().waitFor();
      await settle(600);
      await shot('29d-filtered');
      await app.getByTestId('chip-companyIds:company-2').click();
      await app.getByTestId('chip-companyIds:company-2').waitFor({ state: 'detached' });
      // Inside a location the chips still say the list is filtered: the one company's ready work, and nothing that waits.
      await app.getByTestId('group-room-1').click();
      await app.getByTestId('chip-states:ready').last().waitFor();
      if ((await app.getByTestId('item-item-2').count()) !== 0) throw new Error('A filtered location shows another company');
      if ((await app.getByTestId(/^item-item-/).filter({ has: app.getByText('Waiting', { exact: true }) }).count()) !== 0) throw new Error('A filtered location shows work that is not ready');
      await settle(500);
      await shot('29e-filtered-location');
      await app.getByTestId('back').last().click();
      await app.getByTestId('filter-clear').last().click();
      await app.getByTestId('filter-bar').waitFor({ state: 'detached' });
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('search finds an item', async () => {
      await app.getByTestId('search').last().fill('toilet');
      await app.getByText('Install toilet').first().waitFor();
      await settle(300);
      await shot('30-search');
      await app.getByTestId('search-clear').last().click();
      await app.getByTestId('group-room-1').waitFor();
    });
    await step('group by what items wait on, and clear a holdup for all its items at once', async () => {
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(600);
      await app.getByTestId('view-group-waiting').click();
      await settle(300);
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-ready').waitFor();
      await app.getByTestId('group-waiting:owner').waitFor();
      await settle(600);
      await shot('31-by-waiting');
      await app.getByTestId('group-waiting:owner').click();
      await app.getByText('Waiting on Owner').first().waitFor();
      if ((await app.getByTestId('holdup-ready-by').count()) !== 0) throw new Error('The holdup still asks for a date');
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
    await step('comments: a back and forth on an item, and an internal note', async () => {
      await app.getByTestId('group-room-1').click();
      // The row says how many comments the item has.
      await app.getByTestId(/^item-item-/).filter({ hasText: 'Adjust cabinet door' }).getByText(/^Deficiency( · .*)?$/).waitFor();
      await app.getByTestId(/^item-item-/).filter({ hasText: 'Adjust cabinet door' }).getByText('3', { exact: true }).waitFor();
      await app.getByText('Adjust cabinet door').first().click();
      // Comments fold into one row with the latest in it.
      await app.getByTestId('item-comments-row').getByText('3', { exact: true }).waitFor();
      await app.getByTestId('item-comments-row').click();
      const thread = app.getByTestId('item-comments');
      await thread.getByText('Will do. We are bringing new hinges for both.').waitFor();
      await thread.getByText('Mike at SMS Carpentry', { exact: true }).waitFor();
      await thread.getByTestId(/^comment-/).getByText('Internal', { exact: true }).first().waitFor();
      await thread.scrollIntoViewIfNeeded();
      await app.getByTestId('item-comments-input').fill('Bring the hinge jig too.');
      await app.getByTestId('item-comments-post').click();
      await thread.getByText('Bring the hinge jig too.').waitFor();
      await app.getByTestId('item-comments-internal').click();
      await app.getByTestId('item-comments-input').fill('Their last invoice is still open.');
      await app.getByTestId('item-comments-post').click();
      await thread.getByText('Their last invoice is still open.').waitFor();
      if ((await thread.getByTestId(/^comment-/).getByText('Internal', { exact: true }).count()) !== 2) throw new Error('The note is not marked Internal');
      await thread.scrollIntoViewIfNeeded();
      await settle(500);
      await shot('38a-item-comments');
      await app.getByTestId('back').last().click();
      await app.getByTestId(/^item-item-/).filter({ hasText: 'Adjust cabinet door' }).getByText('5', { exact: true }).waitFor();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Send Lists: a company list and the whole job, ready to send', async () => {
      await app.getByTestId('tab-send').last().click();
      await app.getByTestId('send-job').waitFor();
      if ((await app.getByTestId('send-schedule').count()) + (await app.getByTestId('send-lookahead').count()) !== 0) throw new Error('Send Lists still has the schedule');
      await settle(700);
      await shot('38-send-lists');
      await app.getByTestId('send-company-4').click();
      const doc = app.getByTestId('doc-preview');
      // The company using the app, on top of every list.
      await doc.getByText('ROSS BUILT', { exact: true }).first().waitFor();
      await doc.getByText('Waiting', { exact: true }).first().waitFor();
      await doc.getByText('New', { exact: true }).first().waitFor();
      for (const gone of ['Scheduled Visits', 'How many days']) {
        if ((await doc.getByText(gone, { exact: false }).count()) !== 0) throw new Error(`The list still says ${gone}`);
      }
      // The company's page: its link, and the code to scan for it, at the top of its list.
      await doc.getByText('Your Page', { exact: true }).waitFor();
      await doc.getByText('punch-list.expo.app/c#sample', { exact: false }).first().waitFor();
      if ((await doc.locator('.rb-qr svg').count()) !== 1) throw new Error('The scan code is not on the list');
      // The comments print: on the whole list under the heading, and under each item. Internal notes never do.
      await doc.getByText('Comments', { exact: true }).first().waitFor();
      await doc.getByText('We can do all the trim work Monday and Tuesday next week if that works.', { exact: false }).waitFor();
      await doc.getByText('Will do. We are bringing new hinges for both.', { exact: false }).waitFor();
      for (const note of ['pantry doors', 'last invoice']) {
        if ((await doc.getByText(note, { exact: false }).count()) !== 0) throw new Error(`An internal note printed: ${note}`);
      }
      // The list goes to the company's people.
      await app.getByTestId('message-email').waitFor();
      await app.getByTestId('message-to').getByText('mike@smscarpentry.example').waitFor();
      await app.getByTestId('message-subject').getByText('Completion List', { exact: false }).waitFor();
      await app.getByTestId('message-body').getByText(/^Hi Mike,/).waitFor();
      await app.getByTestId('message-body').getByText(/punch-list\.expo\.app\/c#sample/).waitFor();
      await settle(800);
      await shot('39-company-list');
      await app.getByTestId('mark-sent').click();
      await app.getByText('Marked as sent to SMS Carpentry').waitFor();
      await app.getByText(/Sent [A-Z][a-z]+\s\d+/).first().waitFor();
      await settle(400);
      await app.getByTestId('send-party-owner').click();
      await doc.getByText('Decisions Needed', { exact: true }).first().waitFor();
      if ((await doc.getByText('Needed By', { exact: true }).count()) !== 0) throw new Error('The owner list still asks by when');
      await settle(800);
      await shot('40-owner-list');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await settle(300);
      await app.getByTestId('send-job').click();
      await doc.getByText('Whole Job', { exact: true }).waitFor();
      await doc.getByText('Set mirror').waitFor();
      // Additional work says its order in full, or that it is to be quoted.
      await doc.getByText(/Additional, Change Order 14/).first().waitFor();
      await doc.getByText(/Additional, to be quoted/).first().waitFor();
      await settle(800);
      await shot('41-whole-job-list');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('Make a List: any filters, grouped and laid out as picked', async () => {
      await app.getByTestId('tab-send').last().click();
      await app.getByTestId('make-list').click();
      const sheet = app.getByTestId('export-sheet');
      await sheet.waitFor();
      await settle(700);
      await shot('41b-make-a-list');
      // SMS Carpentry's ready work on Level 1, by location.
      await app.getByTestId('export-filters-toggle').click();
      await app.getByTestId('export-filter-state-ready').click();
      await app.getByTestId('export-filter-company-company-4').click();
      await app.getByTestId('export-filter-floor-Level 1').click();
      if ((await app.getByTestId('export-days').count()) !== 0) throw new Error('Make a List still offers a line for the days');
      await app.getByTestId('export-summary').getByText(/^\d+ items?$/).waitFor();
      // Folded again, the filters that are on still show, each one off with a tap.
      await app.getByTestId('export-filters-toggle').click();
      await app.getByTestId('export-chip-floors:Level 1').waitFor();
      await settle(300);
      await shot('41c-make-a-list-filtered');
      await app.getByTestId('export-preview').click();
      const doc = app.getByTestId('doc-preview');
      await doc.getByText('SMS Carpentry', { exact: true }).first().waitFor();
      await doc.getByText('Filters: Ready, SMS Carpentry, Level 1.', { exact: true }).waitFor();
      if ((await doc.getByText('Master Bedroom 206', { exact: false }).count()) !== 0) throw new Error('Level 2 is on a Level 1 list');
      await settle(800);
      await shot('41d-made-list');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      // Everything, by what it waits on, with its own title.
      await app.getByTestId('export-clear').click();
      await sheet.getByRole('tab', { name: 'Waiting' }).click();
      await app.getByTestId('export-title').fill('Open Work by Holdup');
      await app.getByTestId('export-preview').click();
      await doc.getByText('Open Work by Holdup', { exact: true }).first().waitFor();
      await doc.getByText(/^Waiting on Owner · \d+ items?/).first().waitFor();
      await doc.getByText(/^To Be Quoted · \d+ items?/).first().waitFor();
      await settle(800);
      await shot('41e-made-list-by-waiting');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await app.getByTestId('export-cancel').click();
      await sheet.waitFor({ state: 'detached' });
      await app.getByTestId('tab-jobs').last().click();
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
      await app.getByTestId(/^custom-field-/).filter({ hasText: 'Walk' }).waitFor();
      // The order the trades come in on every list.
      await app.getByTestId('trade-order').click();
      await app.getByTestId('trade-order-sheet').waitFor();
      await app.getByTestId('trade-order-list').getByText('Electrical', { exact: true }).waitFor();
      await settle(600);
      await shot('43b-trade-order');
      await app.getByTestId('trade-order-done').click();
      await app.getByTestId('trade-order-sheet').waitFor({ state: 'detached' });
      await settle(400);
      await app.getByTestId('standard-titles').click();
      await app.getByTestId('title-new').fill('Adjust cabinet hinge');
      await app.getByTestId('title-trade').click();
      await app.getByRole('button', { name: 'Carpentry', exact: true }).click();
      await settle(400);
      if ((await app.getByTestId('title-hours').count()) !== 0) throw new Error('Standard titles still ask for a usual time');
      await app.getByTestId('title-add').click();
      await app.getByText('Adjust cabinet hinge', { exact: true }).waitFor();
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
      // The new level comes before the outside areas, so the job behind has it drawn too: the one in Job Setup.
      await app.getByTestId(/^setup-location-/).filter({ hasText: 'Roof Deck 301' }).waitFor();
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
    await step('People: add someone on the team who sees only their jobs, and put them on a job', async () => {
      await app.getByTestId('account').last().click();
      await app.getByTestId('people').waitFor();
      await settle(350);
      await app.getByTestId('people').click();
      await app.getByTestId('person-person-sam').waitFor();
      await settle(600);
      await shot('53-people');
      await app.getByTestId('add-person').click();
      await app.getByTestId('field-person-name').waitFor();
      await settle(600);
      await app.getByTestId('person-add').click();
      await app.getByText('Give them a name.').waitFor();
      await app.getByTestId('field-person-name').fill('Riley Carter');
      await app.getByTestId('field-person-email').fill('Riley@RossBuilt.com ');
      await settle(300);
      await shot('54-add-person');
      await app.getByTestId('person-add').click();
      await app.getByText('Added Riley Carter. They sign in with riley@rossbuilt.com.').waitFor();
      // Straight to them, on no job yet.
      await app.getByText('Not on any job yet.').waitFor();
      await app.getByTestId('person-add-job').click();
      await settle(600);
      await app.getByRole('button', { name: /^Sample Job North/ }).click();
      await app.getByRole('button', { name: 'Add as Superintendent' }).click();
      await app.getByTestId('person-job-job-preview').filter({ hasText: 'Superintendent' }).waitFor();
      await settle(500);
      await shot('55-person');
      // There is always an admin: Jake cannot make himself Team while he is the only one.
      await app.getByTestId('back').last().click();
      await app.getByTestId('person-person-jake').click();
      await app.getByTestId('role-team').waitFor();
      await settle(500);
      await app.getByTestId('role-team').click();
      await app.getByText('Your company needs at least one admin. Make someone else an admin first.').waitFor();
      await settle(300);
      await app.getByTestId('back').last().click();
      await settle(400);
      await app.getByTestId('back').last().click();
      // Me is a tab: Jobs goes back to the list of jobs.
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(500);
    });
    await step('assign an item to someone on your team: Assigned To takes a company or a person, it goes on their My Items, and the person goes on the team', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await app.getByTestId('group-room-1').click();
      await settle(700);
      await app.getByTestId(/^item-/).filter({ hasText: 'Install pendant lights' }).first().click();
      await app.getByTestId('pick-assigned').filter({ hasText: 'Metro Electric' }).waitFor();
      await settle(700);
      await app.getByTestId('pick-assigned').click();
      await settle(500);
      await shot('56-assign');
      await app.getByRole('button', { name: 'Taylor Brooks', exact: true }).last().click();
      await app.getByTestId('pick-assigned').filter({ hasText: 'Taylor Brooks' }).waitFor();
      await settle(300);
      await app.getByTestId('pick-assigned').click();
      await settle(500);
      await app.getByRole('button', { name: 'Jake Ross', exact: true }).last().click();
      await app.getByTestId('pick-assigned').filter({ hasText: 'Jake Ross' }).waitFor();
      await settle(400);
      await app.getByTestId('back').last().click();
      await settle(500);
      await app.getByTestId('back').last().click();
      await settle(500);
      await app.getByTestId('back').last().click();
      await app.getByTestId('my-items').filter({ hasText: '3 open' }).waitFor();
      await settle(400);
      await shot('57-jobs-my-items');
      await app.getByTestId('my-items').click();
      await app.getByText('Install pendant lights').waitFor();
      await app.getByText('Hang house numbers').waitFor();
      await settle(700);
      await shot('58-my-items');
      await app.getByTestId('back').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(500);
    });
    await step('the team in Job Setup, and closing a job with Undo', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await menu('job-setup');
      await app.getByText('Team', { exact: true }).click();
      await app.getByTestId('team-person-riley').waitFor({ state: 'detached' }).catch(() => undefined);
      await app.getByTestId(/^team-/).filter({ hasText: 'Riley Carter' }).waitFor();
      await settle(500);
      await shot('59-setup-team');
      await app.getByTestId(/^team-/).filter({ hasText: 'Taylor Brooks' }).click();
      await app.getByRole('button', { name: 'Make Superintendent' }).click();
      await app.getByTestId(/^team-/).filter({ hasText: 'Taylor BrooksSuperintendent' }).waitFor();
      await app.getByTestId('close-job').click();
      await app.getByRole('dialog').getByRole('button', { name: 'Close the Job' }).click();
      await app.getByText('Closed Sample Job').first().waitFor();
      await app.getByTestId('show-closed').waitFor();
      await settle(400);
      await shot('60-job-closed');
      await app.getByRole('button', { name: 'Undo' }).click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(400);
    });
    await step('the preview as Sam: only the jobs he is on, and no setup', async () => {
      await app.getByTestId('account').last().click();
      await app.getByTestId('preview-as-person-sam').waitFor();
      await settle(350);
      await app.getByTestId('preview-as-person-sam').click();
      await app.getByText('Team · Ross Built', { exact: true }).waitFor();
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('job-job-bay').waitFor({ state: 'detached' });
      await app.getByTestId('new-job').waitFor({ state: 'detached' });
      await settle(500);
      await shot('61-as-sam');
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await menu('job-setup');
      await app.getByText('Only an admin can change this.').waitFor();
      await app.getByTestId('paste-rooms').waitFor({ state: 'detached' });
      await settle(400);
      await shot('62-as-sam-setup');
      await app.getByTestId('back').last().click();
      await settle(400);
      await app.getByTestId('back').last().click();
      await app.getByTestId('account').last().click();
      await app.getByTestId('preview-as-person-jake').waitFor();
      await settle(350);
      await app.getByTestId('preview-as-person-jake').click();
      await app.getByText('Admin · Ross Built', { exact: true }).waitFor();
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('new-job').waitFor();
      await settle(400);
    });
    // A row's drag handle held and moved to the top of another row, with the mouse as the finger.
    const dragRow = async (handle: ReturnType<typeof app.getByTestId>, onto: ReturnType<typeof app.getByTestId>) => {
      // A finger can only drag what is on the screen.
      await handle.scrollIntoViewIfNeeded();
      await settle(200);
      const a = await handle.boundingBox();
      const b = await onto.boundingBox();
      if (!a || !b) throw new Error('Nothing to drag');
      await tab.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await tab.mouse.down();
      await tab.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 12, { steps: 4 });
      await tab.mouse.move(a.x + a.width / 2, b.y + 4, { steps: 14 });
      await settle(300);
      await tab.mouse.up();
      await settle(600);
    };
    const itemRow = (title: string) => app.getByTestId(/^item-/).filter({ hasText: title }).first();
    await step('Select in a location: drag an item into order, then move two with Undo', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await app.getByTestId('group-room-1').click();
      await app.getByTestId('select').waitFor();
      await settle(600);
      await app.getByTestId('select').click();
      await app.getByTestId('selection-bar').waitFor();
      await settle(400);
      // Each trade stays together: the cabinet hardware dragged to the top of the list goes to the
      // top of the carpentry, under the electrical.
      const first = app.getByTestId('drag-list').getByTestId(/^item-/).first();
      await dragRow(itemRow('Install cabinet hardware').getByTestId(/^drag-/), first);
      const at = async (title: string) => (await app.getByTestId('drag-list').getByTestId(/^item-item-/).allTextContents()).findIndex((t) => t.includes(title));
      let kept = false;
      for (let i = 0; i < 20 && !kept; i += 1) {
        kept = (await at('Install pendant lights')) < (await at('Install cabinet hardware')) && (await at('Install cabinet hardware')) < (await at('Adjust cabinet door'));
        if (!kept) await settle(150);
      }
      if (!kept) throw new Error(`The hardware did not stay with the carpentry: ${(await app.getByTestId('drag-list').getByTestId(/^item-item-/).allTextContents()).join(' | ')}`);
      await settle(300);
      await shot('63-dragged');
      await itemRow('Install range backsplash').click();
      await itemRow('Adjust cabinet door').click();
      await app.getByText('2 Selected').waitFor();
      await settle(300);
      await shot('64-picked');
      await app.getByTestId('picked-move').click();
      await settle(600);
      // Every drop down searches: a few letters and the search key pick it.
      await app.getByTestId('picker-search').last().fill('laun');
      await app.getByRole('button', { name: 'Laundry 119', exact: true }).waitFor();
      await settle(300);
      await shot('64b-picker-search');
      await app.getByTestId('picker-search').last().press('Enter');
      await app.getByText('Moved 2 items to Laundry 119').waitFor();
      await itemRow('Install range backsplash').waitFor({ state: 'detached' });
      await settle(300);
      await app.getByRole('button', { name: 'Undo' }).click();
      await itemRow('Install range backsplash').waitFor();
      await settle(500);
    });
    await step('copy two items and paste them in another location; Paste again leaves out what is there', async () => {
      await app.getByTestId('select').click();
      await app.getByTestId('selection-bar').waitFor();
      await settle(400);
      await itemRow('Install range backsplash').click();
      await itemRow('Install cabinet hardware').click();
      await app.getByTestId('picked-copy').click();
      await app.getByText('Copied 2 items. Open any location, on any job, and tap Paste.').waitFor();
      await settle(300);
      await app.getByTestId('next-location').last().click();
      // The location before slides away under it: the one on top is the last.
      await app.getByTestId('paste-banner').last().waitFor();
      await settle(700);
      await shot('65-paste-banner');
      await app.getByTestId('paste-here').last().click();
      await app.getByText('Pasted 2 items').waitFor();
      await itemRow('Install range backsplash').waitFor();
      await settle(400);
      await shot('66-pasted');
      await app.getByTestId('paste-here').last().click();
      await app.getByText('They are all on the list here already.').waitFor();
      await app.getByTestId('paste-clear').last().click();
      await app.getByTestId('paste-banner').first().waitFor({ state: 'detached' });
      await settle(400);
    });
    await step('assign and complete everything picked, with Undo', async () => {
      await app.getByTestId('select').click();
      await app.getByTestId('pick-all').click();
      await settle(300);
      await app.getByTestId('picked-assign').click();
      await settle(600);
      // Assigned To takes a company or someone on the team, for all of them at once; Undo puts each back.
      await app.getByText('Your Team', { exact: true }).first().waitFor();
      await app.getByRole('button', { name: 'Sam Rivera', exact: true }).last().click();
      await app.getByText(/^Assigned \d items to Sam Rivera$/).waitFor();
      await settle(300);
      await undo(/Assigned \d items to Sam Rivera/);
      await settle(400);
      await app.getByTestId('select').click();
      await app.getByTestId('pick-all').click();
      await app.getByTestId('picked-complete').click();
      await app.getByText(/^Completed \d items$/).waitFor();
      await app.getByTestId('completed-toggle').last().click();
      await app.getByTestId('completed-count').last().waitFor();
      await settle(300);
      await shot('67-completed');
      await app.getByRole('button', { name: 'Undo' }).click();
      await app.getByTestId('completed-toggle').last().waitFor({ state: 'detached' });
      await settle(400);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(500);
    });
    await step('add a template to the job: each task where it fits, and one line in Activity', async () => {
      await menu('add-template');
      await app.getByTestId('add-template-sheet').waitFor();
      await settle(800);
      await shot('68-add-template');
      const adds = (await app.getByTestId('template-add').innerText()).replace(/\D/g, '');
      await app.getByTestId('template-add').click();
      await app.getByText(`Added ${adds} items from End of the House`).waitFor();
      await settle(500);
      await menu('activity');
      await app.getByText(`added ${adds} items from a template`).waitFor();
      await settle(500);
      await shot('69-activity-template');
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(500);
    });
    await step('save picked items as a template, and add a task to it in Templates', async () => {
      await app.getByTestId('group-room-4').click();
      await app.getByTestId('select').waitFor();
      await settle(600);
      await app.getByTestId('select').click();
      await app.getByTestId('pick-all').click();
      await app.getByTestId('picked-template').click();
      await app.getByTestId('field-template-name').waitFor();
      await settle(700);
      await app.getByTestId('field-template-name').fill('Bathroom Finish');
      await settle(300);
      await shot('70-save-template');
      await app.getByTestId('save-template').click();
      await app.getByText(/^Saved Bathroom Finish with \d+ tasks$/).waitFor();
      await settle(400);
      await app.getByTestId('back').last().click();
      await settle(500);
      await app.getByTestId('back').last().click();
      await app.getByTestId('account').last().click();
      await app.getByTestId('templates').waitFor();
      await settle(350);
      await app.getByTestId('templates').click();
      await app.getByRole('button', { name: 'Bathroom Finish', exact: true }).click();
      await app.getByTestId('add-task').waitFor();
      await settle(700);
      await app.getByTestId('add-task').click();
      await app.getByTestId('field-task-title').fill('Install grab bar');
      await app.getByTestId('task-trade').click();
      await settle(500);
      await app.getByRole('button', { name: 'Carpentry', exact: true }).click();
      await settle(400);
      await app.getByTestId('task-save').click();
      await app.getByText('Install grab bar').waitFor();
      await settle(500);
      await shot('71-template');
      await app.getByTestId('back').last().click();
      await settle(400);
      await app.getByTestId('back').last().click();
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(400);
    });
    await step('Job Setup: drag a location to change the walk order', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await menu('job-setup');
      await app.getByTestId('reorder-rooms').click();
      await settle(500);
      const level = app.getByTestId('reorder-Level 1');
      await dragRow(level.getByTestId(/^setup-location-/).filter({ hasText: 'Laundry 119' }).getByTestId(/^drag-/), level.getByTestId(/^setup-location-/).first());
      await level.getByTestId(/^setup-location-/).first().filter({ hasText: 'Laundry 119' }).waitFor();
      await settle(400);
      await shot('72-walk-order');
      await app.getByTestId('reorder-rooms').click();
      await settle(300);
    });
    await step("Companies: each company's people, who get its lists by email or by text", async () => {
      await app.getByTestId('back').last().click();
      await settle(500);
      await app.getByTestId('back').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(400);
      await app.getByTestId('account').last().click();
      await app.getByTestId('companies').waitFor();
      await settle(350);
      await app.getByTestId('companies').click();
      await app.getByTestId('company-company-5').getByText(/Nobody gets its lists yet/).waitFor();
      await app.getByTestId('company-company-0').getByText(/Dave Sample/).waitFor();
      await settle(600);
      await shot('73-companies');
      await app.getByTestId('company-company-5').click();
      await app.getByTestId('add-contact').click();
      await app.getByTestId('contact-sheet').waitFor();
      await settle(600);
      // A bad email says so; a good one saves, tidied.
      await app.getByTestId('field-contact-name').fill('Rosa Sample');
      await app.getByTestId('field-contact-email').fill('rosa at volcano');
      await app.getByTestId('contact-save').click();
      await app.getByText('That email does not look right.').waitFor();
      await app.getByTestId('field-contact-email').fill(' Rosa@VolcanoStone.example ');
      await app.getByTestId('field-contact-phone').fill('(941) 555-0110');
      await settle(300);
      await shot('74-add-person');
      await app.getByTestId('contact-save').click();
      await app.getByTestId('contact-sheet').waitFor({ state: 'detached' });
      await app.getByText('rosa@volcanostone.example · (941) 555-0110', { exact: true }).waitFor();
      await settle(500);
      await shot('75-company-people');
      await app.getByTestId('back').last().click();
      await app.getByTestId('company-company-5').getByText(/Rosa Sample/).waitFor();
      await settle(400);
      await app.getByTestId('back').last().click();
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(400);
    });
    await step('Send Lists: by text for a company with only a phone', async () => {
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
      await app.getByTestId('tab-send').last().click();
      await app.getByTestId('send-job').waitFor();
      await app.getByTestId('send-company-5').getByText(/To Rosa Sample/).waitFor();
      await app.getByTestId('send-company-0').getByText(/By text to Dave Sample/).waitFor();
      await settle(500);
      await app.getByTestId('send-company-0').click();
      await app.getByTestId('message-text').waitFor();
      await app.getByTestId('message-phones').getByText(/\(941\) 555-0187/).waitFor();
      await settle(500);
      await shot('76-by-text');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await settle(300);
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('a priority shows on its row, and a checklist ticks off inside an item', async () => {
      // On the job after the steps before; from the list of jobs on a quick run.
      if ((await app.getByTestId('group-room-1').count()) === 0) await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').click();
      const lights = app.getByTestId('item-item-2');
      const priority = async (on: boolean) => {
        await lights.click();
        await app.getByTestId('item-more').click();
        await app.getByTestId('toggle-priority').waitFor();
        await settle(350);
        await app.getByTestId('toggle-priority').click();
        await settle(300);
        if (!on) return;
      };
      await priority(true);
      // Two steps, one ticked off.
      const add = app.getByTestId('step-add');
      await add.scrollIntoViewIfNeeded();
      await add.fill('Hang the left pendant');
      await add.press('Enter');
      await app.getByTestId('step-0').waitFor();
      await add.fill('Hang the right pendant');
      await add.press('Enter');
      await app.getByTestId('step-1').waitFor();
      await app.getByTestId('step-0').click();
      await app.getByTestId('checklist').getByText('1 of 2', { exact: true }).waitFor();
      if ((await app.getByTestId('step-0').getAttribute('aria-checked')) !== 'true') throw new Error('The step did not tick off');
      await settle(400);
      await shot('93-checklist');
      await app.getByTestId('back').last().click();
      await lights.getByLabel('Priority', { exact: true }).waitFor();
      await settle(400);
      await shot('94-priority-row');
      await priority(false);
      await app.getByTestId('back').last().click();
      await lights.getByLabel('Priority', { exact: true }).waitFor({ state: 'detached' });
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('the whole job goes out as a spreadsheet', async () => {
      await app.getByTestId('tab-send').last().click();
      await app.getByTestId('export-spreadsheet').click();
      // The preview page shows it first, then downloads it; on the iPhone the share sheet opens.
      const table = app.getByTestId('spreadsheet-table');
      await table.getByText('Waiting On', { exact: true }).waitFor();
      if ((await table.getByText('Estimated Hours', { exact: true }).count()) !== 0) throw new Error('The spreadsheet still has Estimated Hours');
      await table.getByText('Adjust cabinet door', { exact: true }).first().waitFor();
      await settle(600);
      await shot('98-spreadsheet');
      // Download hands the file to the page's host, which asks the viewer before it saves.
      await app.getByTestId('spreadsheet-download').click();
      const saved = app.locator('body');
      let file: { filename: string; data: string } | undefined;
      for (let i = 0; i < 20 && !file; i += 1) {
        file = await saved.evaluate(() => (window as unknown as { __saved?: { filename: string; data: string } }).__saved);
        if (!file) await settle(150);
      }
      if (!file) throw new Error('The spreadsheet was not handed over to save');
      if (!/^Sample Job North Items \d{4}-\d{2}-\d{2}[.]csv$|^Sample Job Items \d{4}-\d{2}-\d{2}[.]csv$/.test(file.filename)) throw new Error(`The spreadsheet is named ${file.filename}`);
      if (!/^\uFEFF?Number,Title,/.test(file.data)) throw new Error(`The spreadsheet does not start with its columns: ${file.data.slice(0, 60)}`);
      if (!file.data.includes('Adjust cabinet door')) throw new Error('The spreadsheet is missing an item');
      await app.getByTestId('spreadsheet-close').click();
      await app.getByTestId('spreadsheet-sheet').waitFor({ state: 'detached' });
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('New: a company says it is done: To Check on the job, and Complete answers it', async () => {
      if ((await app.getByTestId('group-room-1').count()) === 0) await app.getByTestId('job-job-preview').click();
      // SMS Carpentry marked two of its items done from its page.
      await app.getByTestId('open-to-check').waitFor();
      await app.getByTestId('open-to-check').getByText('2', { exact: true }).waitFor();
      await settle(400);
      await shot('99-to-check-banner');
      await app.getByTestId('open-to-check').click();
      await app.getByText('To Check', { exact: true }).first().waitFor();
      await settle(400);
      await shot('99a-to-check-list');
      await app.locator('[data-testid^="open-item-"]').first().click();
      await app.getByText(/^SMS Carpentry marked it done on /).waitFor();
      await settle(400);
      await shot('99b-to-check-item');
      await app.getByTestId('mark-complete').click();
      await app.getByText('Complete', { exact: true }).first().waitFor();
      await app.getByTestId('back').last().click();
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await app.getByTestId('open-to-check').getByText('1', { exact: true }).waitFor();
      await settle();
    });
    await step('New: a confirmed item shows Confirmed and its time on its row', async () => {
      await app.getByTestId('search').last().fill('cabinet hardware');
      await app.getByText('Install cabinet hardware').first().waitFor();
      await app.getByText('Confirmed', { exact: true }).first().waitFor();
      await app.getByText(/2 hours/).first().waitFor();
      await settle(300);
      await shot('99c-confirmed-row');
      await app.getByTestId('search-clear').last().click();
      await app.getByTestId('group-room-1').waitFor();
    });
    await step("New: a company's list is numbered in the order to do it, starting with what holds up the most", async () => {
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(600);
      await app.getByTestId('view-group-company').click();
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-company-4').waitFor();
      await settle(500);
      await app.getByTestId('group-company-4').click();
      await app.locator('[data-testid^="step-"]').first().waitFor();
      const steps = (await app.locator('[data-testid^="step-"]').allTextContents()).map((t) => t.trim());
      if (steps.length === 0 || steps.some((t, i) => t !== String(i + 1))) throw new Error(`SMS Carpentry's list is not numbered 1, 2, 3: ${steps.join(', ')}`);
      // The pocket door hardware holds up the painting after it, so it comes first.
      if ((await app.getByTestId('step-item-26').count()) > 0) {
        if ((await app.getByTestId('step-item-26').textContent())?.trim() !== '1') throw new Error('What holds up the most work is not number 1');
        await app.getByText('Holds up 1 item').first().waitFor();
      }
      await settle(400);
      await shot('99c2-company-work-order');
      await app.getByTestId('back').last().click();
      await app.getByTestId('filter').click();
      await app.getByTestId('view-done').waitFor();
      await settle(500);
      await app.getByTestId('view-standard').click();
      await app.getByTestId('view-done').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('New: the photo opens full screen, and pages to the next one', async () => {
      await app.getByTestId('search').last().fill('upper cabinets');
      await app.getByText('Set upper cabinets').first().waitFor();
      await settle(300);
      await app.getByText('Set upper cabinets').first().click();
      await app.getByTestId('item-photo').waitFor();
      await settle(500);
      await app.getByTestId('item-photo').click();
      await app.getByTestId('viewer-done').waitFor();
      await app.getByRole('img', { name: /^Photo/ }).first().waitFor();
      await settle(500);
      await shot('99c3-photo-viewer');
      await app.getByTestId('viewer-done').click();
      await app.getByTestId('viewer-done').waitFor({ state: 'detached' });
      await app.getByTestId('back').last().click();
      await settle(400);
      await app.getByTestId('search-clear').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step('New: a sheet with changes asks before they are thrown away', async () => {
      await app.getByTestId('more').last().click();
      await app.getByTestId('edit-job').waitFor();
      await settle(350);
      await app.getByTestId('edit-job').click();
      await app.getByTestId('edit-job-name').waitFor();
      await settle(600);
      await app.getByTestId('edit-job-name').fill('Sample Job Renamed');
      await app.getByTestId('edit-job-cancel').click();
      await app.getByRole('button', { name: 'Discard Changes' }).waitFor();
      await settle(400);
      await shot('99c4-discard-changes');
      await app.getByRole('button', { name: 'Keep Editing' }).click();
      await settle(400);
      if ((await app.getByTestId('edit-job-name').inputValue()) !== 'Sample Job Renamed') throw new Error('Keep Editing lost what was typed');
      await app.getByTestId('edit-job-cancel').click();
      await app.getByRole('button', { name: 'Discard Changes' }).click();
      await app.getByTestId('edit-job').waitFor({ state: 'detached' });
      await settle(500);
      if ((await app.getByText('Sample Job Renamed').count()) > 0) throw new Error('Discard Changes kept the new name');
    });
    await step('New: every company has its page, and the link goes on its list', async () => {
      await app.getByTestId('tab-send').last().click();
      await app.getByTestId('send-job').waitFor();
      await app.getByText('Company Pages', { exact: true }).waitFor();
      await settle(400);
      await shot('99d-company-pages');
      await app.getByTestId('page-company-0').click();
      await app.getByRole('dialog').getByRole('button', { name: 'Copy the Link' }).click();
      await app.getByText(/^Link copied$|^The link did not copy/).first().waitFor();
      // The text that goes with its list carries the link: on the preview, the sample page.
      await app.getByTestId('send-company-0').click();
      await app.getByTestId('message-text').getByText(/punch-list\.expo\.app\/c#sample/).waitFor();
      await settle(400);
      await shot('99e-link-in-text');
      await app.getByTestId('preview-done').click();
      await app.getByTestId('list-preview').waitFor({ state: 'detached' });
      await app.getByTestId('tab-jobs').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle();
    });
    await step("New: the job's station puts every company's list on a tablet or a TV, and turns off", async () => {
      await menu('job-station');
      await app.getByTestId('station-sheet').waitFor();
      await app.getByTestId('station-on').waitFor();
      await settle(400);
      await shot('99f-station-off');
      await app.getByTestId('station-on').click();
      await app.getByTestId('station-code').waitFor();
      await settle(400);
      await shot('99g-station-on');
      await app.getByTestId('station-copy').click();
      await app.getByText(/^Link copied$|^The link did not copy/).first().waitFor();
      await app.getByTestId('station-copy-tv').click();
      await app.getByText(/^TV link copied$|^The link did not copy/).first().waitFor();
      // A new link, then off: the station asks first each time.
      await app.getByTestId('station-new').click();
      await app.getByRole('button', { name: 'Make a New Link', exact: true }).last().click();
      await app.getByText('New link made. The old one no longer works.').waitFor();
      await app.getByTestId('station-off').click();
      await app.getByRole('button', { name: 'Turn Off the Station', exact: true }).last().click();
      await app.getByText('The station is off').waitFor();
      await app.getByTestId('station-on').waitFor();
      await app.getByTestId('station-done').click();
      await app.getByTestId('station-sheet').waitFor({ state: 'detached' });
      await settle(500);
    });
    await step('New: Job Setup: type locations in at the end of each level, add a level, rename it, move it, and move a location', async () => {
      await menu('job-setup');
      const row = (name: string | RegExp) => app.getByTestId(/^setup-location-/).filter({ hasText: name });
      const level1 = app.getByTestId('add-to-Level 1');
      await level1.waitFor();
      await settle();
      await shot('99h-setup-locations');
      // Typed at the end of a level, like a line of the room list; Return keeps going.
      await level1.fill('mudroom');
      await level1.press('Enter');
      await row(/^Mudroom$/).waitFor();
      await level1.fill('kitchen 109');
      await level1.press('Enter');
      await app.getByTestId('add-to-Level 1-problem').getByText('Kitchen 109 is already a location on this job.').waitFor();
      await level1.fill('');
      // A new level, its first location, then a new name and a place higher up.
      await app.getByTestId('add-level').fill('level 4');
      await app.getByTestId('add-level').press('Enter');
      await app.getByTestId('add-to-Level 4').fill('Loft 401');
      await app.getByTestId('add-to-Level 4').press('Enter');
      await row('Loft 401').waitFor();
      await settle(300);
      await app.getByTestId('level-Level 4').click();
      await app.getByRole('button', { name: 'Rename Level', exact: true }).last().click();
      await app.getByTestId('field-level').waitFor();
      await settle(600);
      await app.getByTestId('field-level').fill('level 2');
      await app.getByText('Level 2 is already a level on this job.').waitFor();
      await app.getByTestId('field-level').fill('roof level');
      await shot('99i-level');
      await app.getByTestId('level-save').click();
      await app.getByText('Renamed Level 4 to Roof Level').waitFor();
      await app.getByTestId('level-Roof Level').waitFor();
      await settle(500);
      const order = async () => (await app.getByTestId(/^add-to-[^-]*$/).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).filter((t) => t !== 'add-to-Level 1-problem');
      const before = await order();
      await app.getByTestId('level-Roof Level').click();
      await app.getByRole('button', { name: 'Move Up', exact: true }).last().click();
      await settle(500);
      const after = await order();
      const at = (list: (string | null)[]) => list.indexOf('add-to-Roof Level');
      if (at(after) !== at(before) - 1 || after[at(after) + 1] !== before[at(before) - 1]) throw new Error(`Move Up left the levels in this order: ${after.join(', ')}`);
      // A location moved to another level goes to the end of it; the level left empty goes.
      await row('Loft 401').click();
      await app.getByTestId('pick-location-level').waitFor();
      await settle(600);
      await app.getByTestId('pick-location-level').click();
      await app.getByRole('button', { name: 'Level 2', exact: true }).click();
      await settle(400);
      await shot('99j-location-level');
      await app.getByTestId('location-save').click();
      await app.getByText('Moved Loft 401 to Level 2').waitFor();
      await app.getByTestId('add-to-Roof Level').waitFor({ state: 'detached' });
      await settle(500);
      await shot('99k-setup-after');
    });
    await step('New: read the plans from a PDF, check what Claude found, and add it', async () => {
      await app.getByTestId('read-plans').click();
      await app.getByTestId('plans-pdf').waitFor();
      await settle(600);
      await shot('99l-read-plans');
      const chooser = tab.waitForEvent('filechooser');
      await app.getByTestId('plans-pdf').click();
      await (await chooser).setFiles(plansPath);
      await app.getByTestId('plans-working').waitFor();
      await settle(300);
      await shot('99m-reading');
      await app.getByTestId('plans-summary').waitFor({ timeout: 30_000 });
      // Claude was given the PDF's text with where each piece sits, and the job's levels.
      const asked = await tab.mainFrame().childFrames()[0]?.evaluate(() => (window as unknown as { __plansAsked?: { input: string; images: number } }).__plansAsked);
      if (!asked || !/\n\d+,\d+ KITCHEN\n/.test(asked.input) || !asked.input.includes('PANTRY') || asked.images !== 0) throw new Error(`Claude was not given the PDF's text: ${asked?.input.slice(-300)}`);
      if (!asked.input.includes('The job already has these levels: Level 1, Level 2')) throw new Error("Claude was not told the job's levels");
      const plansRow = (label: string) => app.getByTestId(`plans-row-${label}`);
      await plansRow('Garage 101').waitFor();
      await plansRow('Kitchen 109').getByText('On the job already').waitFor();
      await plansRow('Mudroom 120').getByText('Fills in Mudroom, on the job already').waitFor();
      await app.getByText('The third floor sheet was hard to read: check its rooms.').waitFor();
      await app.getByTestId('plans-add').getByText('Add 6').waitFor();
      await settle(400);
      await shot('99n-plans-read');
      // Leave one out, fix a name, and take the address from the title block.
      await plansRow('Bunk Room 303').click();
      await app.getByTestId('plans-add').getByText('Add 5').waitFor();
      await app.getByTestId('plans-row-Master Closet-fix').click();
      await app.getByTestId('field-fix-location').waitFor();
      await settle(600);
      await app.getByTestId('field-fix-location').fill('Kitchen 109');
      await app.getByText('Kitchen 109 is already a location on this job.').waitFor();
      await app.getByTestId('field-fix-location').fill('master closet 208');
      await app.getByTestId('fix-done').click();
      await plansRow('Master Closet 208').waitFor();
      await app.getByTestId('plans-use-address').click();
      await app.getByTestId('plans-add').getByText('Add 6').waitFor();
      await settle(400);
      await shot('99o-plans-checked');
      await app.getByTestId('plans-add').click();
      await app.getByText('4 locations added and 1 filled in from the plans').waitFor();
      await settle(400);
      if ((await app.getByTestId('field-job-address').inputValue()) !== '412 Bay Isles Road, Longboat Key, Florida 34228') throw new Error("The job's address did not come from the plans");
      // Among the job's own, in the plans' walk order: the garage just ahead of Living 107, its
      // neighbor on the plans (the job's own order stays as it was), and the outside areas last.
      await app.getByTestId(/^setup-location-/).filter({ hasText: 'Master Closet 208' }).waitFor();
      if ((await app.getByTestId(/^setup-location-/).filter({ hasText: 'Bunk Room 303' }).count()) !== 0) throw new Error('A location left out was added');
      const labels = (await app.getByTestId(/^setup-location-/).allInnerTexts()).map((t) => t.trim());
      const garage = labels.indexOf('Garage 101');
      if (garage < 0 || labels[garage + 1] !== 'Living 107') throw new Error(`The garage is not just ahead of Living 107: ${labels.slice(0, 8).join(', ')}`);
      if (labels[labels.length - 1] !== 'Dock') throw new Error(`The outside areas are not last: ${labels.slice(-3).join(', ')}`);
      await settle(400);
      await shot('99p-plans-added');
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
      await shot('99q-job-from-plans');
    });
    /** What Claude was asked last about a task, found by words in its question. */
    const lastAsked = async (words: string) => {
      const all = (await tab.mainFrame().childFrames()[0]?.evaluate(() => (window as unknown as { __asked?: { input: string; images: number; tier: string }[] }).__asked)) ?? [];
      return [...all].reverse().find((a) => a.input.includes(words)) ?? null;
    };
    await step('New: Say It: what is said becomes items to check, one on the list already is left out, and one with no location goes where it is put', async () => {
      await menu('say-it');
      await app.getByTestId('say-words').waitFor();
      await settle(600);
      await shot('99r-say-it');
      await app.getByTestId('say-words').fill('The cabinet door left of the hood rubs. Caulk the window sill by the sink, Triple H. Hang a mirror over the vanity once the owner picks one.');
      await app.getByTestId('say-make').click();
      await app.getByTestId('say-working').waitFor();
      await app.getByTestId('say-summary').waitFor({ timeout: 30_000 });
      const asked = await lastAsked('said what is left to do');
      if (!asked || !asked.input.includes('What they said: "The cabinet door left of the hood rubs.') || !asked.input.includes('- Kitchen 109') || !asked.input.includes('- SMS Carpentry (Carpentry)') || asked.tier !== 'default' || asked.images !== 0) {
        throw new Error(`Claude was not asked Say It with the job: ${asked?.input.slice(0, 400)}`);
      }
      await app.getByTestId('say-row-0').getByText(/Already on the list: item 16/).waitFor();
      if ((await app.getByTestId('say-row-0').getAttribute('aria-checked')) !== 'false') throw new Error('An item on the list already was not left out');
      await app.getByTestId('say-row-1').getByText('Kitchen 109 · Triple H Painting').waitFor();
      await app.getByTestId('say-row-2').getByText('No location · No one yet · Waiting on Owner').waitFor();
      await app.getByTestId('say-add').getByText('Add 2').waitFor();
      await settle(400);
      await shot('99s-say-review');
      // The mirror goes in Bathroom 116.
      await app.getByTestId('say-row-2-fix').click();
      await app.getByTestId('say-fix-room').waitFor();
      await settle(600);
      await app.getByTestId('say-fix-room').click();
      await app.getByRole('button', { name: 'Bathroom 116', exact: true }).click();
      await settle(400);
      await app.getByTestId('say-fix-done').click();
      await app.getByTestId('say-row-2').getByText('Bathroom 116 · No one yet · Waiting on Owner').waitFor();
      await app.getByTestId('say-add').click();
      await app.getByText('Added 2 items. 1 is a draft to finish.').waitFor();
      await app.getByTestId('group-room-1').waitFor();
      await settle(500);
      // One line in Activity.
      await menu('activity');
      await app.getByText(/said 2 items/).first().waitFor();
      await settle(300);
      await shot('99t-said-activity');
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: a new item: Claude says it repeats one on the list, the standard title is offered, a vague title is pointed out, and Recent leads Assigned To', async () => {
      await app.getByTestId('group-room-1').click();
      await app.getByTestId('new-item-row').waitFor();
      await settle();
      await app.getByTestId('new-item-row').click();
      await app.getByTestId('field-title').waitFor();
      await settle(700);
      await app.getByTestId('pick-assigned').click();
      await app.getByTestId('picker').getByText('Recent', { exact: true }).waitFor();
      await settle(400);
      await shot('99u-recent-assignees');
      await app.getByTestId('picker-cancel').click();
      await settle(500);
      // The same thing said another way.
      await app.getByTestId('field-title').fill('cabinet door rubs');
      await app.getByTestId('field-description').click();
      await app.getByTestId('duplicate-note').getByText(/Claude says this is the same as item 16, Adjust cabinet door\./).waitFor({ timeout: 15_000 });
      const same = await lastAsked('Is it the same work as one already on the list');
      if (!same || !same.input.includes('The new item: Cabinet door rubs') || !same.input.includes('- #16 Adjust cabinet door') || same.tier !== 'quick') throw new Error(`Claude was not asked about the same work: ${same?.input.slice(0, 300)}`);
      await settle(300);
      await shot('99v-same-work');
      // A standard title in other words, at once.
      await app.getByTestId('field-title').fill('cover outlet install');
      await app.getByTestId('field-description').click();
      await app.getByTestId('standard-note').getByText(/The standard title is Install outlet cover\./).waitFor();
      await app.getByTestId('standard-use').click();
      await settle(300);
      if ((await app.getByTestId('field-title').inputValue()) !== 'Install outlet cover') throw new Error('Use It did not put in the standard title');
      // Said another way: Claude knows the standard title.
      await app.getByTestId('field-title').fill('switch cover missing');
      await app.getByTestId('field-description').click();
      await app.getByTestId('standard-note').getByText(/The standard title is Install switch plate\./).waitFor({ timeout: 15_000 });
      // What it waits on: Claude picks from the open items in the location.
      await app.getByTestId('waits-on-note').getByText(/^Claude says it waits on #\d+ /).waitFor({ timeout: 15_000 });
      const waits = await lastAsked('Does it have to wait for any of the other open items');
      if (!waits || !waits.input.includes('Open in the same location:') || waits.tier !== 'quick') throw new Error('Claude was not asked what it waits on');
      await settle(300);
      await shot('99w-standard-title');
      // Too vague to send a company.
      await app.getByTestId('field-title').fill('fix it');
      await app.getByTestId('field-description').click();
      await app.getByTestId('vague-note').waitFor();
      await settle(300);
      await shot('99x-vague');
      // Saved anyway, it repeats item 16: Find Duplicates finds it.
      await app.getByTestId('field-title').fill('cabinet door rubs');
      await app.getByTestId('field-description').click();
      await app.getByTestId('duplicate-note').waitFor();
      await app.getByTestId('save').click();
      await app.getByText(/^Saved (as a draft|Cabinet door rubs) in Kitchen 109$/).waitFor();
      await settle(500);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: Find Duplicates: Claude picks out the same work written twice, Merge makes it one, and Not the Same puts a pair away', async () => {
      await menu('find-duplicates');
      await app.getByTestId('dup-summary').getByText(/Claude says (one pair is|\d+ pairs are) the same work written twice/).waitFor({ timeout: 20_000 });
      await settle(400);
      await shot('99y-duplicates');
      // Merge each one that repeats item 16 (the whole walk-through typed another cabinet door earlier).
      for (let round = 0; round < 3; round += 1) {
        const merge = app.getByTestId(/^dup-merge-(16-\d+|\d+-16)$/).first();
        if ((await merge.count()) === 0) break;
        await merge.click();
        await app.getByRole('button', { name: 'Keep Item 16', exact: true }).click();
        await app.getByText(/^Merged item \d+ into item 16\.$/).first().waitFor();
        await settle(500);
        if (round === 0) await shot('99z-merged');
        // Claude looks at what is left.
        await app.getByTestId('dup-summary').getByText(/^Claude says/).waitFor({ timeout: 20_000 });
      }
      // The pairs that look alike but are different work, out of the way until asked for.
      await app.getByTestId('dup-summary').getByText(/Claude says none of the items that look alike are the same work\./).waitFor({ timeout: 20_000 });
      await app.getByTestId('dup-show-close').click();
      await app.getByText('These look alike, but Claude says they are different work.').waitFor();
      const before = await app.getByTestId(/^dup-apart-/).count();
      await app.getByTestId(/^dup-apart-/).first().click();
      await settle(400);
      if ((await app.getByTestId(/^dup-apart-/).count()) !== before - 1) throw new Error('Not the Same did not put the pair away');
      await settle(300);
      await shot('99za-not-the-same');
      // The merge is in item 16's History and the job's Activity.
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await menu('activity');
      await app.getByText(/merged #\d+ Cabinet door rubs into #16 Adjust cabinet door/).first().waitFor();
      await settle(300);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: on a walk, several photos from the library at once, each a draft, and the walk says how it went as the camera closes', async () => {
      await app.getByTestId('group-room-1').click();
      await app.getByTestId('item-item-16').waitFor();
      await settle();
      await app.locator('[data-testid="camera"]:visible').last().click();
      await app.getByTestId('shutter').waitFor();
      await app.getByTestId('camera-say').waitFor();
      await settle(400);
      const chooser = tab.waitForEvent('filechooser');
      await app.getByTestId('camera-library').click();
      await (await chooser).setFiles([photoPath, photoPath, photoPath]);
      await app.getByText('3 photos saved as drafts. Claude fills them in').waitFor();
      await app.getByText('3 saved on this walk. Tap the photo to finish it now.').waitFor();
      await settle(400);
      await shot('99zb-library-batch');
      await app.getByTestId('camera-close').click();
      await app.getByRole('status').filter({ hasText: /^3 saved on this walk\. 3 drafts to check/ }).waitFor();
      await settle(300);
      await shot('99zc-walk-summary');
      await app.getByRole('status').getByRole('button', { name: 'Drafts' }).click();
      await app.getByTestId(/^item-/).first().waitFor();
      await settle(500);
      await app.getByTestId('back').last().click();
      await settle(400);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: Fill In From Photo with the words: Claude sees one more thing marked on the photo, and it becomes a draft too', async () => {
      await app.getByTestId('group-room-5').click();
      // The location slides in: the camera is tapped once it is still.
      await seen('new-item-row').waitFor();
      await settle(700);
      await seen('camera').click();
      await app.getByTestId('shutter').waitFor();
      await settle(400);
      await app.getByTestId('no-photo').click();
      await app.getByTestId('field-title').waitFor();
      await settle(700);
      await app.getByTestId('add-photo').click();
      await app.getByTestId('shutter').waitFor();
      await settle(400);
      await takePhoto();
      await app.getByTestId('tool-circle').click();
      await drag([0.2, 0.2], [0.4, 0.4]);
      await drag([0.6, 0.6], [0.8, 0.8]);
      await app.getByTestId('markup-next').click();
      await app.getByTestId('field-description').waitFor();
      await settle(700);
      await app.getByTestId('field-description').fill('Door rubs, and the tub caulk is cracked too');
      await app.getByTestId('fill-in').click();
      await app.getByText('Claude sees one more thing marked on this photo').waitFor({ timeout: 15_000 });
      const fill = await lastAsked('They also said or typed: "Door rubs, and the tub caulk is cracked too"');
      if (!fill || fill.images !== 1 || fill.tier !== 'default') throw new Error('Fill In did not send the photo with the words');
      await settle(400);
      await shot('99zd-one-more-thing');
      await app.getByRole('button', { name: 'Add It as a Draft', exact: true }).click();
      await app.getByText('Added a draft to finish in Drafts.').waitFor();
      if ((await app.getByTestId('field-title').inputValue()) !== 'Install towel bar') throw new Error('Fill In did not fill in the title');
      await app.getByTestId('save').click();
      await app.getByText(/^Saved Install towel bar in Laundry 119$/).waitFor();
      await settle(500);
      // The other thing waits in Drafts, with the photo.
      await app.getByTestId('back').last().click();
      await app.getByTestId('open-unfinished').click();
      await app.getByTestId(/^item-/).filter({ hasText: 'Caulk tub surround' }).waitFor();
      await settle(400);
      await shot('99ze-the-other-draft');
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: a done photo: taken on an item, it shows as one, and Claude compares it with the photo of the problem', async () => {
      // The towel bar just saved in Laundry 119, with its marked up photo.
      await app.getByTestId('group-room-5').click();
      await app.getByTestId(/^item-/).filter({ hasText: 'Install towel bar' }).last().click();
      await app.locator('[data-testid="add-done-photo"]:visible').last().waitFor();
      await settle(500);
      await app.locator('[data-testid="add-done-photo"]:visible').last().click();
      await app.getByText('A photo of the finished work, for Install towel bar.').waitFor();
      await takePhoto();
      await app.getByTestId('markup-next').click();
      // Back on the item, the done photo shows, marked as one, and Claude says what it sees.
      await app.locator('[data-testid="item-photo-done"]:visible').waitFor();
      await app.locator('[data-testid="done-check"]:visible').getByText('Claude: The left hinge still looks loose.').waitFor({ timeout: 15_000 });
      const asked = await lastAsked('Check the work from two photos');
      if (!asked || asked.images !== 2 || !asked.input.includes('The item: Install towel bar')) throw new Error('The done check did not send both photos with the item');
      await settle(400);
      await shot('99zf0-done-photo');
      await app.getByTestId('back').last().click();
      await settle(400);
      await app.getByTestId('back').last().click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(300);
    });
    await step("New: a new job from another job's setup: its companies, its team and its locations", async () => {
      // Back from the job to Jobs, then New Job once Jobs is still.
      await app.getByTestId('back').last().click();
      await settle(900);
      await app.getByTestId('new-job').last().click();
      await app.getByTestId('field-job-name').fill('Guest House');
      await app.getByTestId('field-copy-from').click();
      // Sample Job North once the walk renamed it, Sample Job on fresh sample data.
      await app.getByTestId('picker').getByText(/^Sample Job( North)?$/).first().click();
      await app.getByTestId('copy-companies').waitFor();
      // Companies and the team are on to start; the locations are picked here.
      await app.getByTestId('copy-locations').click();
      await settle(300);
      await shot('99zf1-copy-from');
      await seen('save').click();
      await app.getByText('Kitchen 109').filter({ visible: true }).first().waitFor();
      await app.getByText('Mudroom 120').filter({ visible: true }).first().waitFor();
      // Its companies came too: SMS Carpentry is on it in Job Setup.
      await menu('job-setup');
      await app.getByRole('tab', { name: 'Companies' }).filter({ visible: true }).click();
      await app.getByTestId(/^setup-company-/).filter({ hasText: 'SMS Carpentry', visible: true }).first().waitFor();
      await settle(300);
      await shot('99zf2-copied-setup');
      await seen('back').click();
      await settle(300);
      await seen('back').click();
      await seen('job-job-preview').waitFor();
      await settle(300);
    });
    await step('New: Read a List: Claude reads a punch list someone else wrote, from its PDF, into items to check', async () => {
      if (!(await seen('job-job-preview').isVisible())) await seen('tab-jobs').click();
      await seen('job-job-preview').waitFor();
      await settle(800);
      await seen('job-job-preview').click();
      await seen('group-room-1').waitFor();
      await settle(500);
      await settle(400);
      await menu('read-list');
      await app.getByTestId('list-pdf').waitFor();
      await settle(400);
      await shot('99zf3-read-a-list');
      const chooser = tab.waitForEvent('filechooser');
      await app.getByTestId('list-pdf').click();
      await (await chooser).setFiles(listPath);
      // The pantry door is new; the paint by the dryer is on the list already once the walk added it.
      await app.getByText('Adjust pantry door').filter({ visible: true }).first().waitFor({ timeout: 20_000 });
      const read = await lastAsked('This is a punch list for a house being built');
      if (!read || !read.input.includes('The list:') || !read.input.includes('Pantry door sticks at the top.')) throw new Error('Read a List did not send the text of the PDF');
      await settle(400);
      await shot('99zf4-list-read');
      await app.getByTestId('say-add').last().click();
      await app.getByText(/^Added \d+ items?\./).waitFor();
      await seen('group-room-1').waitFor();
      await settle(1500);
      // Rows copied from a spreadsheet: each row an item, the columns known by their names.
      await menu('read-list');
      await app.getByTestId('say-words').fill('Location\tTask\tSub\nKitchen 109\tCaulk backsplash\tTriple H Painting\nMudroom\tInstall coat hooks\tSMS Carpentry');
      await app.getByTestId('say-make').click();
      await app.getByText('Install coat hooks').filter({ visible: true }).first().waitFor();
      await settle(400);
      await shot('99zf4b-spreadsheet-rows');
      await app.getByTestId('say-add').last().click();
      await app.getByText('Added 2 items.').waitFor();
      await seen('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: a company from an email signature: Claude fills in the company, its trade and its people', async () => {
      await menu('job-setup');
      await app.getByRole('tab', { name: 'Companies' }).filter({ visible: true }).click();
      await seen('add-company').click();
      await app.getByTestId('company-signature').waitFor();
      await settle(500);
      await app.getByTestId('company-signature').click();
      await app.getByTestId('field-signature').fill('Rosa Diaz\nIsland Paint Company\n941-555-0141 | rosa@islandpaint.example');
      await app.getByTestId('company-signature-read').click();
      await app.getByTestId('company-person-0').waitFor({ timeout: 15_000 });
      if ((await app.getByTestId('field-new-company').inputValue()) !== 'Island Paint Company') throw new Error('The company name was not filled in');
      await app.getByText('Painting', { exact: true }).first().waitFor();
      const asked = await lastAsked("Read a company's details");
      if (!asked || !asked.input.includes('Rosa Diaz') || asked.images !== 0) throw new Error('The signature did not go to Claude');
      await settle(400);
      await shot('99zf5-company-from-signature');
      await app.getByTestId('company-add').click();
      await app.getByText('Island Paint Company added to the job, with 2 people to get its lists').waitFor();
      await settle(400);
      await seen('back').click();
      await seen('group-room-1').waitFor();
      await settle(400);
    });
    await step('New: the Sample Job: one tap adds a whole job to try everything on, with photos, marks and comments, and it deletes like any other job', async () => {
      // From the Jobs screen, which stays underneath the job, hidden. The preview job is named
      // Sample Job, or Sample Job North by now.
      const addSample = app.getByTestId('add-sample-job');
      if (!(await addSample.isVisible())) await app.getByTestId('tab-jobs').last().click();
      await settle(600);
      if (!(await addSample.isVisible())) await app.getByTestId('tab-jobs').last().click();
      await addSample.waitFor();
      await settle(400);
      await shot('99zf-jobs-sample-button');
      await app.getByTestId('add-sample-job').click();
      await app.getByRole('dialog').getByRole('button', { name: 'Add the Sample Job' }).click();
      await app.getByText('The Sample Job is ready. Try anything on it.').waitFor({ timeout: 20_000 });
      await app.getByRole('heading', { name: /^Sample Job( 2)?$/ }).last().waitFor();
      await app.getByTestId('count-open').filter({ visible: true }).first().waitFor();
      await app.getByTestId('open-unfinished').filter({ visible: true }).waitFor();
      await settle(700);
      await shot('99zg-sample-job');
      await app.locator('[data-testid^="group-"]').filter({ hasText: 'Kitchen 109' }).filter({ visible: true }).first().click();
      const door = app.getByTestId(/^item-/).filter({ hasText: 'Adjust cabinet door' });
      await door.waitFor();
      // Its photo is there (no empty slot to take one), and its two comments.
      if ((await door.getByTestId(/^add-photo-/).count()) !== 0) throw new Error('The Sample Job item has no photo');
      await door.getByText('2', { exact: true }).waitFor();
      await settle(600);
      await shot('99zh-sample-kitchen');
      await door.click();
      await app.getByTestId('item-photo').waitFor();
      await settle(600);
      await shot('99zi-sample-item');
      await app.getByTestId('back').last().click();
      await app.getByTestId('back').last().click();
      await settle(500);
      await menu('delete-job');
      await app.getByRole('dialog').getByRole('button', { name: 'Delete the Job' }).click();
      await app.getByText(/^Deleted Sample Job( 2)?$/).waitFor();
      await app.getByTestId('add-sample-job').waitFor();
      await app.getByTestId('job-job-preview').click();
      await app.getByTestId('group-room-1').waitFor();
      await settle(400);
    });
    await step('Me: the company name, Sign Out, and signing in with a code sent by email', async () => {
      await app.getByTestId('back').last().click();
      await app.getByTestId('job-job-preview').waitFor();
      await settle(400);
      await app.getByTestId('account').last().click();
      await app.getByTestId('account-email').getByText('jake@rossbuilt.com').waitFor();
      await app.getByTestId('account-job-job-preview').waitFor();
      await app.getByTestId('company-name').getByText('Ross Built', { exact: true }).waitFor();
      await settle(500);
      await shot('81-account');
      // The admin changes the company's name: it goes on every list.
      await app.getByTestId('company-name').click();
      await app.getByTestId('company-name-field').fill('  Ross   Built Custom Homes ');
      await app.getByTestId('company-name-save').click();
      await app.getByTestId('company-name-sheet').waitFor({ state: 'detached' });
      await app.getByTestId('company-name').getByText('Ross Built Custom Homes', { exact: true }).waitFor();
      await settle(400);
      await shot('81b-company-name');
      await app.getByTestId('sign-out').click();
      await app.getByRole('dialog').getByRole('button', { name: 'Sign Out' }).click();
      await app.getByTestId('sign-in-email').waitFor();
      await settle(600);
      await shot('82-sign-in');
      await app.getByTestId('sign-in-email').fill('Sam@RossBuilt.com');
      await app.getByTestId('sign-in-send').click();
      await app.getByTestId('sign-in-code').waitFor();
      await app.getByText('We sent a code to sam@rossbuilt.com.', { exact: true }).waitFor();
      await settle(400);
      await shot('83-sign-in-code');
      await app.getByTestId('sign-in-code').fill('123456');
      // In as Sam: only the jobs he is on, on one Jobs screen.
      await app.getByTestId('job-job-preview').waitFor();
      await settle(800);
      if ((await app.getByTestId('job-job-preview').count()) !== 1) throw new Error('Signing in opened Jobs twice');
      if ((await app.getByText('Bay Drive House').count()) !== 0) throw new Error('Sam sees a job he is not on');
      await settle(600);
      await shot('84-signed-in');
    });
    await step('New: someone new signs up, walks their first job right away, manages it, and deletes their account', async () => {
      // Signed out after the steps before; signed in on a quick run.
      if ((await app.getByTestId('sign-in-email').count()) === 0) {
        // On a job: back to Jobs. (Jobs can stay drawn under a job after a sheet, so look for the job.)
        if ((await app.getByTestId('group-room-1').count()) > 0 || (await app.getByTestId('job-job-preview').filter({ visible: true }).count()) === 0) await app.getByTestId('back').last().click();
        await app.getByTestId('job-job-preview').waitFor();
        await settle(400);
        await app.getByTestId('account').last().click();
        await app.getByTestId('sign-out').click();
        await app.getByRole('dialog').getByRole('button', { name: 'Sign Out' }).click();
      }
      await app.getByTestId('sign-in-email').waitFor();
      await app.getByTestId('sign-in-email').fill('Pat@GulfCoastHomes.example');
      await app.getByTestId('sign-in-send').click();
      await app.getByTestId('sign-in-code').fill('123456');
      // New here: a third step to name the company.
      await app.getByTestId('sign-up-company').waitFor();
      await app.getByText('Start Your Company', { exact: true }).first().waitFor();
      await app.getByText('Joining a company that already uses Punch List? Ask its admin to add you under People with pat@gulfcoasthomes.example, then sign in again.').waitFor();
      await settle(500);
      await shot('85-start-company');
      await app.getByTestId('sign-up-company').fill('Gulf Coast  Homes');
      await app.getByTestId('sign-up-name').fill('Pat Lee');
      await app.getByTestId('sign-up-start').click();
      // In, as the admin of an empty company: the first job is one tap away.
      await app.getByTestId('empty-new-job').waitFor();
      if ((await app.getByTestId('job-job-preview').count()) !== 0) throw new Error('A new company sees the sample jobs');
      await settle(600);
      await shot('86-new-company');
      await app.getByTestId('empty-new-job').click();
      await app.getByTestId('field-job-name').fill('Bayview');
      await app.getByTestId('field-address').fill('12 Bay Road');
      await app.getByTestId('save').last().click();
      await app.getByText('Bayview', { exact: true }).first().waitFor();
      await settle(600);
      await shot('86b-first-job');
      // Claude can read the plans for a new job from its first screen.
      await app.getByTestId('empty-read-plans').waitFor();
      // Walked right away: a room typed in on the walk, and a company typed in for the item.
      await app.getByTestId('empty-walk').click();
      await app.getByTestId('shutter').waitFor();
      await app.getByTestId('camera-room').click();
      await app.getByTestId('picker-search').last().fill('Mudroom');
      await app.getByTestId('picker-add').click();
      await app.getByTestId('camera-room').getByText('Mudroom').waitFor();
      {
        const chooser = tab.waitForEvent('filechooser');
        await app.getByTestId('shutter').click();
        await (await chooser).setFiles(photoPath);
      }
      await app.getByText('Saved in Mudroom').waitFor();
      await app.getByTestId('camera-last').click();
      await app.getByTestId('done-camera').waitFor();
      await settle(1500);
      await app.getByTestId('pick-assigned').last().click();
      await app.getByTestId('picker-search').last().fill('Harbor Glass');
      await app.getByTestId('picker-add').click();
      await app.getByText('Trade for Harbor Glass').waitFor();
      await settle(400);
      await app.getByRole('button', { name: 'Windows and Doors' }).last().click();
      await app.getByTestId('pick-assigned').last().getByText('Harbor Glass').waitFor();
      await settle(500);
      await shot('86c-walked-right-away');
      await app.getByTestId('done-camera').click();
      await app.getByTestId('shutter').waitFor();
      await app.getByTestId('camera-close').click();
      await app.getByText('Mudroom', { exact: true }).first().waitFor();
      await settle(400);
      await shot('86d-first-location');
      await app.getByTestId('tab-jobs').last().click();
      await app.getByText('Bayview', { exact: true }).first().waitFor();
      await app.getByTestId('account').last().click();
      await app.getByTestId('company-name').getByText('Gulf Coast Homes', { exact: true }).waitFor();
      await app.getByTestId('account-email').getByText('pat@gulfcoasthomes.example').waitFor();
      await app.getByText('Admin · Gulf Coast Homes', { exact: true }).first().waitFor();
      await app.getByTestId('people').click();
      await app.getByText('Pat Lee', { exact: true }).first().waitFor();
      if ((await app.getByText('Jake Ross', { exact: true }).count()) !== 0) throw new Error('A new company sees another company\'s people');
      await settle(500);
      await shot('87-new-company-people');
      await app.getByTestId('back').last().click();
      // The job: hold it down to rename it, swipe it to close it, then delete it from Closed.
      await app.getByTestId('tab-jobs').last().click();
      await app.getByText('Bayview', { exact: true }).first().click({ delay: 700 });
      await app.getByRole('dialog').getByRole('button', { name: 'Edit the Name and Address' }).click();
      await app.getByTestId('edit-job-name').waitFor();
      await settle(500);
      await app.getByTestId('edit-job-name').fill('Bayview House');
      await shot('87b-edit-job');
      await app.getByTestId('edit-job-save').click();
      await app.getByText('Bayview House', { exact: true }).first().waitFor();
      await app.locator('[data-testid^="job-"]').filter({ hasText: 'Bayview House' }).first().evaluate((el) => {
        const row = el.closest('.pl-swipe');
        if (row) row.scrollTo({ left: 400, behavior: 'smooth' });
      });
      await settle(500);
      await shot('87c-swipe-job');
      await app.locator('[data-testid^="close-"]').first().click();
      await app.getByRole('dialog').getByRole('button', { name: 'Close the Job' }).click();
      await app.getByText('Closed Bayview House').waitFor();
      await app.getByTestId('show-closed').click();
      await app.getByText('Bayview House', { exact: true }).first().click({ delay: 700 });
      await app.getByRole('dialog').getByRole('button', { name: 'Delete the Job' }).click();
      await app.getByRole('dialog').getByText(/^Its 1 item and 1 photo, with every comment, go for everyone, for good/).waitFor();
      await settle(400);
      await shot('87d-delete-job');
      await app.getByRole('dialog').getByRole('button', { name: 'Delete the Job' }).click();
      await app.getByText('Deleted Bayview House').waitFor();
      await app.getByTestId('empty-new-job').waitFor();
      await app.getByTestId('account').last().click();
      // The last one at the company: deleting the account deletes the company too.
      await app.getByTestId('delete-account').click();
      await app.getByRole('dialog').getByText(/^You are the only one at Gulf Coast Homes, so the company goes too/).waitFor();
      await settle(400);
      await shot('88-delete-account');
      await app.getByRole('dialog').getByRole('button', { name: 'Delete My Account' }).click();
      await app.getByTestId('sign-in-email').waitFor();
      await settle(400);
    });
  } catch (e) {
    await shot('zz-failure');
    problems.push(`step failed after "${steps.at(-1) ?? 'start'}": ${e instanceof Error ? e.message.split('\n').slice(0, 40).join(' | ') : String(e)}`);
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
