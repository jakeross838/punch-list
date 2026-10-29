import { JOBS, TASK_FIELDS, TASK_STATUS, TASK_TYPE, TASKS_ASSOCIATED_TYPE, TEST_SUB_ID, type TaskFieldKey } from './config.js';
import {
  listStats,
  normalizeCompletionList,
  readAssignees,
  readTags,
  tagIndex,
  type CompletionItem,
  type CompletionList,
  type ListStats,
} from './completion.js';
import {
  describeValueShapes,
  fieldEntry,
  parseDefinitions,
  readFieldValue,
  type FieldDef,
} from './customFields.js';
import { BtError, ensureOk, isRecord } from './envelope.js';
import { canonical, diffSnapshots, isEmptyDiff, takeSnapshot, type SnapshotDiff } from './snapshot.js';
import {
  checkSession,
  createTask,
  deleteSandboxTasks,
  getTask,
  listTasks,
  patchTask,
  setAssignees,
  setStatus,
  setTags,
  taskAttachments,
  taskFieldDefinitions,
  taskTags,
  WriteGuard,
  type BtTask,
  type TaskRef,
} from './tasks.js';
import { toTipTap } from './tiptap.js';
import type { Transport } from './transport.js';

// Phase 0: prove the Buildertrend connection.
// Read checks run against Fish and never write. Write checks run against the sandbox job only,
// confirm every step by reading it back, and clean up their own test tasks at the end.

export type CheckStatus = 'pass' | 'fail' | 'manual' | 'blocked' | 'skipped';

export interface Check {
  id: string;
  name: string;
  status: CheckStatus;
  detail: string;
  data?: unknown;
}

export interface Phase0ReadResult {
  checks: Check[];
  definitions: FieldDef[];
  tags: Array<{ id: number; name: string }>;
  fish?: { list: CompletionList; stats: ListStats; valueShapes: unknown; sample: SampleRow[] };
  /** Raw Fish tasks, kept for discovery. Stays in the local report, never in git. */
  rawFishTasks?: BtTask[];
}

export interface SampleRow {
  room: string;
  title: string;
  description: string;
  company: string;
  trade: string;
  ready: string;
  waitingOn: string;
  readyBy: string;
  boughtOut: string;
  poOrCo: string;
  complete: boolean;
  externalId: string;
}

export interface Phase0WriteResult {
  checks: Check[];
  created: TaskRef[];
  fieldWriteRecipe: string | null;
  diffAfterWrites?: SnapshotDiff;
  diffAfterCleanup?: SnapshotDiff;
}

export interface ReadOptions {
  fishJobId?: number;
  sampleSize?: number;
  random?: () => number;
}

