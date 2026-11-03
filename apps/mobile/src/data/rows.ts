// Database rows (snake_case, booleans as 0 or 1 on the phone) to and from the app's records.

import {
  isTemplatePlace,
  tidyHours,
  tidyRooms,
  type Activity,
  type ActivityDetail,
  type ActivityKind,
  type Comment,
  type Company,
  type CompanyLink,
  type Contact,
  type CustomField,
  type Item,
  type ItemFields,
  type Job,
  type JobCompany,
  type ListSend,
  type Location,
  type Mark,
  type Person,
  type Photo,
  type ScheduleSnapshot,
  type StandardTitle,
  type TeamMember,
  type TeamPart,
  type Template,
  type TemplateItem,
  type Trade,
  type Visit,
} from '@punch/core';
import type { ItemPatch } from './api';

type Row = Record<string, unknown>;

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const textOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
/** Waiting On arrives as a JSON list on the phone; a plain word from before it was a list still reads. */
function waitingList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim().startsWith('[')) return json<string[]>(v, []);
  return typeof v === 'string' && v.trim() !== '' ? [v.trim()] : [];
}

/** JSON columns arrive as text on the phone and as values from the server. */
function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export const rowToPerson = (r: Row): Person => ({
  id: text(r.id),
  email: text(r.email),
  name: text(r.name),
  active: bool(r.active),
  role: r.role === 'admin' ? 'admin' : 'team',
  sees: r.sees === 'assigned' ? 'assigned' : 'all',
  phone: textOrNull(r.phone),
});

/** A job put away is archived in the database and closed in the app. */
export const rowToJob = (r: Row): Job => ({ id: text(r.id), name: text(r.name), address: text(r.address), closed: bool(r.archived) });

const PARTS: TeamPart[] = ['project_manager', 'superintendent', 'field'];

export const rowToTemplate = (r: Row): Template => ({ id: text(r.id), name: text(r.name), active: bool(r.active), sortOrder: num(r.sort_order) });

export const rowToTemplateItem = (r: Row): TemplateItem => ({
  id: text(r.id),
  templateId: text(r.template_id),
  title: text(r.title),
  description: text(r.description),
  kind: r.kind === 'added_scope' || r.kind === 'deficiency' ? r.kind : 'completion',
  tradeId: textOrNull(r.trade_id),
  hours: tidyHours(r.hours),
  place: isTemplatePlace(r.place) ? r.place : 'Whole House',
  waitsOn: waitingList(r.waits_on),
  sortOrder: num(r.sort_order),
  active: bool(r.active),
});

export const rowToTeamMember = (r: Row): TeamMember => ({
  id: text(r.id),
  jobId: text(r.job_id),
  personId: text(r.person_id),
  part: PARTS.includes(r.part as TeamPart) ? (r.part as TeamPart) : 'field',
});

export const rowToLocation = (r: Row): Location => ({
  id: text(r.id),
  jobId: text(r.job_id),
  name: text(r.name),
  number: textOrNull(r.number),
  label: text(r.label),
  floor: textOrNull(r.floor),
  kind: r.kind === 'shared' ? 'shared' : 'room',
  sortOrder: num(r.sort_order),
  active: bool(r.active),
  walkedAt: textOrNull(r.walked_at),
});

export const rowToTrade = (r: Row): Trade => ({ id: text(r.id), name: text(r.name), sortOrder: num(r.sort_order) });

export const rowToCompany = (r: Row): Company => ({
  id: text(r.id),
  name: text(r.name),
  defaultTradeId: textOrNull(r.default_trade_id),
  phone: textOrNull(r.phone),
  email: textOrNull(r.email),
  active: bool(r.active),
});

export const rowToContact = (r: Row): Contact => ({
  id: text(r.id),
  companyId: text(r.company_id),
  name: text(r.name),
  email: textOrNull(r.email),
  phone: textOrNull(r.phone),
  getsLists: bool(r.gets_lists),
  sortOrder: num(r.sort_order),
  active: bool(r.active),
});

/** A company link: the phone keeps its token as the row's id. */
export const rowToCompanyLink = (r: Row): CompanyLink => ({
  token: text(r.id ?? r.token),
  jobId: text(r.job_id),
  companyId: text(r.company_id),
  createdAt: text(r.created_at),
  revoked: bool(r.revoked),
});

export const rowToJobCompany = (r: Row): JobCompany => ({ id: text(r.id), jobId: text(r.job_id), companyId: text(r.company_id), tradeId: text(r.trade_id) });

