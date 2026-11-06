// What a change to the app's state writes in the phone's database. Each list in the state is a
// table: a record that is new is inserted, one that changed updates only the columns that changed,
// and one taken out of the list is deleted only where that is how the change is made (a company
// off a job, someone off a team, a holdup off the job's list). Elsewhere nothing is ever deleted.
// PowerSync then sends each write up, in order, through the database's access rules.
//
// Left to the database: the item numbers, who made or completed something, whoever an item is
// assigned to joining the team, how often each standard title is used, and the log.

import type {
  Comment,
  Company,
  CompanyLink,
  Contact,
  CustomField,
  Item,
  Job,
  JobCompany,
  ListSend,
  Location,
  Person,
  Photo,
  PlanSheet,
  StandardTitle,
  TeamMember,
  Template,
  TemplateItem,
  Trade,
  Visit,
} from '@punch/core';
import type { State } from '../engine';
import { itemPatchColumns } from '../rows';

export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete';
  id: string;
  /** Column values as the phone's database keeps them: true and false as 1 and 0, lists and objects as JSON. */
  values: Record<string, unknown>;
}

/** A holdup on a job's Not Ready list, as its row. */
export interface HoldupRow {
  id: string;
  label: string;
  sortOrder: number;
}

export interface WriteContext {
  /** The signed-in person: their settings row has their id. */
  meId: string;
  /** Whether the signed-in person has a settings row yet. */
  hasSettings: boolean;
  /** Each job's holdup rows, by job. */
  holdups: Map<string, HoldupRow[]>;
  newId(): string;
}

type Values = Record<string, unknown>;

interface Spec<T> {
  table: string;
  key(o: T): string | undefined;
  row(o: T): Values;
  /** Only these columns change once the row is made; the rest stay as made. */
  changes?: string[];
  /** Written only when the row is made. */
  made?(o: T): Values;
  /** A record taken out of the list deletes its row. */
  deletes?: boolean;
}

const byId = <T extends { id: string }>(o: T) => o.id;

const people: Spec<Person> = {
  table: 'people',
  key: byId,
  row: (p) => ({ email: p.email, name: p.name, active: p.active, role: p.role, sees: p.sees, phone: p.phone }),
};

/** A job put away is closed in the app and archived in the database. */
const jobs: Spec<Job> = {
  table: 'jobs',
  key: byId,
  row: (j) => ({ name: j.name, address: j.address, archived: j.closed }),
};

const team: Spec<TeamMember> = {
  table: 'job_team',
  key: byId,
  row: (t) => ({ job_id: t.jobId, person_id: t.personId, part: t.part }),
  deletes: true,
};

const templates: Spec<Template> = {
  table: 'templates',
  key: byId,
  row: (t) => ({ name: t.name, active: t.active, sort_order: t.sortOrder }),
};

const templateItems: Spec<TemplateItem> = {
  table: 'template_items',
  key: byId,
  row: (t) => ({
    template_id: t.templateId,
    title: t.title,
    description: t.description,
    kind: t.kind,
    trade_id: t.tradeId,
    hours: t.hours,
    place: t.place,
    waits_on: t.waitsOn,
    sort_order: t.sortOrder,
    active: t.active,
  }),
};

const locations: Spec<Location> = {
  table: 'locations',
  key: byId,
  row: (l) => ({
    job_id: l.jobId,
    name: l.name,
    number: l.number,
    label: l.label,
    floor: l.floor,
    kind: l.kind,
    sort_order: l.sortOrder,
    active: l.active,
    walked_at: l.walkedAt,
  }),
};

const trades: Spec<Trade> = {
  table: 'trades',
  key: byId,
  row: (t) => ({ name: t.name, sort_order: t.sortOrder }),
};

const companies: Spec<Company> = {
  table: 'companies',
  key: byId,
  row: (c) => ({ name: c.name, default_trade_id: c.defaultTradeId, phone: c.phone, email: c.email, active: c.active }),
};

const contacts: Spec<Contact> = {
  table: 'company_contacts',
  key: byId,
  row: (c) => ({ company_id: c.companyId, name: c.name, email: c.email, phone: c.phone, gets_lists: c.getsLists, sort_order: c.sortOrder, active: c.active }),
};

/** The phone keeps a link's token as its row's id. Only taking it back changes it. */
const links: Spec<CompanyLink> = {
  table: 'company_links',
  key: (l) => l.token,
  row: (l) => ({ job_id: l.jobId, company_id: l.companyId, revoked: l.revoked }),
  changes: ['revoked'],
  made: (l) => ({ created_at: l.createdAt }),
};

const jobCompanies: Spec<JobCompany> = {
  table: 'job_companies',
  key: (jc) => jc.id,
  row: (jc) => ({ job_id: jc.jobId, company_id: jc.companyId, trade_id: jc.tradeId }),
  deletes: true,
};