export async function runPhase0Read(t: Transport, options: ReadOptions = {}): Promise<Phase0ReadResult> {
  const fishJobId = options.fishJobId ?? JOBS.fish;
  const sampleSize = options.sampleSize ?? 20;
  const random = options.random ?? Math.random;
  const checks: Check[] = [];
  const result: Phase0ReadResult = { checks, definitions: [], tags: [] };

  // R1 session
  try {
    const s = await checkSession(t);
    checks.push(pass('R1', 'Buildertrend session works', `Logged in; ${s.jobCount} jobs visible`));
  } catch (e) {
    checks.push(fail('R1', 'Buildertrend session works', errorText(e)));
    return result;
  }

  // R2 field definitions
  try {
    result.definitions = parseDefinitions(await taskFieldDefinitions(t));
    const missing = (Object.keys(TASK_FIELDS) as TaskFieldKey[]).filter(
      (k) => !result.definitions.some((d) => d.id === TASK_FIELDS[k]),
    );
    const found = (Object.keys(TASK_FIELDS) as TaskFieldKey[])
      .map((k) => result.definitions.find((d) => d.id === TASK_FIELDS[k]))
      .filter((d): d is FieldDef => d !== undefined)
      .map((d) => `${d.label} (${d.dataType}${d.options.length ? `, ${d.options.length} options` : ''})`);
    checks.push(
      missing.length === 0
        ? pass('R2', 'All six task fields exist', found.join('; '))
        : fail('R2', 'All six task fields exist', `Missing field ids for: ${missing.join(', ')}. Found: ${found.join('; ')}`),
    );
  } catch (e) {
    checks.push(fail('R2', 'All six task fields exist', errorText(e)));
  }

  // R3 tag list
  let tagNames = new Map<number, string>();
  try {
    tagNames = tagIndex(await taskTags(t));
    result.tags = [...tagNames.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    const del = result.tags.find((x) => x.name.toUpperCase() === 'DELETE');
    checks.push(
      pass('R3', 'Task tag list reads', `${result.tags.length} tags; DELETE tag ${del ? `exists (id ${del.id})` : 'not found'}`),
    );
  } catch (e) {
    checks.push(fail('R3', 'Task tag list reads', errorText(e)));
  }

  // R4 + R5 Fish list
  let fishTasks: BtTask[] = [];
  try {
    const list = await listTasks(t, fishJobId);
    fishTasks = list.tasks;
    result.rawFishTasks = list.tasks;
    const normalized = normalizeCompletionList(fishJobId, list, result.definitions, tagNames);
    const stats = listStats(normalized);
    const valueShapes = describeValueShapes(list.tasks);
    const sample = pickSample(normalized, sampleSize, random);
    result.fish = { list: normalized, stats, valueShapes, sample };
    checks.push(
      stats.rooms > 0 && stats.items > 0
        ? pass(
            'R4',
            'Fish completion list reads',
            `${plural(stats.rooms, 'room')}, ${plural(stats.items, 'item')} (${stats.open} open, ${stats.complete} complete); ` +
              `${normalized.orphans.length} outside a room, ${normalized.nested.length} nested deeper, ` +
              `${plural(normalized.otherTaskCount, 'other task')} (Action Items and such), ${normalized.deletedCount} deleted`,
          )
        : fail('R4', 'Fish completion list reads', `Read ${list.tasks.length} tasks but found ${stats.rooms} rooms and ${stats.items} items`),
    );
    const punchCount = list.tasks.filter((x) => x.isDeleted !== true && x.taskType === TASK_TYPE.punchList).length;
    const accounted = stats.rooms + stats.items + normalized.orphans.length + normalized.nested.length;
    checks.push(
      punchCount === accounted
        ? pass('R5', 'Every punch list task is accounted for', `${punchCount} of ${punchCount}`)
        : fail('R5', 'Every punch list task is accounted for', `${accounted} accounted for out of ${punchCount}`),
    );
  } catch (e) {
    checks.push(fail('R4', 'Fish completion list reads', errorText(e)));
  }

  // R6 second read path agrees with the list, item by item
  if (result.fish && result.fish.sample.length > 0) {
    const mismatches: string[] = [];
    let compared = 0;
    for (const row of result.fish.sample) {
      const fromList = fishTasks.find((x) => x.externalId === row.externalId);
      if (!fromList) continue;
      try {
        const single = await getTask(t, row.externalId);
        compared += 1;
        const diffs = compareTaskReads(fromList, single, tagNames);
        if (diffs.length > 0) mismatches.push(`${row.room} / ${row.title}: ${diffs.join(', ')}`);
      } catch (e) {
        mismatches.push(`${row.room} / ${row.title}: ${errorText(e)}`);
      }
    }
    const r6 = `A second read of ${plural(result.fish.sample.length, 'random item')} matches the list`;
    checks.push(
      mismatches.length === 0
        ? pass('R6', r6, `${plural(compared, 'item')}, field for field`)
        : fail('R6', r6, mismatches.slice(0, 10).join(' | ')),
    );
  }

  // R7 attachments shape (for the photo recipe)
  const withPhotos = fishTasks.filter((x) => x.hasAttachments === true).slice(0, 3);
  if (withPhotos.length > 0) {
    const shapes: unknown[] = [];
    for (const task of withPhotos) {
      try {
        shapes.push(await taskAttachments(t, task.externalId));
      } catch (e) {
        shapes.push(errorText(e));
      }
    }
    checks.push({ id: 'R7', name: 'Attachment read shape', status: 'pass', detail: `${withPhotos.length} items read`, data: shapes });
  } else {
    checks.push({ id: 'R7', name: 'Attachment read shape', status: 'skipped', detail: 'No Fish items have attachments' });
  }

  // R8 the human check against the Buildertrend screen
  if (result.fish) {
    checks.push({
      id: 'R8',
      name: 'Spot check 20 items against the Buildertrend screen',
      status: 'manual',
      detail: 'Compare each sampled row with the item in Buildertrend: room, title, company, trade and the five fields.',
      data: result.fish.sample,
    });
  }
  return result;
}

export interface WriteOptions {
  sandboxJobId?: number;
  testSubId?: number;
  /** Shapes of customFieldValues entries seen on Fish, used to write values in the same shape. */
  sampleTasks?: BtTask[];
  definitions?: FieldDef[];
  tags?: Array<{ id: number; name: string }>;
  tradeTagName?: string;
  today?: Date;
  cleanup?: boolean;
}

export async function runPhase0Write(t: Transport, options: WriteOptions = {}): Promise<Phase0WriteResult> {
  const jobId = options.sandboxJobId ?? JOBS.sandbox;
  const guard = WriteGuard.sandboxOnly();
  const checks: Check[] = [];
  const created: TaskRef[] = [];
  const result: Phase0WriteResult = { checks, created, fieldWriteRecipe: null };
  const today = options.today ?? new Date();
  const day = (offset: number) => isoDate(addDays(today, offset));

  // W0 the guard refuses the live job
  try {
    guard.assert(JOBS.fish, 'Guard self test');
    checks.push(fail('W0', 'Writes to Fish are refused', 'The guard allowed a write to Fish'));
    return result;
  } catch {
    checks.push(pass('W0', 'Writes to Fish are refused', 'The guard refused a write to Fish before any call'));
  }

  const definitions = options.definitions ?? parseDefinitions(await taskFieldDefinitions(t));
  const tagList = options.tags ?? [...tagIndex(await taskTags(t)).entries()].map(([id, name]) => ({ id, name }));
  const tagNames = new Map(tagList.map((x) => [x.id, x.name]));

  const before = takeSnapshot(jobId, await listTasks(t, jobId), tagNames);
  const stamp = today.toISOString().slice(0, 16).replace('T', ' ');

  try {
    // W1 room group
    const room = await createTask(t, guard, {
      jobId,
      title: 'Punch List Test Room 999',
      taskType: TASK_TYPE.punchList,
      ancestorId: null,
      startDate: day(0),
      endDate: day(0),
    });
    created.push(room);
    const roomBack = await readBack(t, room);
    checks.push(
      roomBack.title === 'Punch List Test Room 999' && roomBack.taskType === TASK_TYPE.punchList && !roomBack.ancestorId
        ? pass('W1', 'Create a room group', `taskId ${room.taskId}`)
        : fail('W1', 'Create a room group', `Read back: ${JSON.stringify(pick(roomBack, ['title', 'taskType', 'ancestorId']))}`),
    );

    // W2 item inside it, with a description
    const description = `Test item from the punch list app, ${stamp}. North wall, left of the window.`;
    const item = await createTask(t, guard, {
      jobId,
      title: 'Install test fixture',
      taskType: TASK_TYPE.punchList,
      ancestorId: room.taskId,
      description: toTipTap(description),
      descriptionPlainText: description,
      startDate: day(0),
      endDate: day(0),
    });
    created.push(item);
    const itemBack = await readBack(t, item);
    const itemOk =
      itemBack.title === 'Install test fixture' &&
      itemBack.ancestorId === room.taskId &&
      itemBack.taskType === TASK_TYPE.punchList &&
      String(itemBack.descriptionPlainText ?? '').trim() === description;
    checks.push(
      itemOk
        ? pass('W2', 'Create an item in the room with a description', `taskId ${item.taskId}`)
        : fail('W2', 'Create an item in the room with a description', `Read back: ${JSON.stringify(pick(itemBack, ['title', 'ancestorId', 'taskType', 'descriptionPlainText']))}`),
    );

    // W3 the six fields
    const wanted = testFieldValues(definitions, day(7));
    const fieldResult = await writeFieldsByProbing(t, guard, item, wanted, definitions, options.sampleTasks ?? []);
    result.fieldWriteRecipe = fieldResult.recipe;
    checks.push(
      fieldResult.recipe
        ? pass('W3', 'Set Location, Ready, Waiting On, Ready By, Bought Out and PO / CO', `Recipe: ${fieldResult.recipe}`, fieldResult.attempts)
        : fail('W3', 'Set Location, Ready, Waiting On, Ready By, Bought Out and PO / CO', 'No recipe persisted all six fields', fieldResult.attempts),
    );

    // W4 assignee
    const subId = options.testSubId ?? TEST_SUB_ID;
    await setAssignees(t, guard, item, [subId]);
    const assigned = readAssignees(await readBack(t, item)).map((a) => a.id);
    checks.push(
      assigned.length === 1 && assigned[0] === subId
        ? pass('W4', 'Assign the test sub', `Assigned ${subId}`)
        : fail('W4', 'Assign the test sub', `Read back assignees: ${assigned.join(', ') || 'none'}`),
    );

    // W5 trade tag
    const trade = chooseTradeTag(tagList, options.tradeTagName);
    if (trade) {
      await setTags(t, guard, item, [trade.id]);
      const tagsBack = readTags((await readBack(t, item)).tags, tagNames).map((x) => x.name);
      checks.push(
        tagsBack.length === 1 && tagsBack[0] === trade.name
          ? pass('W5', 'Tag the trade', trade.name)
          : fail('W5', 'Tag the trade', `Read back tags: ${tagsBack.join(', ') || 'none'}`),
      );
    } else {
      checks.push({ id: 'W5', name: 'Tag the trade', status: 'blocked', detail: 'No trade tag found in the tag list' });
    }

    // W6 edit title and description
    const edited = `Edited ${stamp}. South wall, right of the door.`;
    await patchTask(t, guard, item, {
      title: 'Replace test fixture',
      description: toTipTap(edited),
      descriptionPlainText: edited,
    });
    const editBack = await readBack(t, item);
    checks.push(
      editBack.title === 'Replace test fixture' && String(editBack.descriptionPlainText ?? '').trim() === edited
        ? pass('W6', 'Edit the title and description', 'Both changed')
        : fail('W6', 'Edit the title and description', `Read back: ${JSON.stringify(pick(editBack, ['title', 'descriptionPlainText']))}`),
    );

    // W7 complete, then reopen
    await setStatus(t, guard, item, TASK_STATUS.completed);
    const doneBack = (await readBack(t, item)).status;
    await setStatus(t, guard, item, TASK_STATUS.notStarted);
    const openBack = (await readBack(t, item)).status;
    checks.push(
      doneBack === TASK_STATUS.completed && openBack === TASK_STATUS.notStarted
        ? pass('W7', 'Complete, then reopen', 'Both read back')
        : fail('W7', 'Complete, then reopen', `After complete: ${doneBack}; after reopen: ${openBack}`),
    );

    // W8 DELETE tag next to the trade
    const del = tagList.find((x) => x.name.toUpperCase() === 'DELETE');
    if (del && trade) {
      await setTags(t, guard, item, [trade.id, del.id]);
      const tagsBack = readTags((await readBack(t, item)).tags, tagNames).map((x) => x.name.toUpperCase());
      checks.push(
        tagsBack.includes('DELETE') && tagsBack.includes(trade.name.toUpperCase())
          ? pass('W8', 'Tag DELETE (never delete)', 'DELETE and the trade both read back')
          : fail('W8', 'Tag DELETE (never delete)', `Read back tags: ${tagsBack.join(', ')}`),
      );
    } else {
      checks.push({
        id: 'W8',
        name: 'Tag DELETE (never delete)',
        status: 'blocked',
        detail: del ? 'No trade tag to keep beside it' : 'There is no DELETE task tag in the account yet',
      });
    }

    // W9 photo
    checks.push({
      id: 'W9',
      name: 'Attach a photo',
      status: 'blocked',
      detail: 'Needs one captured request of attaching a photo to a task in Buildertrend (Copy as cURL).',
    });

    // W10 nothing else on the sandbox changed
    const afterWrites = takeSnapshot(jobId, await listTasks(t, jobId), tagNames);
    const diff = diffSnapshots(before, afterWrites);
    result.diffAfterWrites = diff;
    const createdIds = new Set(created.map((c) => c.externalId));
    const onlyOurs =
      diff.removed.length === 0 &&
      diff.changed.length === 0 &&
      diff.added.length === created.length &&
      diff.added.every((a) => createdIds.has(a.externalId));
    checks.push(
      onlyOurs
        ? pass('W10', 'Only the test room and item changed', `${diff.added.length} added, nothing else touched`)
        : fail('W10', 'Only the test room and item changed', `${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed`, diff),
    );
  } catch (e) {
    checks.push(fail('W!', 'Write sequence stopped', errorText(e)));
  } finally {
    // W11 clean up the test's own tasks, then confirm the sandbox is back to where it started
    if (options.cleanup !== false && created.length > 0) {
      try {
        await deleteSandboxTasks(t, guard, [...created].reverse());
        const afterCleanup = takeSnapshot(jobId, await listTasks(t, jobId), tagNames);
        const back = diffSnapshots(before, afterCleanup);
        result.diffAfterCleanup = back;
        checks.push(
          isEmptyDiff(back)
            ? pass('W11', 'Sandbox is back to where it started', `${created.length} test tasks removed`)
            : fail('W11', 'Sandbox is back to where it started', `${back.added.length} left over, ${back.changed.length} changed`, back),
        );
      } catch (e) {
        checks.push(fail('W11', 'Sandbox is back to where it started', errorText(e)));
      }
    }
    checks.push({
      id: 'W12',
      name: 'The test sub got no notification',
      status: 'manual',
      detail: 'Check the ZZ-Appliances inbox (or Buildertrend notification history) for anything sent during the test.',
    });
  }
  return result;
}

// ---------- custom field writes ----------

interface WantedField {
  key: TaskFieldKey;
  id: number;
  def: FieldDef | undefined;
  /** What the app means, for the read-back comparison. */
  expected: string | boolean;
  /** What goes on the wire: an option id for dropdowns, true or false, a date, or text. */
  wire: unknown;
}

function testFieldValues(defs: FieldDef[], readyBy: string): WantedField[] {
  const def = (key: TaskFieldKey) => defs.find((d) => d.id === TASK_FIELDS[key]);
  const out: WantedField[] = [];
  const add = (key: TaskFieldKey, appValue: string | boolean) => {
    const d = def(key);
    if (d && (d.dataType === 'DropDownList' || d.dataType === 'DropDownCheckList')) {
      const option = d.options.find((o) => o.text === appValue) ?? d.options[0];
      if (!option) return;
      out.push({ key, id: TASK_FIELDS[key], def: d, expected: option.text, wire: option.id });
    } else if (d && d.dataType === 'CheckBox') {
      out.push({ key, id: TASK_FIELDS[key], def: d, expected: appValue === true, wire: appValue === true });
    } else {
      out.push({ key, id: TASK_FIELDS[key], def: d, expected: appValue, wire: appValue });
    }
  };
  add('location', 'Whole House');
  add('ready', false);
  add('waitingOn', 'Ross Built');
  add('readyBy', readyBy);
  add('boughtOut', true);
  add('poOrCo', 'PO-TEST');
  return out;
}

interface ProbeAttempt {
  recipe: string;
  status: number | null;
  error?: string;
  persisted?: string[];
  missing?: string[];
}

async function writeFieldsByProbing(
  t: Transport,
  guard: WriteGuard,
  ref: TaskRef,
  wanted: WantedField[],
  defs: FieldDef[],
  samples: BtTask[],
): Promise<{ recipe: string | null; attempts: ProbeAttempt[] }> {
  guard.assert(ref.jobId, 'Write task fields');
  const defMap = new Map(defs.map((d) => [d.id, d]));
  const shaped = wanted.map((w) => shapeLikeSample(w, samples));
  const simple = wanted.map((w) => ({ customFieldId: w.id, value: w.wire }));
  const mapBody = Object.fromEntries(wanted.map((w) => [String(w.id), w.wire]));

  const recipes: Array<{ recipe: string; method: 'PATCH' | 'PUT'; path: string; body: unknown }> = [
    { recipe: 'PATCH /apix/v2/Tasks/{externalId} customFieldValues in the read shape', method: 'PATCH', path: `/apix/v2/Tasks/${ref.externalId}`, body: { customFieldValues: shaped } },
    { recipe: 'PATCH /apix/v2/Tasks/{externalId} customFieldValues [{customFieldId, value}]', method: 'PATCH', path: `/apix/v2/Tasks/${ref.externalId}`, body: { customFieldValues: simple } },
    { recipe: 'PATCH /apix/v2/CustomFields/15/{taskId}/values {fieldId: value}', method: 'PATCH', path: `/apix/v2/CustomFields/${TASKS_ASSOCIATED_TYPE}/${ref.taskId}/values`, body: mapBody },
    { recipe: 'PATCH /apix/v2/CustomFields/15/{externalId}/values {fieldId: value}', method: 'PATCH', path: `/apix/v2/CustomFields/${TASKS_ASSOCIATED_TYPE}/${ref.externalId}/values`, body: mapBody },
    { recipe: 'PATCH /apix/v2/CustomFields/15/{taskId}/values {values: [...]}', method: 'PATCH', path: `/apix/v2/CustomFields/${TASKS_ASSOCIATED_TYPE}/${ref.taskId}/values`, body: { values: simple } },
    { recipe: 'PATCH /apix/v2/CustomFields/15/{externalId}/values {values: [...]}', method: 'PATCH', path: `/apix/v2/CustomFields/${TASKS_ASSOCIATED_TYPE}/${ref.externalId}/values`, body: { values: simple } },
  ];

  const attempts: ProbeAttempt[] = [];
  for (const r of recipes) {
    const res = await t.request(r.method, r.path, r.body);
    const attempt: ProbeAttempt = { recipe: r.recipe, status: res.status };
    try {
      ensureOk(res, r.recipe);
    } catch (e) {
      attempt.error = errorText(e);
      attempts.push(attempt);
      continue;
    }
    const back = await readBack(t, ref);
    const persisted: string[] = [];
    const missing: string[] = [];
    for (const w of wanted) {
      const got = readFieldValue(fieldEntry(back, w.id), defMap.get(w.id)).value;
      if (got === w.expected) persisted.push(w.key);
      else missing.push(`${w.key} (got ${JSON.stringify(got)})`);
    }
    attempt.persisted = persisted;
    attempt.missing = missing;
    attempts.push(attempt);
    if (missing.length === 0) return { recipe: r.recipe, attempts };
  }
  return { recipe: null, attempts };
}

/** Copy the shape of a real Fish entry for this field and swap in the new value. */
function shapeLikeSample(w: WantedField, samples: BtTask[]): unknown {
  for (const task of samples) {
    const entry = fieldEntry(task, w.id);
    if (!entry) continue;
    const read = readFieldValue(entry, w.def);
    if (!read.valueKey) continue;
    const copy: Record<string, unknown> = { ...entry };
    const raw = read.raw;
    if (Array.isArray(raw)) copy[read.valueKey] = [w.wire];
    else if (isRecord(raw) && 'id' in raw) copy[read.valueKey] = { ...raw, id: w.wire };
    else copy[read.valueKey] = w.wire;
    return copy;
  }
  return { customFieldId: w.id, value: w.wire };
}

// ---------- helpers ----------

async function readBack(t: Transport, ref: TaskRef): Promise<BtTask> {
  try {
    return await getTask(t, ref.externalId);
  } catch {
    const list = await listTasks(t, ref.jobId);
    const found = list.tasks.find((x) => x.externalId === ref.externalId);
    if (!found) throw new BtError(`Read back ${ref.externalId}: not found on job ${ref.jobId}`);
    return found;
  }
}

function compareTaskReads(a: BtTask, b: BtTask, tagNames: Map<number, string>): string[] {
  const out: string[] = [];
  if (a.title !== b.title) out.push('title');
  if (a.status !== b.status) out.push('status');
  if ((a.ancestorId ?? null) !== (b.ancestorId ?? null)) out.push('room');
  const assignees = (x: BtTask) => readAssignees(x).map((v) => v.id).sort().join(',');
  if (assignees(a) !== assignees(b)) out.push('assignees');
  const tags = (x: BtTask) => readTags(x.tags, tagNames).map((v) => v.name).sort().join('|');
  if (tags(a) !== tags(b)) out.push('tags');
  for (const id of Object.values(TASK_FIELDS)) {
    if (canonical(fieldEntry(a, id) ?? null) !== canonical(fieldEntry(b, id) ?? null)) out.push(`field ${id}`);
  }
  return out;
}

function pickSample(list: CompletionList, size: number, random: () => number): SampleRow[] {
  const rows: Array<{ room: string; item: CompletionItem }> = list.rooms.flatMap((r) =>
    r.items.map((item) => ({ room: r.label, item })),
  );
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = rows[i];
    const b = rows[j];
    if (a && b) {
      rows[i] = b;
      rows[j] = a;
    }
  }
  const text = (v: string | boolean | null) => (v === null ? '' : v === true ? 'Yes' : v === false ? 'No' : v);
  return rows.slice(0, size).map(({ room, item }) => ({
    room,
    title: item.title,
    description: item.description,
    company: item.assignees.map((a) => a.name).join(', '),
    trade: item.trades.join(', '),
    ready: text(item.fields.ready),
    waitingOn: text(item.fields.waitingOn),
    readyBy: text(item.fields.readyBy),
    boughtOut: text(item.fields.boughtOut),
    poOrCo: text(item.fields.poOrCo),
    complete: item.complete,
    externalId: item.externalId,
  }));
}

function chooseTradeTag(tags: Array<{ id: number; name: string }>, preferred?: string): { id: number; name: string } | undefined {
  const usable = tags.filter((x) => x.name.toUpperCase() !== 'DELETE');
  return (preferred ? usable.find((x) => x.name === preferred) : undefined) ?? usable.find((x) => x.name === 'Plumbing') ?? usable[0];
}

function pick(task: BtTask, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, task[k]]));
}

function pass(id: string, name: string, detail: string, data?: unknown): Check {
  return { id, name, status: 'pass', detail, ...(data === undefined ? {} : { data }) };
}

function fail(id: string, name: string, detail: string, data?: unknown): Check {
  return { id, name, status: 'fail', detail, ...(data === undefined ? {} : { data }) };
}

export function errorText(e: unknown): string {
  if (e instanceof BtError) return e.message;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
