import { describe, expect, it } from 'vitest';
import {
  BtError,
  contentTypeFor,
  createTask,
  diffSnapshots,
  ensureOk,
  failedFields,
  fromTipTap,
  isEmptyDiff,
  JOBS,
  listStats,
  listTasks,
  normalizeCompletionList,
  parseDefinitions,
  readTags,
  runPhase0Read,
  runPhase0Write,
  tagIndex,
  takeSnapshot,
  toTipTap,
  WriteGuard,
} from '../src/index.js';
import { FIELD_DEFS, FakeBuildertrend, TAGS, fishFixture } from './fakeBuildertrend.js';

describe('wire rules', () => {
  it('sends merge-patch to /apix and plain JSON to legacy /api', () => {
    expect(contentTypeFor('/apix/v2/Tasks/list')).toBe('application/merge-patch+json');
    expect(contentTypeFor('/api/calendar?jobId=1')).toBe('application/json');
  });

  it('treats failed fields as a failure even with HTTP 200 and success true', () => {
    const res = { status: 200, data: { success: true, data: { failedFields: [{ key: 'title', message: 'Field exceeds 50 characters' }] } }, text: '' };
    expect(failedFields(res.data)).toEqual([{ key: 'title', message: 'Field exceeds 50 characters' }]);
    expect(() => ensureOk(res, 'Create')).toThrow(BtError);
  });

  it('reports an expired session plainly', () => {
    expect(() => ensureOk({ status: 200, data: { needsToRelogin: true }, text: '' }, 'Read')).toThrow(/expired/);
  });
});

describe('descriptions', () => {
  it('round trips plain text through TipTap, one paragraph per line', () => {
    const doc = toTipTap('North wall, left of the window.\nCaulk the gap at the baseboard.');
    expect(doc?.content.content).toHaveLength(2);
    expect(fromTipTap(doc)).toBe('North wall, left of the window.\nCaulk the gap at the baseboard.');
    expect(fromTipTap(JSON.stringify(doc))).toBe('North wall, left of the window.\nCaulk the gap at the baseboard.');
  });

  it('writes no description for empty text', () => {
    expect(toTipTap('   \n  ')).toBeNull();
  });
});

describe('tags', () => {
  it('reads flat ids, objects and nested option groups', () => {
    const names = tagIndex(TAGS);
    expect(readTags([1], names)).toEqual([{ id: 1, name: 'Plumbing' }]);
    expect(readTags([{ id: 2, name: 'Painting' }], names)).toEqual([{ id: 2, name: 'Painting' }]);
    expect(readTags([{ options: [{ id: 3 }] }], names)).toEqual([{ id: 3, name: 'DELETE' }]);
  });
});

describe('completion list', () => {
  const list = { tasks: fishFixture(JOBS.fish) };
  const normalized = normalizeCompletionList(JOBS.fish, list, parseDefinitions(FIELD_DEFS), tagIndex(TAGS));

  it('groups items under their rooms and keeps everything else visible', () => {
    expect(normalized.rooms.map((r) => [r.label, r.items.length])).toEqual([
      ['Kitchen 109', 2],
      ['Master Bathroom 207', 1],
    ]);
    expect(normalized.nested.map((i) => i.title)).toEqual(['Adjust latch']);
    expect(normalized.orphans.map((i) => i.title)).toEqual(['Clean windows']);
    expect(normalized.otherTaskCount).toBe(1);
    expect(normalized.deletedCount).toBe(1);
  });

  it('reads the five fields and the location in app terms', () => {
    const toilet = normalized.rooms[0]!.items[0]!;
    expect(toilet.fields).toEqual({
      location: 'Kitchen 109',
      ready: false,
      waitingOn: 'Volcano Stone',
      readyBy: '2026-11-02',
      boughtOut: true,
      poOrCo: 'PO-0090',
    });
    expect(toilet.trades).toEqual(['Plumbing']);
    expect(toilet.assignees[0]?.name).toBe('Gator Plumbing');
  });

  it('counts the standard breaks a cleanup list would flag', () => {
    const stats = listStats(normalized);
    expect(stats).toMatchObject({ rooms: 2, items: 3, open: 2, complete: 1, noAssignee: 1, markedDelete: 1, notReadyWithoutWaitingOn: 1 });
  });
});

