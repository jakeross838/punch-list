// One-time, read-only import of the Fish Completion List from Buildertrend into the app's shape,
// so the pilot job does not start empty. `tools/load-import.sql` loads the file into a job.
//
//   npm run import:buildertrend -- session "<Copy as cURL from a buildertrend.net request>"
//   npm run import:buildertrend              reads Fish through that session and writes local/fish-import.json
//
// Or from a read saved out of a signed in Buildertrend page (how Fish came over on 9 November 2026;
// `setup.md`, Fish from Buildertrend), with what the job's own list needs said in a hints file:
//
//   npm run import:buildertrend -- from local/fish-raw.json subs local/fish-subs.json hints local/fish-hints.json
//
// It only reads: every request goes through a guard that refuses anything but a read, before it goes out.
// The session is the same one Phase 0 uses, in local/creds (git ignores local/). It is never printed.
// Everything it reads and writes stays in local/: a job's list is never in the repository.

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  importCompletionList,
  JOBS,
  parseDefinitions,
  readForImport,
  tagIndex,
  type BtTask,
  type ImportedList,
  type ImportOptions,
  type ImportSource,
  type SubRecord,
} from '@punch/buildertrend';
import { curlTransport, hasSession, saveSessionFromCurl, writeJson } from './curl-transport.js';

const OUT = join(process.cwd(), 'local', 'fish-import.json');

/** The pilot job, named as it is in the app's database checks. */
const FISH = { name: 'Fish', address: '715 North Shore Drive' };

/** What a job's own list needs, kept beside its read in local/. The room list may be an array of lines. */
type Hints = Omit<ImportOptions, 'rooms' | 'subs'> & { rooms?: string | string[] };

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === 'session') {
    if (!args[1]) throw new Error('Paste the Copy as cURL command in quotes after "session".');
    const saved = saveSessionFromCurl(args[1]);
    console.log(`Session saved: cookie ${saved.cookieChars} characters, ${plural(saved.headers, 'header')} kept.`);
    return;
  }
  const named = namedArgs(args);
  if (named === null) {
    console.log('Usage: npm run import:buildertrend -- session "<curl>"   then   npm run import:buildertrend');
    console.log('   or: npm run import:buildertrend -- from <read.json> [subs <subs.json>] [hints <hints.json>] [out <file.json>]');
    process.exitCode = 1;
    return;
  }

  const hints: Hints = named.hints ? (readJson(named.hints) as Hints) : {};
  const subs = named.subs ? ((readJson(named.subs) as { subs?: SubRecord[] }).subs ?? []) : undefined;
  let source: ImportSource;
  if (named.from) {
    source = savedRead(readJson(named.from));
  } else {
    if (!hasSession()) {
      throw new Error('No Buildertrend session. Run: npm run import:buildertrend -- session "<Copy as cURL>"');
    }
    source = await readForImport(curlTransport(), JOBS.fish);
  }

  const { rooms, ...rest } = hints;
  const options: ImportOptions = { job: FISH, ...rest };
  if (rooms !== undefined) options.rooms = Array.isArray(rooms) ? rooms.join('\n') : rooms;
  if (subs) options.subs = subs;
  const imported = importCompletionList(source, options);
  const out = named.out ? join(process.cwd(), named.out) : OUT;
  writeJson(out, imported);
  printCounts(imported, out);
}

/** "from a subs b hints c out d" as a record, or null when it is not that. */
function namedArgs(args: string[]): Record<'from' | 'subs' | 'hints' | 'out', string | undefined> | null {
  const out: Record<string, string | undefined> = { from: undefined, subs: undefined, hints: undefined, out: undefined };
  if (args.length % 2 !== 0) return null;
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!;
    if (!(key in out)) return null;
    out[key] = args[i + 1];
  }
  return out as Record<'from' | 'subs' | 'hints' | 'out', string | undefined>;
}

/**
 * A read saved out of a Buildertrend page: the same three reads the session makes (the field
 * definitions, the tags and the job's task list), as the page got them.
 */
function savedRead(raw: unknown): ImportSource {
  const r = raw as { jobId?: number; definitions?: unknown; tags?: unknown; list?: { tasks?: BtTask[]; jobs?: unknown[] } };
  const jobId = Number(r.jobId);
  if (!Number.isFinite(jobId) || !Array.isArray(r.list?.tasks)) throw new Error('That file is not a saved read: it needs jobId, definitions, tags and list.tasks.');
  const tasks = r.list.tasks.filter((t) => t.jobId === undefined || t.jobId === jobId);
  return { jobId, list: { ...r.list, tasks }, definitions: parseDefinitions(r.definitions), tagNames: tagIndex(r.tags) };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'));
}

function printCounts(list: ImportedList, out: string): void {
  const rooms = list.locations.filter((l) => l.kind === 'room').length;
  const shared = list.locations.length - rooms;
  const work = list.items.filter((i) => !i.actionItem);
  const open = work.filter((i) => i.status === 'open' && i.markedDoneAt === null).length;
  const toCheck = work.filter((i) => i.markedDoneAt !== null).length;
  const complete = work.filter((i) => i.status === 'complete').length;
  const actions = list.items.length - work.length;
  console.log(`\n${list.job.name}${list.job.address ? `, ${list.job.address}` : ''}`);
  console.log(`  Rooms       ${rooms} (and ${plural(shared, 'area')} outside or shared)`);
  console.log(`  Items       ${work.length} (${open} open, ${toCheck} to check, ${complete} complete)`);
  if (actions > 0) console.log(`  Action Items ${actions}`);
  console.log(`  Companies   ${list.companies.length}${list.contacts.length > 0 ? ` (${plural(list.contacts.length, 'person', 'people')})` : ''}`);
  console.log(`  Trades      ${list.trades.length}`);
  console.log(`  Problems    ${list.problems.length}`);
  for (const problem of list.problems) console.log(`    - ${problem}`);
  console.log(`\nWrote ${relative(process.cwd(), out)}`);
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

main().catch((e: unknown) => {
  // The message only: an error from the curl call can carry its arguments, and the cookie is one of them.
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
