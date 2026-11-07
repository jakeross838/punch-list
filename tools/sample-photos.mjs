// The Sample Job's photos and plan, drawn (not photographed, so nobody mistakes them for a real job)
// and saved as JPEGs the app carries with it, the way a photo from the camera is: the iPhone keeps
// and uploads them like any other photo when someone adds the Sample Job.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/sample-photos.mjs
//
// Writes apps/mobile/assets/sample/*.jpg. Each photo is 1170 by 1560 (three by four, upright), the
// plan 1600 by 1100.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright is installed for the machine, as for the preview check.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps', 'mobile', 'assets', 'sample');

// ---------- the kitchen range wall ----------

const WALL = `
<rect width="390" height="520" fill="#D6D1C9"/>
<rect width="390" height="44" fill="#E8E5E0"/>
<rect y="44" width="390" height="5" fill="#CAC4BB"/>
<rect y="236" width="390" height="112" fill="#E2DED8"/>
<path d="M0 258h390M0 280h390M0 302h390M0 324h390M22 236v22M66 236v22M110 236v22M154 236v22M198 236v22M242 236v22M286 236v22M330 236v22M374 236v22M44 258v22M88 258v22M132 258v22M176 258v22M220 258v22M264 258v22M308 258v22M352 258v22M22 280v22M66 280v22M110 280v22M154 280v22M198 280v22M242 280v22M286 280v22M330 280v22M374 280v22M44 302v22M88 302v22M132 302v22M176 302v22M220 302v22M264 302v22M308 302v22M352 302v22M22 324v22M66 324v22M110 324v22M154 324v22M198 324v22M242 324v22M286 324v22M330 324v22M374 324v22" fill="none" stroke="#D3CEC6" stroke-width="1"/>
<path d="M156 49h78l24 163H132z" fill="#C3BEB6"/>
<rect x="128" y="212" width="134" height="14" fill="#AFAAA2"/>`;

const UPPERS = `
<rect x="14" y="56" width="120" height="180" rx="2" fill="#F4F2EE" stroke="#C3BDB3" stroke-width="1.5"/>
<path d="M74 56l2.5 180" stroke="#C3BDB3" stroke-width="1.5"/>
<rect x="64" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="84" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="256" y="56" width="120" height="180" rx="2" fill="#F4F2EE" stroke="#C3BDB3" stroke-width="1.5"/>
<path d="M316 56v180" stroke="#C3BDB3" stroke-width="1.5"/>
<rect x="306" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="323" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="14" y="236" width="120" height="8" fill="#000" opacity="0.05"/>
<rect x="256" y="236" width="120" height="8" fill="#000" opacity="0.05"/>`;

const OUTLINES = `
<rect x="14" y="56" width="120" height="180" fill="none" stroke="#A9A39A" stroke-width="2" stroke-dasharray="8 7"/>
<rect x="256" y="56" width="120" height="180" fill="none" stroke="#A9A39A" stroke-width="2" stroke-dasharray="8 7"/>`;

const BASE = `
<rect y="348" width="390" height="18" fill="#5C5752"/>
<rect y="366" width="390" height="3" fill="#46423E"/>
<rect x="134" y="342" width="122" height="8" rx="2" fill="#2F2D2B"/>
<rect y="369" width="134" height="151" fill="#EEEBE6"/>
<rect x="256" y="369" width="134" height="151" fill="#EEEBE6"/>
<path d="M0 406h134M256 406h134M67 406v114M323 406v114" stroke="#D0CAC1" stroke-width="1.5"/>
<rect x="134" y="369" width="122" height="151" fill="#8D8982"/>
<rect x="146" y="382" width="98" height="5" rx="2.5" fill="#BAB6AF"/>
<rect x="152" y="404" width="86" height="60" rx="4" fill="#3A3836"/>`;

// ---------- a tub and its tiled surround ----------

