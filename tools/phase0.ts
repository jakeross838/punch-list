// Phase 0 from the command line, through a pasted Buildertrend session.
//
//   npm run phase0 -- session "<Copy as cURL from a buildertrend.net request>"
//   npm run phase0 -- read     Fish completion list, read only
//   npm run phase0 -- write    sandbox write test (needs a read first, for field shapes)
//   npm run phase0 -- all      both
//
// Reports go to local/reports (git ignores local/). The same checks run inside Chrome from the extension.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  recordingTransport,
  runPhase0Read,
  runPhase0Write,
  type CallRecord,
  type Check,
  type Phase0ReadResult,
} from '@punch/buildertrend';
import { curlTransport, saveSessionFromCurl, writeJson } from './curl-transport.js';

const REPORTS = join(process.cwd(), 'local', 'reports');

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);
  if (command === 'session') {
    if (!arg) throw new Error('Paste the Copy as cURL command in quotes after "session".');
    const saved = saveSessionFromCurl(arg);
    console.log(`Session saved: cookie ${saved.cookieChars} characters, ${saved.headers} headers kept.`);
    return;
  }
  if (!['read', 'write', 'all'].includes(command ?? '')) {
    console.log('Usage: npm run phase0 -- session "<curl>" | read | write | all');
    process.exitCode = 1;
    return;
  }

  const calls: CallRecord[] = [];
  const t = recordingTransport(curlTransport(), calls);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let read: Phase0ReadResult | undefined;

  if (command === 'read' || command === 'all') {
    read = await runPhase0Read(t);
    writeJson(join(REPORTS, `phase0-read-${stamp}.json`), { ...read, calls });
    printChecks('Read checks (Fish, read only)', read.checks);
  } else {
    read = latestRead();
  }

  if (command === 'write' || command === 'all') {
    const write = await runPhase0Write(t, {
      sampleTasks: read?.rawFishTasks ?? [],
      ...(read?.definitions.length ? { definitions: read.definitions } : {}),
      ...(read?.tags.length ? { tags: read.tags } : {}),
      ...(read?.fish?.stats.trades[0] ? { tradeTagName: read.fish.stats.trades[0].name } : {}),
    });
    writeJson(join(REPORTS, `phase0-write-${stamp}.json`), { ...write, calls });
    printChecks('Write checks (sandbox only)', write.checks);
  }
  console.log(`\nReports in ${REPORTS}`);
}

function latestRead(): Phase0ReadResult | undefined {
  if (!existsSync(REPORTS)) return undefined;
  const files = readdirSync(REPORTS).filter((f) => f.startsWith('phase0-read-')).sort();
  const last = files.at(-1);
  return last ? (JSON.parse(readFileSync(join(REPORTS, last), 'utf8')) as Phase0ReadResult) : undefined;
}

function printChecks(title: string, checks: Check[]): void {
  console.log(`\n${title}`);
  for (const c of checks) {
    const mark = { pass: 'PASS', fail: 'FAIL', manual: 'LOOK', blocked: 'BLOCKED', skipped: 'SKIP' }[c.status];
    console.log(`  ${mark.padEnd(7)} ${c.id.padEnd(4)} ${c.name}: ${c.detail}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
