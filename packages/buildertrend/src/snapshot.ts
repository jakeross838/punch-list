import { readAssignees, readTags } from './completion.js';
import { entryFieldId } from './customFields.js';
import { isRecord } from './envelope.js';
import { fromTipTap } from './tiptap.js';
import type { TaskList } from './tasks.js';

// Before and after pictures of a job's tasks. Any write is judged by the difference between them,
// never by the response to the write.

export interface SnapTask {
  externalId: string;
  taskId: number;
  title: string;
  ancestorId: number | null;
  taskType: number;
  status: number;
  description: string;
  assignees: number[];
  tags: string[];
  /** customFieldValues as canonical JSON, keyed by field id. */
  fields: Record<string, string>;
  hasAttachments: boolean;
}

export interface Snapshot {
  jobId: number;
  takenAt: string;
  tasks: Record<string, SnapTask>;
}

export function takeSnapshot(jobId: number, list: TaskList, tagNames: Map<number, string>): Snapshot {
  const tasks: Record<string, SnapTask> = {};
  for (const t of list.tasks) {
    if (t.isDeleted === true) continue;
    const fields: Record<string, string> = {};
    for (const entry of Array.isArray(t.customFieldValues) ? t.customFieldValues : []) {
      const id = entryFieldId(entry);
      if (id !== null) fields[String(id)] = canonical(entry);
    }
    tasks[t.externalId] = {
      externalId: t.externalId,
      taskId: t.taskId,
      title: t.title,
      ancestorId: t.ancestorId ?? null,
      taskType: t.taskType,
      status: t.status,
      description: (typeof t.descriptionPlainText === 'string' ? t.descriptionPlainText : fromTipTap(t.description)).trim(),
      assignees: readAssignees(t).map((a) => a.id).sort((a, b) => a - b),
      tags: readTags(t.tags, tagNames).map((x) => x.name).sort(),
      fields,
      hasAttachments: t.hasAttachments === true,
    };
  }
  return { jobId, takenAt: new Date().toISOString(), tasks };
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface SnapshotDiff {
  added: SnapTask[];
  removed: SnapTask[];
  changed: Array<{ externalId: string; title: string; changes: FieldChange[] }>;
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const added: SnapTask[] = [];
  const removed: SnapTask[] = [];
  const changed: SnapshotDiff['changed'] = [];
  for (const [id, a] of Object.entries(after.tasks)) {
    const b = before.tasks[id];
    if (!b) {
      added.push(a);
      continue;
    }
    const changes = compareTasks(b, a);
    if (changes.length > 0) changed.push({ externalId: id, title: a.title, changes });
  }
  for (const [id, b] of Object.entries(before.tasks)) {
    if (!after.tasks[id]) removed.push(b);
  }
  return { added, removed, changed };
}

export function isEmptyDiff(diff: SnapshotDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

function compareTasks(b: SnapTask, a: SnapTask): FieldChange[] {
  const changes: FieldChange[] = [];
  const simple = ['title', 'ancestorId', 'taskType', 'status', 'description', 'hasAttachments'] as const;
  for (const key of simple) {
    if (b[key] !== a[key]) changes.push({ field: key, before: b[key], after: a[key] });
  }
  if (b.assignees.join(',') !== a.assignees.join(',')) {
    changes.push({ field: 'assignees', before: b.assignees, after: a.assignees });
  }
  if (b.tags.join('|') !== a.tags.join('|')) changes.push({ field: 'tags', before: b.tags, after: a.tags });
  const ids = new Set([...Object.keys(b.fields), ...Object.keys(a.fields)]);
  for (const id of ids) {
    if (b.fields[id] !== a.fields[id]) {
      changes.push({ field: `customField ${id}`, before: b.fields[id] ?? null, after: a.fields[id] ?? null });
    }
  }
  return changes;
}

/** Stable JSON with sorted keys, so the same value always prints the same way. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}