const TUB = `
<rect width="390" height="520" fill="#E9E6E0"/>
<rect x="300" width="90" height="330" fill="#DCD8D1"/>
${Array.from({ length: 8 }, (_, r) => `<path d="M0 ${r * 41 + 2}h300" stroke="#CFCAC2" stroke-width="2"/><path d="M300 ${r * 41 + 2}h90" stroke="#C6C1B9" stroke-width="2"/>`).join('')}
${Array.from({ length: 8 }, (_, c) => `<path d="M${c * 41 + 14} 0v330" stroke="#CFCAC2" stroke-width="2"/>`).join('')}
<path d="M300 0v330" stroke="#BDB7AE" stroke-width="3"/>
<circle cx="168" cy="150" r="30" fill="#C9CDD0" stroke="#A3A8AC" stroke-width="3"/>
<circle cx="168" cy="150" r="9" fill="#8E9499"/>
<rect x="164" y="150" width="8" height="34" rx="4" fill="#8E9499"/>
<rect x="150" y="88" width="36" height="16" rx="6" fill="#B9BEC2"/>
<rect y="330" width="390" height="22" fill="#F7F6F3"/>
<rect y="352" width="390" height="118" fill="#FBFAF8"/>
<rect y="352" width="390" height="10" fill="#000" opacity="0.04"/>
<path d="M248 331c14 2 22-1 34 1s22 3 30-1 18 1 26-1" stroke="#7B746B" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M300 300l2 30" stroke="#7B746B" stroke-width="3" stroke-linecap="round"/>
<rect y="470" width="390" height="50" fill="#BDB9B2"/>
<path d="M0 494h390M60 470v50M150 470v50M240 470v50M330 470v50" stroke="#ABA69E" stroke-width="2"/>`;

// ---------- a wall by a window, an outlet with no cover ----------

const OUTLET = `
<rect width="390" height="520" fill="#ECE8E1"/>
<rect x="0" y="40" width="120" height="300" fill="#F7F5F1"/>
<rect x="10" y="52" width="100" height="276" fill="#BCD3DE"/>
<path d="M60 52v276M10 190h100" stroke="#F7F5F1" stroke-width="6"/>
<rect x="0" y="340" width="130" height="10" fill="#E2DED6"/>
<rect x="216" y="372" width="44" height="66" rx="3" fill="#D8D2C8" stroke="#B8B1A6" stroke-width="2"/>
<rect x="226" y="380" width="24" height="50" rx="3" fill="#F3F1EC" stroke="#CFC8BD" stroke-width="1.5"/>
<path d="M233 392v8M243 392v8M233 412v8M243 412v8" stroke="#6E6860" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="238" cy="377" r="2.5" fill="#9B958C"/><circle cx="238" cy="433" r="2.5" fill="#9B958C"/>
<rect y="470" width="390" height="16" fill="#F6F4F0"/>
<rect y="486" width="390" height="34" fill="#A98B6C"/>
<path d="M0 497h390M0 508h390" stroke="#9A7D60" stroke-width="1.5"/>`;

// ---------- a closet door dragging on the carpet ----------

const CLOSET = `
<rect width="390" height="520" fill="#E7E3DC"/>
<rect x="40" y="30" width="310" height="420" fill="#F6F4F0"/>
<rect x="52" y="40" width="140" height="400" fill="#FAF9F6" stroke="#D3CDC3" stroke-width="2"/>
<rect x="198" y="40" width="140" height="400" fill="#FAF9F6" stroke="#D3CDC3" stroke-width="2"/>
<rect x="68" y="60" width="108" height="160" fill="none" stroke="#E0DAD0" stroke-width="2"/>
<rect x="68" y="240" width="108" height="180" fill="none" stroke="#E0DAD0" stroke-width="2"/>
<rect x="214" y="60" width="108" height="160" fill="none" stroke="#E0DAD0" stroke-width="2"/>
<rect x="214" y="240" width="108" height="180" fill="none" stroke="#E0DAD0" stroke-width="2"/>
<circle cx="180" cy="250" r="6" fill="#A89F93"/><circle cx="210" cy="250" r="6" fill="#A89F93"/>
<rect y="450" width="390" height="70" fill="#CFC6B8"/>
${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 37) % 390}" cy="${456 + ((i * 13) % 60)}" r="1.4" fill="#BDB3A3"/>`).join('')}
<path d="M58 452c30 14 78 16 128 4" stroke="#A3967F" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.8"/>`;

// ---------- a laundry wall with no baseboard yet, and the dryer vent ----------