export const rowToItem = (r: Row): Item => ({
  id: text(r.id),
  jobId: text(r.job_id),
  locationId: text(r.location_id),
  number: numOrNull(r.number),
  assignedTo: textOrNull(r.assigned_to),
  title: text(r.title),
  description: text(r.description),
  tradeId: textOrNull(r.trade_id),
  companyId: textOrNull(r.company_id),
  kind: r.kind === 'added_scope' || r.kind === 'completion' ? r.kind : 'deficiency',
  ready: bool(r.ready),
  waitingOn: waitingList(r.waiting_on),
  waitingOnItems: waitingList(r.waiting_on_items),
  readyBy: textOrNull(r.ready_by),
  boughtOut: bool(r.bought_out),
  poOrCo: textOrNull(r.po_or_co),
  status: r.status === 'complete' || r.status === 'removed' ? r.status : 'open',
  completedBy: textOrNull(r.completed_by),
  completedAt: textOrNull(r.completed_at),
  source: r.source === 'walk' || r.source === 'import' || r.source === 'copy' || r.source === 'template' ? r.source : 'typed',
  position: numOrNull(r.position),
  extra: json<Item['extra']>(r.extra, {}),
  unfinished: bool(r.unfinished),
  visitId: textOrNull(r.visit_id),
  hours: tidyHours(r.hours),
  btExternalId: textOrNull(r.bt_external_id),
  createdBy: text(r.created_by),
  createdAt: text(r.created_at),
  updatedAt: text(r.updated_at),
});

const ITEM_COLUMNS: Record<keyof ItemPatch, string> = {
  locationId: 'location_id',
  position: 'position',
  assignedTo: 'assigned_to',
  title: 'title',
  description: 'description',
  tradeId: 'trade_id',
  companyId: 'company_id',
  kind: 'kind',
  ready: 'ready',
  waitingOn: 'waiting_on',
  waitingOnItems: 'waiting_on_items',
  readyBy: 'ready_by',
  boughtOut: 'bought_out',
  poOrCo: 'po_or_co',
  status: 'status',
  completedBy: 'completed_by',
  completedAt: 'completed_at',
  extra: 'extra',
  unfinished: 'unfinished',
  visitId: 'visit_id',
  hours: 'hours',
};

