import { DELETE_TAG_NAME, TASK_FIELDS, TASK_STATUS, TASK_TYPE, type TaskFieldKey } from './config.js';
import { fieldEntry, readFieldValue, type FieldDef } from './customFields.js';
import { isRecord } from './envelope.js';
import { fromTipTap } from './tiptap.js';
import type { BtTask, TaskList } from './tasks.js';

// The locked Completion List standard (8 October 2026):
// group = the room or area (plan callout with its number), item = one piece of work for one company,
// one level deep, one trade tag per item, fields Ready / Waiting On / Ready By / Bought Out / PO or CO.

export interface TagInfo {
  id: number | null;
  name: string;
}

export interface Assignee {
  id: number;
  name: string;
  /** 1 internal user, 3 sub or vendor */
  loginType: number | null;
}

export interface CompletionItem {
  taskId: number;
  externalId: string;
  roomTaskId: number | null;
  title: string;
  description: string;
  assignees: Assignee[];
  tags: TagInfo[];
  /** Tags that are not DELETE: the trade, by the standard exactly one. */
  trades: string[];
  markedDelete: boolean;
  complete: boolean;
  fields: Record<TaskFieldKey, string | boolean | null>;
  hasAttachments: boolean;
}

export interface CompletionRoom {
  taskId: number;
  externalId: string;
  label: string;
  order: number;
  complete: boolean;
  items: CompletionItem[];
}

export interface CompletionList {
  jobId: number;
  rooms: CompletionRoom[];
  /** Punch list tasks whose parent is missing or is not a room group. */
  orphans: CompletionItem[];
  /** Tasks deeper than one level under a room. */
  nested: CompletionItem[];
  /** Tasks of type Task (Action Items and others): not part of the Completion List. */
  otherTaskCount: number;
  deletedCount: number;
}

export function tagIndex(data: unknown): Map<number, string> {
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.tags)
      ? data.tags
      : isRecord(data) && Array.isArray(data.data)
        ? data.data
        : [];
  const map = new Map<number, string>();
  for (const t of list) {
    if (!isRecord(t)) continue;
    const id = Number(t.id ?? t.tagId);
    const name = String(t.name ?? t.title ?? t.text ?? t.tagName ?? '');
    if (Number.isFinite(id) && name !== '') map.set(id, name);
  }
  return map;
}

/** Tags come back flat, as objects, or nested as a group with an options list. Walk every shape. */
export function readTags(raw: unknown, names: Map<number, string>): TagInfo[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.flatMap((t) => readTags(t, names));
  if (typeof raw === 'number') return [{ id: raw, name: names.get(raw) ?? `tag ${raw}` }];
  if (typeof raw === 'string') return [{ id: null, name: raw }];
  if (isRecord(raw)) {
    if (Array.isArray(raw.options)) {
      return raw.options.filter((o) => !isRecord(o) || o.selected !== false).flatMap((o) => readTags(o, names));
    }
    const idValue = raw.id ?? raw.tagId;
    const id = idValue === undefined || idValue === null ? null : Number(idValue);
    const name = String(raw.name ?? raw.title ?? raw.text ?? raw.tagName ?? (id !== null ? names.get(id) ?? '' : ''));
    return name === '' && id === null ? [] : [{ id, name: name || `tag ${id}` }];
  }
  return [];
}

export function readAssignees(task: BtTask): Assignee[] {
  return (Array.isArray(task.assignments) ? task.assignments : []).map((a) => ({
    id: Number(a.assignedToId),
    name: String(a.name ?? ''),
    loginType: typeof a.loginType === 'number' ? a.loginType : null,
  }));
}