const LAUNDRY = `
<rect width="390" height="520" fill="#E5E2DB"/>
<circle cx="292" cy="150" r="26" fill="#9EA3A6"/>
<circle cx="292" cy="150" r="18" fill="#6F7579"/>
<path d="M274 150c0-10 8-18 18-18" stroke="#C9CCCE" stroke-width="3" fill="none"/>
<rect x="30" y="250" width="150" height="210" rx="6" fill="#F4F4F2" stroke="#CFCFCB" stroke-width="2"/>
<rect x="30" y="250" width="150" height="40" rx="6" fill="#ECECE9"/>
<circle cx="105" cy="375" r="52" fill="#DADCDD" stroke="#B9BCBE" stroke-width="5"/>
<circle cx="105" cy="375" r="36" fill="#9FB4BF" opacity="0.7"/>
<rect x="210" y="250" width="150" height="210" rx="6" fill="#F4F4F2" stroke="#CFCFCB" stroke-width="2"/>
<rect x="210" y="250" width="150" height="40" rx="6" fill="#ECECE9"/>
<circle cx="285" cy="375" r="52" fill="#DADCDD" stroke="#B9BCBE" stroke-width="5"/>
<circle cx="285" cy="375" r="36" fill="#7F8487"/>
<rect y="460" width="390" height="10" fill="#D2CEC5"/>
<path d="M0 466h390" stroke="#B8B2A8" stroke-width="2" stroke-dasharray="10 6"/>
<rect y="470" width="390" height="50" fill="#B7B2A9"/>
<path d="M0 494h390M80 470v50M200 470v50M320 470v50" stroke="#A39E95" stroke-width="2"/>`;

// ---------- a living room wall with a television mount and two screw holes ----------

const TV_WALL = `
<rect width="390" height="520" fill="#E9E5DE"/>
<rect x="90" y="150" width="210" height="130" rx="4" fill="#3B3C3E"/>
<rect x="100" y="160" width="190" height="110" rx="3" fill="#2A2B2D"/>
<path d="M130 175l40 60M150 175l60 80" stroke="#3E4043" stroke-width="2" opacity="0.6"/>
<circle cx="322" cy="214" r="4" fill="#5E574E"/><circle cx="322" cy="214" r="9" fill="none" stroke="#D2CCC2" stroke-width="3"/>
<circle cx="338" cy="246" r="4" fill="#5E574E"/><circle cx="338" cy="246" r="9" fill="none" stroke="#D2CCC2" stroke-width="3"/>
<rect x="60" y="380" width="270" height="70" fill="#8C6E54"/>
<rect x="60" y="380" width="270" height="10" fill="#7A5F48"/>
<rect y="470" width="390" height="14" fill="#F6F4F0"/>
<rect y="484" width="390" height="36" fill="#B49879"/>
<path d="M0 496h390M0 508h390" stroke="#A3876A" stroke-width="1.5"/>`;

// ---------- a vanity with no top yet ----------

const VANITY = `
<rect width="390" height="520" fill="#E4E0D9"/>
<rect x="105" y="40" width="180" height="150" fill="#D8DDE0" stroke="#BFC4C7" stroke-width="3"/>
<path d="M120 60l40 50M140 60l60 80" stroke="#E9ECEE" stroke-width="3"/>
<rect x="40" y="270" width="310" height="10" fill="#C9A77E"/>
<rect x="40" y="280" width="310" height="180" fill="#5B6B74"/>
<rect x="52" y="292" width="140" height="58" fill="#677882" stroke="#4E5D65" stroke-width="2"/>
<rect x="198" y="292" width="140" height="58" fill="#677882" stroke="#4E5D65" stroke-width="2"/>
<rect x="52" y="356" width="140" height="94" fill="#677882" stroke="#4E5D65" stroke-width="2"/>
<rect x="198" y="356" width="140" height="94" fill="#677882" stroke="#4E5D65" stroke-width="2"/>
<rect x="108" y="318" width="28" height="5" rx="2.5" fill="#C9B48D"/><rect x="254" y="318" width="28" height="5" rx="2.5" fill="#C9B48D"/>
<rect x="180" y="226" width="8" height="44" fill="#B8BDC1"/><rect x="202" y="226" width="8" height="44" fill="#B8BDC1"/>
<rect y="460" width="390" height="60" fill="#C4C0B8"/>
<path d="M0 490h390M97 460v60M195 460v60M292 460v60" stroke="#B2ADA4" stroke-width="2"/>`;

