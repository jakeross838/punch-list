// One-time, read-only import of the Fish Completion List from Buildertrend into the app's shape,
// so the pilot job does not start empty. The app loads the file later.
//
//   npm run import:buildertrend -- session "<Copy as cURL from a buildertrend.net request>"
//   npm run import:buildertrend              reads Fish and writes local/fish-import.json
//
// It only reads: every request goes through a guard that refuses anything but a read, before it goes out.
// The session is the same one Phase 0 uses, in local/creds (git ignores local/). It is never printed.

import { join, relative } from 'node:path';
import { importCompletionList, JOBS, readForImport, type ImportedList } from '@punch/buildertrend';
import { curlTransport, hasSession, saveSessionFromCurl, writeJson } from './curl-transport.js';

const OUT = join(process.cwd(), 'local', 'fish-import.json');

/** The pilot job, named as it is in the app's database checks. */
const FISH = { name: 'Fish', address: '715 North Shore Drive' };

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);
  if (command === 'session') {
    if (!arg) throw new Error('Paste the Copy as cURL command in quotes after "session".');
    const saved = saveSessionFromCurl(arg);
    console.log(`Session saved: cookie ${saved.cookieChars} characters, ${plural(saved.headers, 'header')} kept.`);
    return;
  }
  if (command !== undefined) {
    console.log('Usage: npm run import:buildertrend -- session "<curl>"   then   npm run import:buildertrend');
    process.exitCode = 1;
    return;
  }
  if (!hasSession()) {
    throw new Error('No Buildertrend session. Run: npm run import:buildertrend -- session "<Copy as cURL>"');
  }

  const source = await readForImport(curlTransport(), JOBS.fish);
  const imported = importCompletionList(source, { job: FISH });
  writeJson(OUT, imported);
  printCounts(imported);
}

function printCounts(list: ImportedList): void {
  const rooms = list.locations.filter((l) => l.kind === 'room').length;
  const shared = list.locations.length - rooms;
  const open = list.items.filter((i) => i.status === 'open').length;
  console.log(`\n${list.job.name}${list.job.address ? `, ${list.job.address}` : ''}`);
  console.log(`  Rooms       ${rooms} (and ${plural(shared, 'shared area')})`);
  console.log(`  Items       ${list.items.length} (${open} open, ${list.items.length - open} complete)`);
  console.log(`  Companies   ${list.companies.length}`);
  console.log(`  Trades      ${list.trades.length}`);
  console.log(`  Problems    ${list.problems.length}`);
  for (const problem of list.problems) console.log(`    - ${problem}`);
  console.log(`\nWrote ${relative(process.cwd(), OUT)}`);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

main().catch((e: unknown) => {
  // The message only: an error from the curl call can carry its arguments, and the cookie is one of them.
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