export function toItem(task: BtTask, defs: Map<number, FieldDef>, tagNames: Map<number, string>): CompletionItem {
  const tags = readTags(task.tags, tagNames);
  const fields = Object.fromEntries(
    (Object.keys(TASK_FIELDS) as TaskFieldKey[]).map((key) => {
      const id = TASK_FIELDS[key];
      return [key, readFieldValue(fieldEntry(task, id), defs.get(id)).value];
    }),
  ) as Record<TaskFieldKey, string | boolean | null>;
  const plain = typeof task.descriptionPlainText === 'string' ? task.descriptionPlainText : '';
  return {
    taskId: task.taskId,
    externalId: task.externalId,
    roomTaskId: task.ancestorId ?? null,
    title: task.title,
    description: (plain || fromTipTap(task.description)).trim(),
    assignees: readAssignees(task),
    tags,
    trades: tags.filter((t) => t.name.toUpperCase() !== DELETE_TAG_NAME).map((t) => t.name),
    markedDelete: tags.some((t) => t.name.toUpperCase() === DELETE_TAG_NAME),
    complete: task.status === TASK_STATUS.completed,
    fields,
    hasAttachments: task.hasAttachments === true,
  };
}

export function normalizeCompletionList(
  jobId: number,
  list: TaskList,
  defs: FieldDef[],
  tagNames: Map<number, string>,
): CompletionList {
  const defMap = new Map(defs.map((d) => [d.id, d]));
  const live = list.tasks.filter((t) => t.isDeleted !== true);
  const punch = live.filter((t) => t.taskType === TASK_TYPE.punchList);
  const byId = new Map(punch.map((t) => [t.taskId, t]));

  const roomTasks = punch.filter((t) => t.ancestorId === null || t.ancestorId === undefined);
  const roomIds = new Set(roomTasks.map((t) => t.taskId));
  const rooms: CompletionRoom[] = roomTasks.map((t, order) => ({
    taskId: t.taskId,
    externalId: t.externalId,
    label: t.title,
    order,
    complete: t.status === TASK_STATUS.completed,
    items: [],
  }));
  const roomById = new Map(rooms.map((r) => [r.taskId, r]));

  const orphans: CompletionItem[] = [];
  const nested: CompletionItem[] = [];
  for (const task of punch) {
    if (roomIds.has(task.taskId)) continue;
    const item = toItem(task, defMap, tagNames);
    const parentId = task.ancestorId ?? null;
    const room = parentId === null ? undefined : roomById.get(parentId);
    if (room) room.items.push(item);
    else if (parentId !== null && byId.has(parentId)) nested.push(item);
    else orphans.push(item);
  }

  return {
    jobId,
    rooms,
    orphans,
    nested,
    otherTaskCount: live.length - punch.length,
    deletedCount: list.tasks.length - live.length,
  };
}

export interface ListStats {
  rooms: number;
  items: number;
  open: number;
  complete: number;
  perRoom: Array<{ room: string; items: number; open: number }>;
  noAssignee: number;
  manyAssignees: number;
  noTrade: number;
  manyTrades: number;
  markedDelete: number;
  notReadyWithoutWaitingOn: number;
  fieldCoverage: Record<TaskFieldKey, number>;
  assignees: Array<{ name: string; items: number }>;
  trades: Array<{ name: string; items: number }>;
}

export function listStats(list: CompletionList): ListStats {
  const items = list.rooms.flatMap((r) => r.items);
  const count = (pred: (i: CompletionItem) => boolean) => items.filter(pred).length;
  const tally = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, items: n }));
  };
  const coverage = Object.fromEntries(
    (Object.keys(TASK_FIELDS) as TaskFieldKey[]).map((k) => [k, count((i) => i.fields[k] !== null && i.fields[k] !== '')]),
  ) as Record<TaskFieldKey, number>;
  return {
    rooms: list.rooms.length,
    items: items.length,
    open: count((i) => !i.complete),
    complete: count((i) => i.complete),
    perRoom: list.rooms.map((r) => ({ room: r.label, items: r.items.length, open: r.items.filter((i) => !i.complete).length })),
    noAssignee: count((i) => i.assignees.length === 0),
    manyAssignees: count((i) => i.assignees.length > 1),
    noTrade: count((i) => i.trades.length === 0),
    manyTrades: count((i) => i.trades.length > 1),
    markedDelete: count((i) => i.markedDelete),
    notReadyWithoutWaitingOn: count((i) => !i.complete && i.fields.ready === false && !i.fields.waitingOn),
    fieldCoverage: coverage,
    assignees: tally(items.flatMap((i) => i.assignees.map((a) => a.name || `user ${a.id}`))),
    trades: tally(items.flatMap((i) => i.trades)),
  };
}
