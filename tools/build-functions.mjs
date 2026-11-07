// The words the read-plans function asks Claude with come from @punch/core, so the iPhone, the
// preview and the server always ask the same way. This writes them into the function's folder as one
// plain file the function imports (the function cannot reach packages/ once it is deployed).
//
//   node tools/build-functions.mjs           writes supabase/functions/read-plans/prompt.js
//   node tools/build-functions.mjs --check   says whether that file is up to date

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase', 'functions', 'read-plans', 'prompt.js');

export async function promptFile() {
  const result = await build({
    stdin: {
      contents: "export { picturesNote, planPrompt } from './packages/core/src/planReading.ts';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    treeShaking: true,
    write: false,
    legalComments: 'none',
  });
  const header = '// Made by tools/build-functions.mjs from packages/core/src/planReading.ts. Change it there, then run that.\n';
  return header + result.outputFiles[0].text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fresh = await promptFile();
  if (process.argv.includes('--check')) {
    let now = '';
    try {
      now = readFileSync(out, 'utf8');
    } catch {
      // Not written yet.
    }
    if (now !== fresh) {
      console.error('supabase/functions/read-plans/prompt.js is out of date: run node tools/build-functions.mjs');
      process.exit(1);
    }
    console.log('prompt.js is up to date');
  } else {
    writeFileSync(out, fresh);
    console.log(`Wrote ${out} (${fresh.length} characters)`);
  }
}
