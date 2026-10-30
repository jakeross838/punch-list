// Turns the Expo web export into one self-contained HTML page for the preview link:
// every script inlined (the artifact page may not load files by absolute path), no favicon,
// and the URL path reset to "/" so the router opens on the jobs screen wherever the page is served.
//
//   (cd apps/mobile && npx expo export --platform web) && node tools/build-preview.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps', 'mobile', 'dist');
const out = join(root, 'local', 'preview', 'index.html');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// Absolute script tags become inline scripts, in the same order.
const scripts = [...html.matchAll(/<script src="(\/_expo\/[^"]+)" defer><\/script>/g)];
if (scripts.length === 0) throw new Error('No exported scripts found in dist/index.html');
for (const [tag, src] of scripts) {
  const code = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(tag, () => `<script>${code}</script>`);
}
html = html.replace(/<link rel="icon"[^>]*>/, '').replace('<title>Punch List</title>', '<title>Punch List Preview</title>');

// Images and fonts the bundle loads by absolute path (the header back arrow, the house font for the
// printed lists) become data URIs: the page may only load data: and blob: images and fonts.
const TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ttf: 'font/ttf',
  otf: 'font/otf',
};
let inlinedImages = 0;
html = html.replace(/(["'`])(\/assets\/[^"'`]+\.(png|jpe?g|gif|svg|webp|ttf|otf))\1/g, (match, quote, path, ext) => {
  try {
    const data = readFileSync(join(dist, path)).toString('base64');
    inlinedImages += 1;
    return `${quote}data:${TYPES[ext.toLowerCase()]};base64,${data}${quote}`;
  } catch {
    return match;
  }
});
const leftover = html.match(/["'`]\/assets\/[^"'`]+["'`]/g) ?? [];
if (leftover.length > 0) throw new Error(`Assets still loaded by path: ${leftover.slice(0, 3).join(', ')}`);

const reset = `<script>try{if(location.pathname!=='/'){history.replaceState(null,'','/'+location.hash)}}catch(e){}</script>`;
html = html.replace('<head>', `<head>\n    ${reset}`);

// The router must not try to load split chunks from absolute paths: the export is one bundle.
const chunkRefs = html.match(/["'`]\/_expo\/static\/js\/web\/[^"'`]+["'`]/g) ?? [];
if (chunkRefs.length > 0) throw new Error(`Bundle still references split chunks: ${chunkRefs.slice(0, 3).join(', ')}`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Preview page: ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB, ${inlinedImages} images and fonts inlined)`);
