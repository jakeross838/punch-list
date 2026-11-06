// Builds the company's page into one file: apps/company-page/dist/index.html, the script inside it,
// ready for Expo's hosting. The function it talks to is the project's company-page function.
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

const result = await build({
  entryPoints: [join(dir, 'src', 'main.ts')],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: ['safari15', 'chrome100'],
  define: { FUNCTION_URL: JSON.stringify(functionUrl) },
  legalComments: 'none',
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = readFileSync(join(dir, 'index.html'), 'utf8').replace('<!--SCRIPT-->', () => `<script>${script}</script>`);

const out = join(dir, 'dist');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), page);
// The link's address is /c#token; the same page answers there.
mkdirSync(join(out, 'c'), { recursive: true });
writeFileSync(join(out, 'c', 'index.html'), page);
console.log(`Company page: ${(page.length / 1024).toFixed(1)} KB, talking to ${functionUrl}`);
