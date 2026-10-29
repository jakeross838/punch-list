import { JOBS, TASK_STATUS, TASKS_ASSOCIATED_TYPE } from './config.js';
import { BtError, ensureOk, isRecord } from './envelope.js';
import type { TipTapDoc } from './tiptap.js';
import type { Transport } from './transport.js';

// Verified recipes (Buildertrend skill, verified-operations.md). Every task route keys off the
// externalId GUID, not the numeric taskId: a taskId on the status route returns 400.

export interface BtAssignment {
  taskId?: number;
  assignedToId: number;
  name?: string;
  /** 1 internal user, 3 sub or vendor */
  loginType?: number;
  [key: string]: unknown;
}

export interface BtTask {
  taskId: number;
  externalId: string;
  jobId: number;
  ancestorId: number | null;
  title: string;
  description?: unknown;
  descriptionPlainText?: string | null;
  taskType: number;
  status: number;
  assignments?: BtAssignment[];
  tags?: unknown[];
  customFieldValues?: unknown[];
  hasAttachments?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export interface TaskList {
  tasks: BtTask[];
  dependencies?: unknown[];
  jobs?: unknown[];
  taskComments?: Record<string, unknown>;
}

export interface TaskRef {
  taskId: number;
  externalId: string;
  jobId: number;
}

/** Refuses any write to a job that is not on the allowed list. There is no default job. */
export class WriteGuard {
  private constructor(
    private readonly allowed: ReadonlySet<number>,
    readonly label: string,
  ) {}

  static sandboxOnly(): WriteGuard {
    return new WriteGuard(new Set([JOBS.sandbox]), 'Phase 0 writes to the sandbox job only');
  }

  static forJobs(jobIds: number[], label: string): WriteGuard {
    return new WriteGuard(new Set(jobIds), label);
  }

  assert(jobId: number, what: string): void {
    if (!this.allowed.has(jobId)) {
      throw new BtError(`${what}: refused, job ${jobId} is not allowed (${this.label})`);
    }
  }
}

export async function checkSession(t: Transport): Promise<{ jobCount: number }> {
  const res = await t.request('GET', '/api/jobpicker/GetExistingJobList');
  ensureOk(res, 'Session check');
  const jobs = findArray(res.data, 'jobs');
  return { jobCount: jobs?.length ?? 0 };
}

export async function listTasks(t: Transport, jobId: number): Promise<TaskList> {
  const res = await t.request('POST', '/apix/v2/Tasks/list', { jobIds: [jobId] });
  ensureOk(res, `List tasks for job ${jobId}`);
  const data = res.data;
  if (!isRecord(data) || !Array.isArray(data.tasks)) {
    throw new BtError(`List tasks for job ${jobId}: no tasks array in the response`, res);
  }
  const list = data as unknown as TaskList;
  return { ...list, tasks: list.tasks.filter((task) => task.jobId === undefined || task.jobId === jobId) };
}

export async function getTask(t: Transport, externalId: string): Promise<BtTask> {
  const res = await t.request('GET', `/apix/v2/Tasks/${externalId}`);
  ensureOk(res, `Read task ${externalId}`);
  const data = isRecord(res.data) && isRecord(res.data.task) ? res.data.task : res.data;
  if (!isRecord(data)) throw new BtError(`Read task ${externalId}: unexpected response`, res);
  return data as unknown as BtTask;
}

export async function taskTags(t: Transport): Promise<unknown> {
  const res = await t.request('GET', '/apix/v2/Tasks/tags');
  ensureOk(res, 'Read task tags');
  return res.data;
}

export async function taskFieldDefinitions(t: Transport): Promise<unknown> {
  const res = await t.request('GET', `/apix/v2/CustomFields/${TASKS_ASSOCIATED_TYPE}/definitions`);
  ensureOk(res, 'Read task custom field definitions');
  return res.data;
}

export async function taskAttachments(t: Transport, externalId: string): Promise<unknown> {
  const res = await t.request('GET', `/apix/v2/Tasks/${externalId}/attachments`);
  ensureOk(res, `Read attachments for task ${externalId}`);
  return res.data;
}

export interface NewTask {
  jobId: number;
  title: string;
  taskType: number;
  ancestorId?: number | null;
  description?: TipTapDoc | null;
  descriptionPlainText?: string;
  startDate?: string | null;
  endDate?: string | null;
  [key: string]: unknown;
}

export async function createTask(t: Transport, guard: WriteGuard, task: NewTask): Promise<TaskRef> {
  guard.assert(task.jobId, `Create task "${task.title}"`);
  const body = { status: TASK_STATUS.notStarted, ...task };
  const res = await t.request('POST', '/apix/v2/Tasks', body);
  ensureOk(res, `Create task "${task.title}"`);
  const data = isRecord(res.data) && isRecord(res.data.data) ? res.data.data : res.data;
  const taskId = isRecord(data) ? Number(data.taskId) : NaN;
  const externalId = isRecord(data) ? String(data.externalId ?? '') : '';
  if (!Number.isFinite(taskId) || taskId <= 0 || externalId === '') {
    throw new BtError(`Create task "${task.title}": no taskId and externalId came back`, res);
  }
  return { taskId, externalId, jobId: task.jobId };
}

export async function patchTask(
  t: Transport,
  guard: WriteGuard,
  ref: TaskRef,
  patch: Record<string, unknown>,
): Promise<void> {
  guard.assert(ref.jobId, `Update task ${ref.externalId}`);
  const res = await t.request('PATCH', `/apix/v2/Tasks/${ref.externalId}`, patch);
  ensureOk(res, `Update task ${ref.externalId}`);
}

export async function setAssignees(t: Transport, guard: WriteGuard, ref: TaskRef, ids: number[]): Promise<void> {
  guard.assert(ref.jobId, `Assign task ${ref.externalId}`);
  const res = await t.request('PATCH', `/apix/v2/Tasks/${ref.externalId}/assignments`, { assignedToIds: ids });
  ensureOk(res, `Assign task ${ref.externalId}`);
}

export async function setTags(t: Transport, guard: WriteGuard, ref: TaskRef, tagIds: number[]): Promise<void> {
  guard.assert(ref.jobId, `Tag task ${ref.externalId}`);
  const res = await t.request('PUT', `/apix/v2/Tasks/${ref.externalId}/tags`, { tagIds });
  ensureOk(res, `Tag task ${ref.externalId}`);
}

export async function setStatus(t: Transport, guard: WriteGuard, ref: TaskRef, status: number): Promise<void> {
  guard.assert(ref.jobId, `Set status on task ${ref.externalId}`);
  const res = await t.request('PUT', `/apix/v2/Tasks/status/${ref.externalId}`, { status });
  ensureOk(res, `Set status on task ${ref.externalId}`);
}

/** Only for cleaning up the test's own artifacts on the sandbox. The app never deletes. */
export async function deleteSandboxTasks(t: Transport, guard: WriteGuard, refs: TaskRef[]): Promise<void> {
  for (const ref of refs) guard.assert(ref.jobId, `Delete task ${ref.externalId}`);
  if (refs.length === 0) return;
  const res = await t.request('POST', '/apix/v2/Tasks/bulk-delete', {
    externalIds: refs.map((r) => r.externalId),
  });
  ensureOk(res, 'Delete sandbox test tasks');
}

function findArray(data: unknown, key: string): unknown[] | null {
  if (!isRecord(data)) return null;
  if (Array.isArray(data[key])) return data[key] as unknown[];
  if (isRecord(data.data) && Array.isArray(data.data[key])) return data.data[key] as unknown[];
  return null;
}
