// The functions that ask Claude take their words, their tasks and Claude's prices from @punch/core,
// so the iPhone, the preview and the server always ask the same way, and they share the code in
// supabase/functions/_shared/claude.ts. A function cannot reach packages/ or another folder once it
// is deployed, so this writes what each one needs into its own folder: core.js, bundled from the
// core, and claude.ts, copied from _shared.
//
//   node tools/build-functions.mjs           writes them
//   node tools/build-functions.mjs --check   says whether they are up to date

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const functions = join(root, 'supabase', 'functions');

/** Each function that asks Claude, and what it takes from the core. */
const FUNCTIONS = {
  ai: { from: 'claude.ts', names: ['CLAUDE_MODELS', 'CLAUDE_TASKS', 'costCents', 'isClaudeTask', 'taskPrompt'] },
  'read-plans': { from: 'planReading.ts', names: ['picturesNote', 'planPrompt'], also: { 'claude.ts': ['CLAUDE_MODELS', 'costCents'] } },
};

async function coreFile(spec) {
  const lines = [`export { ${spec.names.join(', ')} } from './packages/core/src/${spec.from}';`];
  for (const [from, names] of Object.entries(spec.also ?? {})) lines.push(`export { ${names.join(', ')} } from './packages/core/src/${from}';`);
  const result = await build({
    stdin: { contents: lines.join('\n'), resolveDir: root, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    treeShaking: true,
    write: false,
    legalComments: 'none',
  });
  return '// Made by tools/build-functions.mjs from packages/core. Change it there, then run that.\n' + result.outputFiles[0].text;
}

function sharedFile() {
  return '// Copied by tools/build-functions.mjs from supabase/functions/_shared/claude.ts. Change it there, then run that.\n' + readFileSync(join(functions, '_shared', 'claude.ts'), 'utf8');
}

/** Every file this writes, by its path, with what it should say. */
export async function functionFiles() {
  const files = {};
  for (const [name, spec] of Object.entries(FUNCTIONS)) {
    files[join(functions, name, 'core.js')] = await coreFile(spec);
    files[join(functions, name, 'claude.ts')] = sharedFile();
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = await functionFiles();
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [path, fresh] of Object.entries(files)) {
    const short = path.slice(root.length + 1);
    if (check) {
      let now = '';
      try {
        now = readFileSync(path, 'utf8');
      } catch {
        // Not written yet.
      }
      if (now !== fresh) {
        console.error(`${short} is out of date: run node tools/build-functions.mjs`);
        stale += 1;
      }
    } else {
      writeFileSync(path, fresh);
      console.log(`Wrote ${short} (${fresh.length} characters)`);
    }
  }
  if (check) {
    if (stale > 0) process.exit(1);
    console.log("The functions' files are up to date");
  }
}
