// An in-memory stand-in for the Buildertrend task routes the Phase 0 checks use. It behaves the way
// the verified recipes say the real one does: GUID-keyed routes, a 400 for a numeric id on the status
// route, nested option groups for tags, and HTTP 200 with success true on a no-op.

import type { BtResponse, BtTask, Method, Transport } from '../src/index.js';

export const FIELD_DEFS = [
  {
    customFieldId: 553258,
    label: 'Location',
    dataType: 'DropDownList',
    isRequired: true,
    options: [
      { id: 9001, text: 'Kitchen 109', sortOrder: 1 },
      { id: 9002, text: 'Master Bathroom 207', sortOrder: 2 },
      { id: 9003, text: 'Whole House', sortOrder: 3 },
    ],
  },
  { customFieldId: 553297, label: 'Ready', dataType: 'CheckBox', isRequired: false, options: [] },
  { customFieldId: 553668, label: 'Waiting On', dataType: 'Text', isRequired: false, options: [] },
  { customFieldId: 554342, label: 'Ready By', dataType: 'Date', isRequired: false, options: [] },
  { customFieldId: 554343, label: 'Bought Out', dataType: 'CheckBox', isRequired: false, options: [] },
  { customFieldId: 554344, label: 'PO / CO', dataType: 'Text', isRequired: false, options: [] },
];

export const TAGS = [
  { id: 1, name: 'Plumbing' },
  { id: 2, name: 'Painting' },
  { id: 3, name: 'DELETE' },
];

type FieldEntry = { customFieldId: number; value: unknown };

export class FakeBuildertrend implements Transport {
  tasks: BtTask[];
  calls: string[] = [];
  private next = 50_000_000;
  /** Set to make the simple PATCH shape a silent no-op, so the probe has to move on. */
  ignoreTaskPatchFields = false;

  constructor(seed: BtTask[] = []) {
    this.tasks = seed.map((t) => structuredClone(t));
  }

  async request(method: Method, path: string, body?: unknown): Promise<BtResponse> {
    this.calls.push(`${method} ${path}`);
    const b = (body ?? {}) as Record<string, unknown>;

    if (method === 'GET' && path === '/api/jobpicker/GetExistingJobList') return ok({ success: true, jobs: [{}, {}, {}] });
    if (method === 'GET' && path === '/apix/v2/CustomFields/15/definitions') return ok(FIELD_DEFS);
    if (method === 'GET' && path === '/apix/v2/Tasks/tags') return ok(TAGS);
    if (method === 'POST' && path === '/apix/v2/Tasks/list') {
      const ids = (b.jobIds as number[]) ?? [];
      return ok({ tasks: this.tasks.filter((t) => ids.includes(t.jobId)), dependencies: [], jobs: [], taskComments: {} });
    }
    if (method === 'POST' && path === '/apix/v2/Tasks') {
      const taskId = this.next++;
      const externalId = `guid-${taskId}`;
      this.tasks.push({
        taskId,
        externalId,
        jobId: Number(b.jobId),
        ancestorId: (b.ancestorId as number | null) ?? null,
        title: String(b.title),
        taskType: Number(b.taskType ?? 0),
        status: Number(b.status ?? 0),
        description: b.description ?? null,
        descriptionPlainText: (b.descriptionPlainText as string) ?? '',
        assignments: [],
        tags: [],
        customFieldValues: [],
        hasAttachments: false,
      });
      return ok({ taskId, externalId });
    }
    if (method === 'POST' && path === '/apix/v2/Tasks/bulk-delete') {
      const ids = new Set((b.externalIds as string[]) ?? []);
      this.tasks = this.tasks.filter((t) => !ids.has(t.externalId));
      return ok({ success: true });
    }

    let m = path.match(/^\/apix\/v2\/Tasks\/status\/(.+)$/);
    if (m && method === 'PUT') {
      const task = this.byGuid(m[1]!);
      if (!task) return { status: 400, data: { message: 'Bad id' }, text: 'Bad id' };
      task.status = Number(b.status);
      return ok({ success: true });
    }
    m = path.match(/^\/apix\/v2\/Tasks\/([^/]+)\/assignments$/);
    if (m && method === 'PATCH') {
      const task = this.byGuid(m[1]!);
      if (!task) return notFound();
      task.assignments = ((b.assignedToIds as number[]) ?? []).map((id) => ({ assignedToId: id, name: `Sub ${id}`, loginType: 3 }));
      return ok({ success: true });
    }
    m = path.match(/^\/apix\/v2\/Tasks\/([^/]+)\/tags$/);
    if (m && method === 'PUT') {
      const task = this.byGuid(m[1]!);
      if (!task) return notFound();
      // Tags read back nested, as a group with an options list.
      task.tags = [{ options: ((b.tagIds as number[]) ?? []).map((id) => ({ id, name: TAGS.find((x) => x.id === id)?.name })) }];
      return ok({ success: true });
    }
    m = path.match(/^\/apix\/v2\/Tasks\/([^/]+)$/);
    if (m && (method === 'GET' || method === 'PATCH')) {
      const task = this.byGuid(m[1]!);
      if (!task) return notFound();
      if (method === 'GET') return ok(structuredClone(task));
      for (const [k, v] of Object.entries(b)) {
        if (k === 'customFieldValues') {
          if (this.ignoreTaskPatchFields) continue;
          const incoming = v as FieldEntry[];
          const current = (task.customFieldValues ?? []) as FieldEntry[];
          for (const entry of incoming) {
            const i = current.findIndex((c) => c.customFieldId === entry.customFieldId);
            if (i >= 0) current[i] = { customFieldId: entry.customFieldId, value: entry.value };
            else current.push({ customFieldId: entry.customFieldId, value: entry.value });
          }
          task.customFieldValues = current;
        } else {
          task[k] = v;
        }
      }
      return ok({ success: true });
    }
    if (path.startsWith('/apix/v2/CustomFields/15/') && method === 'PATCH') {
      return { status: 500, data: { message: 'An error has occurred.' }, text: 'An error has occurred.' };
    }
    return notFound();
  }