/** The number is the database's, given in the order items reach it. */
const items: Spec<Item> = {
  table: 'items',
  key: byId,
  row: (i) => ({ job_id: i.jobId, ...Object.fromEntries(itemPatchColumns(i)), updated_at: i.updatedAt }),
  made: (i) => ({ source: i.source, created_by: i.createdBy, created_at: i.createdAt }),
};

/** Where the picture is in storage is the uploader's to fill in, once it is up. */
const photos: Spec<Photo> = {
  table: 'photos',
  key: byId,
  row: (p) => ({ job_id: p.jobId, item_id: p.itemId, width: p.width, height: p.height, marks: p.marks, sort_order: p.sortOrder, removed: p.removed }),
  made: (p) => ({ created_by: p.createdBy, created_at: p.createdAt }),
};

/** A plan sheet's picture is a photo's: where it is in storage is the uploader's to fill in. */
const plans: Spec<PlanSheet> = {
  table: 'plan_sheets',
  key: byId,
  row: (p) => ({ job_id: p.jobId, floor: p.floor, name: p.name, width: p.width, height: p.height, sort_order: p.sortOrder, removed: p.removed }),
};

const visits: Spec<Visit> = {
  table: 'visits',
  key: byId,
  row: (v) => ({
    job_id: v.jobId,
    company_id: v.companyId,
    start_date: v.start,
    days: v.days,
    confirmed: v.confirmed,
    note: v.note,
    removed: v.removed,
    asked_start: v.askedStart,
    asked_days: v.askedDays,
    asked_name: v.askedName,
    asked_at: v.askedAt,
    updated_at: v.updatedAt,
  }),
  made: (v) => ({ created_by: v.createdBy, created_at: v.createdAt }),
};

/** What went out stays as it went out; only Undo changes it. */
const sends: Spec<ListSend> = {
  table: 'list_sends',
  key: byId,
  row: (s) => ({ job_id: s.jobId, list: s.list, item_ids: s.itemIds, sent_at: s.sentAt, sent_by: s.sentBy, removed: s.removed, snapshot: s.snapshot }),
  changes: ['removed'],
};

/** A comment is never changed, only taken back or brought back. */
const comments: Spec<Comment> = {
  table: 'comments',
  key: byId,
  row: (c) => ({
    job_id: c.jobId,
    item_id: c.itemId,
    company_id: c.companyId,
    body: c.body,
    person_id: c.personId,
    from_company: c.fromCompany,
    author_name: c.authorName,
    internal: c.internal,
    removed: c.removed,
    created_at: c.createdAt,
  }),
  changes: ['removed'],
};

/** How often a title is used is counted by the database. */
const titles: Spec<StandardTitle> = {
  table: 'title_library',
  key: byId,
  row: (t) => ({ title: t.title, trade_id: t.tradeId, approved: t.approved, hours: t.hours, rooms: t.rooms }),
};

const customFields: Spec<CustomField> = {
  table: 'custom_fields',
  key: byId,
  row: (f) => ({ label: f.label, kind: f.kind, options: f.options, sort_order: f.sortOrder, active: f.active }),
};

/**
 * Each list in the state and its table, in the order the writes go up: what a row points at is
 * written before it (a company's trade before the company, a visit before the items on it, an item
 * before its photos and comments).
 */
const LISTS = {
  people,
  jobs,
  trades,
  companies,
  contacts,
  locations,
  team,
  jobCompanies,
  links,
  templates,
  templateItems,
  titles,
  customFields,
  visits,
  plans,
  items,
  photos,
  sends,
  comments,
} as const;

type ListKey = keyof typeof LISTS;

/** A value as the phone's database keeps it. */
export function encode(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function encodeAll(values: Values): Values {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, encode(v)]));
}

function diffList<T>(spec: Spec<T>, before: T[], after: T[], ctx: WriteContext, writes: Write[]): T[] {
  const old = new Map<string, T>();
  for (const o of before) {
    const k = spec.key(o);
    if (k !== undefined) old.set(k, o);
  }
  const kept = new Set<string>();
  const out = after.map((o) => {
    let k = spec.key(o);
    let record = o;
    if (k === undefined) {
      // New and without an id yet (a company put on a job): its row gets one here.
      k = ctx.newId();
      record = { ...o, id: k };
    }
    kept.add(k);
    const was = old.get(k);
    if (!was) {
      writes.push({ table: spec.table, op: 'insert', id: k, values: encodeAll({ ...spec.row(record), ...(spec.made?.(record) ?? {}) }) });
      return record;
    }
    if (was === record) return record;
    const a = encodeAll(spec.row(was));
    const b = encodeAll(spec.row(record));
    const changed = Object.keys(b).filter((c) => a[c] !== b[c] && (!spec.changes || spec.changes.includes(c)));
    if (changed.length > 0) writes.push({ table: spec.table, op: 'update', id: k, values: Object.fromEntries(changed.map((c) => [c, b[c]])) });
    return record;
  });
  if (spec.deletes) {
    for (const k of old.keys()) if (!kept.has(k)) writes.push({ table: spec.table, op: 'delete', id: k, values: {} });
  }
  return out;
}