describe('snapshots', () => {
  it('sees an added task, a changed field and a removed task', () => {
    const names = tagIndex(TAGS);
    const tasks = fishFixture(JOBS.sandbox);
    const before = takeSnapshot(JOBS.sandbox, { tasks }, names);
    const changed = structuredClone(tasks);
    changed[2]!.title = 'Replace toilet';
    changed.splice(3, 1);
    changed.push({ ...changed[0]!, taskId: 99, externalId: 'new-99', title: 'Test room' });
    const diff = diffSnapshots(before, takeSnapshot(JOBS.sandbox, { tasks: changed }, names));
    expect(diff.added.map((a) => a.externalId)).toEqual(['new-99']);
    expect(diff.removed.map((r) => r.externalId)).toEqual(['item-12']);
    expect(diff.changed).toEqual([{ externalId: 'item-11', title: 'Replace toilet', changes: [{ field: 'title', before: 'Install toilet', after: 'Replace toilet' }] }]);
    expect(isEmptyDiff(diffSnapshots(before, before))).toBe(true);
  });
});

describe('write guard', () => {
  it('refuses a write to Fish before any request goes out', async () => {
    const fake = new FakeBuildertrend();
    await expect(
      createTask(fake, WriteGuard.sandboxOnly(), { jobId: JOBS.fish, title: 'Install toilet', taskType: 1 }),
    ).rejects.toThrow(/refused/);
    expect(fake.calls).toEqual([]);
  });
});

describe('Phase 0 checks against the stand-in', () => {
  it('passes every read check on a Fish-like list', async () => {
    const fake = new FakeBuildertrend(fishFixture(JOBS.fish));
    const read = await runPhase0Read(fake, { sampleSize: 3, random: () => 0.5 });
    const byId = Object.fromEntries(read.checks.map((c) => [c.id, c.status]));
    expect(byId).toMatchObject({ R1: 'pass', R2: 'pass', R3: 'pass', R4: 'pass', R5: 'pass', R6: 'pass', R8: 'manual' });
    expect(read.fish?.sample).toHaveLength(3);
    expect(fake.calls.every((c) => c.startsWith('GET') || c === 'POST /apix/v2/Tasks/list')).toBe(true);
  });

  it('writes only to the sandbox, confirms each step and leaves it as it found it', async () => {
    const fake = new FakeBuildertrend([...fishFixture(JOBS.fish), ...fishFixture(JOBS.sandbox).slice(0, 2).map((t) => ({ ...t, externalId: `sb-${t.externalId}`, taskId: t.taskId + 1000 }))]);
    const fishBefore = JSON.stringify(fake.tasks.filter((t) => t.jobId === JOBS.fish));
    const read = await runPhase0Read(fake, { sampleSize: 3 });
    const write = await runPhase0Write(fake, {
      sampleTasks: read.rawFishTasks ?? [],
      definitions: read.definitions,
      tags: read.tags,
      today: new Date('2026-11-02T12:00:00Z'),
    });
    const byId = Object.fromEntries(write.checks.map((c) => [c.id, c.status]));
    expect(byId).toMatchObject({ W0: 'pass', W1: 'pass', W2: 'pass', W3: 'pass', W4: 'pass', W5: 'pass', W6: 'pass', W7: 'pass', W8: 'pass', W9: 'blocked', W10: 'pass', W11: 'pass', W12: 'manual' });
    expect(write.fieldWriteRecipe).toMatch(/read shape/);
    expect(JSON.stringify(fake.tasks.filter((t) => t.jobId === JOBS.fish))).toBe(fishBefore);
    expect((await listTasks(fake, JOBS.sandbox)).tasks).toHaveLength(2);
  });

  it('moves on to the next field recipe when one is a silent no-op', async () => {
    const fake = new FakeBuildertrend(fishFixture(JOBS.fish));
    fake.ignoreTaskPatchFields = true;
    const write = await runPhase0Write(fake, { sampleTasks: fishFixture(JOBS.fish), today: new Date('2026-11-02T12:00:00Z') });
    const w3 = write.checks.find((c) => c.id === 'W3');
    expect(w3?.status).toBe('fail');
    expect((w3?.data as unknown[]).length).toBeGreaterThan(2);
    expect(write.checks.find((c) => c.id === 'W11')?.status).toBe('pass');
  });
});
