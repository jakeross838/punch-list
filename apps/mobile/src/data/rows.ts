// Database rows (snake_case, booleans as 0 or 1 on the phone) to and from the app's records.

import type { Company, Item, ItemFields, Job, JobCompany, Location, Person, Trade } from '@punch/core';
import type { ItemPatch } from './api';

type Row = Record<string, unknown>;

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const textOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export const rowToPerson = (r: Row): Person => ({ id: text(r.id), email: text(r.email), name: text(r.name), active: bool(r.active) });

export const rowToJob = (r: Row): Job => ({ id: text(r.id), name: text(r.name), address: text(r.address) });

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

export const rowToJobCompany = (r: Row): JobCompany => ({ jobId: text(r.job_id), companyId: text(r.company_id), tradeId: text(r.trade_id) });

export const rowToItem = (r: Row): Item => ({
  id: text(r.id),
  jobId: text(r.job_id),
  locationId: text(r.location_id),
  number: numOrNull(r.number),
  title: text(r.title),
  description: text(r.description),
  tradeId: textOrNull(r.trade_id),
  companyId: textOrNull(r.company_id),
  kind: r.kind === 'added_scope' ? 'added_scope' : 'deficiency',
  ready: bool(r.ready),
  waitingOn: textOrNull(r.waiting_on),
  readyBy: textOrNull(r.ready_by),
  boughtOut: bool(r.bought_out),
  poOrCo: textOrNull(r.po_or_co),
  status: r.status === 'complete' || r.status === 'removed' ? r.status : 'open',
  completedBy: textOrNull(r.completed_by),
  completedAt: textOrNull(r.completed_at),
  source: r.source === 'walk' || r.source === 'import' ? r.source : 'typed',
  btExternalId: textOrNull(r.bt_external_id),
  createdBy: text(r.created_by),
  createdAt: text(r.created_at),
  updatedAt: text(r.updated_at),
});

const ITEM_COLUMNS: Record<keyof ItemPatch, string> = {
  locationId: 'location_id',
  title: 'title',
  description: 'description',
  tradeId: 'trade_id',
  companyId: 'company_id',
  kind: 'kind',
  ready: 'ready',
  waitingOn: 'waiting_on',
  readyBy: 'ready_by',
  boughtOut: 'bought_out',
  poOrCo: 'po_or_co',
  status: 'status',
  completedBy: 'completed_by',
  completedAt: 'completed_at',
};

/** An item patch as column and value pairs for the phone database (booleans as 0 or 1). */
export function itemPatchColumns(patch: ItemPatch): Array<[string, unknown]> {
  return (Object.keys(patch) as Array<keyof ItemPatch>)
    .filter((k) => k in ITEM_COLUMNS && patch[k] !== undefined)
    .map((k) => {
      const v = patch[k];
      return [ITEM_COLUMNS[k], typeof v === 'boolean' ? (v ? 1 : 0) : v];
    });
}

export function itemFieldsColumns(fields: ItemFields): Array<[string, unknown]> {
  return itemPatchColumns(fields);
}

/** Columns the server keeps as booleans; uploads send them as true or false, not 0 or 1. */
export const BOOLEAN_COLUMNS: Record<string, string[]> = {
  people: ['active'],
  jobs: ['archived'],
  locations: ['active'],
  trades: ['active'],
  companies: ['active'],
  items: ['ready', 'bought_out'],
  title_library: ['approved'],
};

export function toServerRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const col of BOOLEAN_COLUMNS[table] ?? []) {
    if (col in out && out[col] !== null && out[col] !== undefined) out[col] = bool(out[col]);
  }
  return out;
}