/** A job's holdups: one row each, in the order given; a holdup taken off is deleted. */
function diffHoldups(jobId: string, labels: string[], ctx: WriteContext, writes: Write[]): HoldupRow[] {
  const rows = ctx.holdups.get(jobId) ?? [];
  const byLabel = new Map(rows.map((r) => [r.label.toLowerCase(), r]));
  const kept = new Set<string>();
  const out: HoldupRow[] = [];
  labels.forEach((label, i) => {
    const sortOrder = i + 1;
    const was = byLabel.get(label.toLowerCase());
    if (was && !kept.has(was.id)) {
      kept.add(was.id);
      const values: Values = {};
      if (was.label !== label) values.label = label;
      if (was.sortOrder !== sortOrder) values.sort_order = sortOrder;
      if (Object.keys(values).length > 0) writes.push({ table: 'job_waiting_on', op: 'update', id: was.id, values });
      out.push({ id: was.id, label, sortOrder });
      return;
    }
    const id = ctx.newId();
    writes.push({ table: 'job_waiting_on', op: 'insert', id, values: { job_id: jobId, label, sort_order: sortOrder } });
    out.push({ id, label, sortOrder });
  });
  for (const r of rows) if (!kept.has(r.id)) writes.push({ table: 'job_waiting_on', op: 'delete', id: r.id, values: {} });
  return out;
}

export interface Planned {
  writes: Write[];
  /** The change as kept, with the ids given to new rows that had none. */
  next: Partial<State>;
  /** The holdup rows of each job whose holdups changed. */
  holdups: Map<string, HoldupRow[]>;
}

/** The writes for a change from one state to the next, in the order they are to be made. */
export function planWrites(before: State, next: Partial<State>, ctx: WriteContext): Planned {
  const writes: Write[] = [];
  const out: Partial<State> = { ...next };
  for (const key of Object.keys(LISTS) as ListKey[]) {
    const after = next[key];
    if (!after || after === before[key]) continue;
    // Each list keeps its own kind of record; the specs line up with the lists by name.
    const spec = LISTS[key] as unknown as Spec<unknown>;
    (out as Record<string, unknown>)[key] = diffList(spec, before[key] as unknown[], after as unknown[], ctx, writes);
    if (key === 'photos' || key === 'plans') {
      // A new photo's or plan's picture is a file on this phone until it is uploaded.
      const had = new Set((before[key] as { id: string }[]).map((p) => p.id));
      for (const p of after as (Photo | PlanSheet)[]) {
        if (!had.has(p.id)) writes.push({ table: 'photo_files', op: 'insert', id: p.id, values: { uri: p.uri, uploaded: 0 } });
      }
    }
  }
  const holdups = new Map<string, HoldupRow[]>();
  if (next.waitingOn && next.waitingOn !== before.waitingOn) {
    for (const [jobId, labels] of Object.entries(next.waitingOn)) {
      if (labels !== before.waitingOn[jobId]) holdups.set(jobId, diffHoldups(jobId, labels, ctx, writes));
    }
  }
  // The company's name: its one row.
  if (next.org && next.org !== before.org && next.org.id !== '' && next.org.name !== before.org.name) {
    writes.push({ table: 'orgs', op: 'update', id: next.org.id, values: { name: next.org.name } });
  }
  const form = next.formSettings && next.formSettings !== before.formSettings;
  const view = next.viewSettings && next.viewSettings !== before.viewSettings;
  if (form || view) {
    const values = encodeAll({ item_form: next.formSettings ?? before.formSettings, job_view: next.viewSettings ?? before.viewSettings });
    if (ctx.hasSettings) {
      writes.push({
        table: 'person_settings',
        op: 'update',
        id: ctx.meId,
        values: { ...(form ? { item_form: values.item_form } : {}), ...(view ? { job_view: values.job_view } : {}) },
      });
    } else {
      writes.push({ table: 'person_settings', op: 'insert', id: ctx.meId, values: { person_id: ctx.meId, ...values } });
    }
  }
  return { writes, next: out, holdups };
}

/** Tables only on this phone: they are never sent up, and carry no org. */
const LOCAL_ONLY = new Set(['photo_files', 'rejected_changes']);

/** A write as SQL for the phone's database. */
export function toSql(w: Write, org: string): { sql: string; params: unknown[] } {
  if (w.op === 'delete') return { sql: `DELETE FROM ${w.table} WHERE id = ?`, params: [w.id] };
  if (w.op === 'update') {
    const cols = Object.keys(w.values);
    return { sql: `UPDATE ${w.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, params: [...cols.map((c) => w.values[c]), w.id] };
  }
  const values = LOCAL_ONLY.has(w.table) ? w.values : { org, ...w.values };
  const cols = Object.keys(values);
  return { sql: `INSERT INTO ${w.table} (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`, params: [w.id, ...cols.map((c) => values[c])] };
}