// ---------- a shower valve with no trim yet ----------

const SHOWER = `
<rect width="390" height="520" fill="#DCDFE0"/>
${Array.from({ length: 13 }, (_, r) => `<path d="M0 ${r * 40}h390" stroke="#C8CCCE" stroke-width="2"/>`).join('')}
${Array.from({ length: 6 }, (_, c) => `<path d="M${c * 80 + (c % 2) * 0} 0v520" stroke="#C8CCCE" stroke-width="2"/>`).join('')}
<circle cx="195" cy="250" r="44" fill="#8B8F91"/>
<circle cx="195" cy="250" r="34" fill="#B07D3E"/>
<rect x="183" y="226" width="24" height="48" rx="4" fill="#D5D8DA"/>
<rect x="189" y="208" width="12" height="20" rx="3" fill="#C9A15E"/>
<circle cx="195" cy="110" r="10" fill="#B07D3E"/>
<path d="M195 120v30" stroke="#B07D3E" stroke-width="8"/>
<rect y="470" width="390" height="50" fill="#9EA4A7"/>
<path d="M0 494h390M60 470v50M150 470v50M240 470v50M330 470v50" stroke="#8D9396" stroke-width="2"/>`;

// ---------- the plan of Level 1 ----------

const PLAN = `
<rect width="1600" height="1100" fill="#FBFAF6"/>
<g fill="none" stroke="#3B5864" stroke-width="10" stroke-linejoin="miter">
<rect x="80" y="80" width="1440" height="940"/>
<path d="M620 80v520M620 680v340M1060 80v300M1060 460v560M620 600h440M80 560h420M580 560h40M1060 380h460"/>
</g>
<g fill="none" stroke="#3B5864" stroke-width="4">
<path d="M500 560a80 80 0 0 1 80 0M1060 380a80 80 0 0 0 0 80M620 600a80 80 0 0 0 0 80"/>
</g>
<g fill="#9DAAB0" opacity="0.35">
<rect x="680" y="120" width="320" height="56"/><rect x="940" y="176" width="60" height="260"/><rect x="740" y="300" width="160" height="110"/>
</g>
<g font-family="Menlo, monospace" font-size="30" letter-spacing="5" fill="#56707B">
<text x="130" y="140">LIVING 107</text>
<text x="670" y="250">KITCHEN 109</text>
<text x="1110" y="140">GUEST BEDROOM 114</text>
<text x="670" y="660">FOYER 115</text>
<text x="130" y="620">BATHROOM 116</text>
<text x="1110" y="520">LAUNDRY 119</text>
</g>
<g font-family="Menlo, monospace" font-size="22" letter-spacing="4" fill="#8A9AA1">
<text x="90" y="1070">LEVEL 1 FLOOR PLAN, SAMPLE JOB</text>
</g>`;

const PHOTOS = {
  'range-wall': WALL + UPPERS + BASE,
  'range-open': WALL + OUTLINES + BASE,
  'tub-corner': TUB,
  outlet: OUTLET,
  'closet-door': CLOSET,
  laundry: LAUNDRY,
  'tv-wall': TV_WALL,
  vanity: VANITY,
  'shower-valve': SHOWER,
};

const browser = await chromium.launch();
try {
  mkdirSync(out, { recursive: true });
  const photoPage = await browser.newPage({ viewport: { width: 390, height: 520 }, deviceScaleFactor: 3 });
  for (const [name, body] of Object.entries(PHOTOS)) {
    await photoPage.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="390" height="520" viewBox="0 0 390 520">${body}</svg></body></html>`);
    const jpeg = await photoPage.screenshot({ type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 390, height: 520 } });
    writeFileSync(join(out, `${name}.jpg`), jpeg);
    console.log(`Wrote ${name}.jpg (${Math.round(jpeg.length / 1024)} KB)`);
  }
  const planPage = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  await planPage.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">${PLAN}</svg></body></html>`);
  const plan = await planPage.screenshot({ type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1600, height: 1100 } });
  writeFileSync(join(out, 'plan-level-1.jpg'), plan);
  console.log(`Wrote plan-level-1.jpg (${Math.round(plan.length / 1024)} KB)`);
} finally {
  await browser.close();
}
