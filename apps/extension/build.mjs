// Builds the extension into apps/extension/dist and zips it for loading in Chrome.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: { content: join(here, 'src/content.ts'), background: join(here, 'src/background.ts') },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
});
copyFileSync(join(here, 'manifest.json'), join(dist, 'manifest.json'));

const zipPath = join(here, 'punch-list-bridge.zip');
rmSync(zipPath, { force: true });
execFileSync('python3', ['-I', '-m', 'zipfile', '-c', zipPath, 'manifest.json', 'content.js', 'background.js'], { cwd: dist });
console.log(`Built ${dist} and ${zipPath}`);