  private byGuid(id: string): BtTask | undefined {
    return this.tasks.find((t) => t.externalId === id);
  }
}

function ok(data: unknown): BtResponse {
  return { status: 200, data, text: JSON.stringify(data) };
}

function notFound(): BtResponse {
  return { status: 404, data: { message: 'Not found' }, text: 'Not found' };
}

/** A small Fish-like list: two rooms, items in every tag shape, an Action Item, an orphan, a nested child. */
export function fishFixture(jobId: number): BtTask[] {
  const base = { jobId, taskType: 1, status: 0, hasAttachments: false, description: null };
  return [
    { ...base, taskId: 1, externalId: 'room-1', ancestorId: null, title: 'Kitchen 109' },
    { ...base, taskId: 2, externalId: 'room-2', ancestorId: null, title: 'Master Bathroom 207' },
    {
      ...base,
      taskId: 11,
      externalId: 'item-11',
      ancestorId: 1,
      title: 'Install toilet',
      descriptionPlainText: 'Toilet room, left of the vanity.',
      assignments: [{ assignedToId: 501, name: 'Gator Plumbing', loginType: 3 }],
      tags: [{ id: 1, name: 'Plumbing' }],
      customFieldValues: [
        { customFieldId: 553258, value: 9001 },
        { customFieldId: 553297, value: false },
        { customFieldId: 553668, value: 'Volcano Stone' },
        { customFieldId: 554342, value: '2026-11-02T00:00:00' },
        { customFieldId: 554343, value: true },
        { customFieldId: 554344, value: 'PO-0090' },
      ],
    },
    {
      ...base,
      taskId: 12,
      externalId: 'item-12',
      ancestorId: 1,
      title: 'Touch up paint',
      status: 1,
      assignments: [{ assignedToId: 502, name: 'Triple H Painting', loginType: 3 }],
      tags: [{ options: [{ id: 2, name: 'Painting' }] }],
      customFieldValues: [{ customFieldId: 553297, value: true }],
    },
    {
      ...base,
      taskId: 21,
      externalId: 'item-21',
      ancestorId: 2,
      title: 'Hang pocket door',
      assignments: [],
      tags: [2, 3],
      customFieldValues: [{ customFieldId: 553297, value: false }],
    },
    { ...base, taskId: 31, externalId: 'nested-31', ancestorId: 21, title: 'Adjust latch' },
    { ...base, taskId: 41, externalId: 'orphan-41', ancestorId: 999, title: 'Clean windows' },
    { ...base, taskId: 51, externalId: 'action-51', ancestorId: null, title: 'Get CO-2 signed', taskType: 0 },
    { ...base, taskId: 61, externalId: 'deleted-61', ancestorId: 1, title: 'Old item', isDeleted: true },
  ];
}