/** An item patch as column and value pairs for the phone database (booleans as 0 or 1). */
export function itemPatchColumns(patch: ItemPatch): [string, unknown][] {
  return (Object.keys(patch) as (keyof ItemPatch)[])
    .filter((k) => k in ITEM_COLUMNS && patch[k] !== undefined)
    .map((k) => {
      // No location yet is empty in the app and null in the database.
      const v = k === 'locationId' && patch[k] === '' ? null : patch[k];
      return [ITEM_COLUMNS[k], typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' && v !== null ? JSON.stringify(v) : v];
    });
}

export const rowToPhoto = (r: Row, uri: string): Photo => ({
  id: text(r.id),
  jobId: text(r.job_id),
  itemId: text(r.item_id),
  uri,
  storagePath: textOrNull(r.storage_path),
  width: num(r.width),
  height: num(r.height),
  marks: json<Mark[]>(r.marks, []),
  sortOrder: num(r.sort_order),
  removed: bool(r.removed),
  createdBy: text(r.created_by),
  createdAt: text(r.created_at),
});

export const rowToStandardTitle = (r: Row): StandardTitle => ({
  id: text(r.id),
  title: text(r.title),
  tradeId: textOrNull(r.trade_id),
  uses: num(r.uses),
  approved: bool(r.approved),
  hours: tidyHours(r.hours),
  rooms: tidyRooms(json<unknown>(r.rooms, [])),
});

export const rowToCustomField = (r: Row): CustomField => ({
  id: text(r.id),
  label: text(r.label),
  kind: r.kind === 'list' || r.kind === 'yes_no' || r.kind === 'date' ? r.kind : 'text',
  options: json<string[]>(r.options, []),
  sortOrder: num(r.sort_order),
  active: bool(r.active),
});

export const rowToVisit = (r: Row): Visit => ({
  id: text(r.id),
  jobId: text(r.job_id),
  companyId: text(r.company_id),
  start: text(r.start_date).slice(0, 10),
  days: Math.max(1, num(r.days)),
  confirmed: bool(r.confirmed),
  note: text(r.note),
  removed: bool(r.removed),
  askedStart: textOrNull(r.asked_start)?.slice(0, 10) ?? null,
  askedDays: numOrNull(r.asked_days),
  askedName: textOrNull(r.asked_name),
  askedAt: textOrNull(r.asked_at),
  createdBy: text(r.created_by),
  createdAt: text(r.created_at),
  updatedAt: text(r.updated_at),
});

/** A row of item_history: an item added, or one of its fields changed. */
export const rowToItemHistory = (r: Row): Activity => ({
  id: text(r.id),
  jobId: text(r.job_id),
  itemId: textOrNull(r.item_id),
  personId: textOrNull(r.person_id),
  at: text(r.at),
  kind: r.field === 'created' ? 'item_created' : 'item_changed',
  field: text(r.field),
  before: textOrNull(r.before),
  after: textOrNull(r.after),
  imported: r.source === 'import',
});

/** A row of job_activity: a photo, a visit, a list sent or a change to the job's setup. */
export const rowToJobActivity = (r: Row): Activity => ({
  id: text(r.id),
  jobId: text(r.job_id),
  itemId: textOrNull(r.item_id),
  personId: textOrNull(r.person_id),
  at: text(r.at),
  kind: text(r.kind) as ActivityKind,
  detail: json<ActivityDetail>(r.detail, {}),
});

export const rowToComment = (r: Row): Comment => ({
  id: text(r.id),
  jobId: text(r.job_id),
  itemId: textOrNull(r.item_id),
  companyId: textOrNull(r.company_id),
  body: text(r.body),
  personId: textOrNull(r.person_id),
  fromCompany: bool(r.from_company),
  authorName: textOrNull(r.author_name),
  internal: bool(r.internal),
  removed: bool(r.removed),
  createdAt: text(r.created_at),
});

export const rowToListSend = (r: Row): ListSend => ({
  id: text(r.id),
  jobId: text(r.job_id),
  list: text(r.list),
  itemIds: waitingList(r.item_ids),
  sentAt: text(r.sent_at),
  sentBy: text(r.sent_by),
  removed: bool(r.removed),
  snapshot: snapshotOf(r.snapshot),
});

/** The schedule a send kept, when it has one that reads. */
function snapshotOf(v: unknown): ScheduleSnapshot | null {
  const s = json<unknown>(v, null);
  if (!s || typeof s !== 'object' || !Array.isArray((s as ScheduleSnapshot).bars)) return null;
  const { finish, bars } = s as ScheduleSnapshot;
  return {
    finish: typeof finish === 'string' ? finish : null,
    bars: bars
      .filter((b) => b && typeof b.companyId === 'string' && typeof b.start === 'string' && typeof b.end === 'string')
      .map((b) => ({ key: String(b.key ?? ''), companyId: b.companyId, start: b.start, end: b.end, confirmed: b.confirmed === true })),
  };
}

export function itemFieldsColumns(fields: ItemFields): [string, unknown][] {
  return itemPatchColumns(fields);
}

/** Columns the server keeps as booleans; uploads send them as true or false, not 0 or 1. */
export const BOOLEAN_COLUMNS: Record<string, string[]> = {
  people: ['active'],
  jobs: ['archived'],
  locations: ['active'],
  trades: ['active'],
  companies: ['active'],
  company_contacts: ['gets_lists', 'active'],
  items: ['ready', 'bought_out', 'unfinished'],
  title_library: ['approved'],
  custom_fields: ['active'],
  photos: ['removed'],
  visits: ['confirmed', 'removed'],
  list_sends: ['removed'],
  comments: ['from_company', 'internal', 'removed'],
  company_links: ['revoked'],
  templates: ['active'],
  template_items: ['active'],
};

/** Columns the server keeps as JSON; the phone stores them as text. */
export const JSON_COLUMNS: Record<string, string[]> = {
  items: ['extra', 'waiting_on', 'waiting_on_items'],
  list_sends: ['item_ids', 'snapshot'],
  custom_fields: ['options'],
  title_library: ['rooms'],
  template_items: ['waits_on'],
  photos: ['marks'],
  person_settings: ['item_form', 'job_view'],
};

/**
 * The column a table's rows are found by on the server, where it is not id: a company link is its
 * token, and a person's settings are theirs by person.
 */
export const KEY_COLUMNS: Record<string, string> = { company_links: 'token', person_settings: 'person_id' };

export function toServerRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const col of BOOLEAN_COLUMNS[table] ?? []) {
    if (col in out && out[col] !== null && out[col] !== undefined) out[col] = bool(out[col]);
  }
  for (const col of JSON_COLUMNS[table] ?? []) {
    if (typeof out[col] === 'string') out[col] = json<unknown>(out[col], null);
  }
  return out;
}
