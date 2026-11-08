// Builds the company's page into one file (apps/company-page/dist/index.html, the script inside it),
// the job's station into another (dist/s and dist/tv) and the owner's page into a third (dist/o),
// ready for Expo's hosting. All three talk to the project's company-page function.
//
//   node tools/build-company-page.mjs            (the live project)
//   COMPANY_PAGE_FUNCTION=http://localhost:9999/fn node tools/build-company-page.mjs   (a test one)

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'apps', 'company-page');
const PROJECT_URL = 'https://ulwewwyhestgxpxdiwme.supabase.co';
const functionUrl = process.env.COMPANY_PAGE_FUNCTION || `${PROJECT_URL}/functions/v1/company-page`;

/** One page: the shared look in index.html, with the script for it inside. */
async function pageFor(entry, title) {
  const result = await build({
    entryPoints: [join(dir, 'src', entry)],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    target: ['safari15', 'chrome100'],
    define: { FUNCTION_URL: JSON.stringify(functionUrl) },
    legalComments: 'none',
  });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return readFileSync(join(dir, 'index.html'), 'utf8')
    .replace('<title>Your List</title>', `<title>${title}</title>`)
    .replace('<!--SCRIPT-->', () => `<script>${script}</script>`);
}

const out = join(dir, 'dist');
const put = (path, html) => {
  mkdirSync(join(out, path), { recursive: true });
  writeFileSync(join(out, path, 'index.html'), html);
};
// A company's link is /c#token; the same page answers at the top too.
const page = await pageFor('main.ts', 'Your List');
put('', page);
put('c', page);
// The job's station: /s#token on a tablet, /tv#token on a TV.
const station = await pageFor('station.ts', 'Job Station');
put('s', station);
put('tv', station);
// The owner's page: /o#token.
const owner = await pageFor('owner.ts', 'Your House');
put('o', owner);
console.log(
  `Company page: ${(page.length / 1024).toFixed(1)} KB, station: ${(station.length / 1024).toFixed(1)} KB, owner's page: ${(owner.length / 1024).toFixed(1)} KB, talking to ${functionUrl}`,
);
