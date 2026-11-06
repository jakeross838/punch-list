// The phone's copy of the database. Mirrors supabase/migrations; booleans are 0 or 1 here.
// Imported only by the iPhone's live backend (data/live), never by the preview build.

import { column, Schema, Table } from '@powersync/react-native';

/** The signed-in person's company: only its own row comes down. */
const orgs = new Table({ name: column.text, created_at: column.text });

const people = new Table({
  org: column.text,
  email: column.text,
  name: column.text,
  active: column.integer,
  /** admin or team. */
  role: column.text,
  /** Which jobs they see: all, or assigned (only the jobs they are on). */
  sees: column.text,
  phone: column.text,
  added_by: column.text,
  created_at: column.text,
});

const jobs = new Table({
  org: column.text,
  name: column.text,
  address: column.text,
  item_counter: column.integer,
  archived: column.integer,
  created_at: column.text,
});

/** Who is on each job, and as what: project_manager, superintendent or field. */
const job_team = new Table(
  { org: column.text, job_id: column.text, person_id: column.text, part: column.text, added_by: column.text, created_at: column.text },
  { indexes: { job: ['job_id'], person: ['person_id'] } },
);

const locations = new Table(
  {
    org: column.text,
    job_id: column.text,
    name: column.text,
    number: column.text,
    label: column.text,
    floor: column.text,
    kind: column.text,
    sort_order: column.integer,
    active: column.integer,
    /** Done Here on the walk going now. */
    walked_at: column.text,
    walked_by: column.text,
    created_at: column.text,
  },
  { indexes: { job: ['job_id'] } },
);

const trades = new Table({ org: column.text, name: column.text, sort_order: column.integer, active: column.integer });

const companies = new Table({
  org: column.text,
  name: column.text,
  default_trade_id: column.text,
  phone: column.text,
  email: column.text,
  active: column.integer,
});

/** The people at each company: who gets its lists and the Schedule Email, on every job. */
const company_contacts = new Table(
  {
    org: column.text,
    company_id: column.text,
    name: column.text,
    email: column.text,
    phone: column.text,
    gets_lists: column.integer,
    sort_order: column.integer,
    active: column.integer,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { company: ['company_id'] } },
);

const job_companies = new Table(
  { org: column.text, job_id: column.text, company_id: column.text, trade_id: column.text },
  { indexes: { job: ['job_id'] } },
);

const job_waiting_on = new Table(
  { org: column.text, job_id: column.text, label: column.text, sort_order: column.integer },
  { indexes: { job: ['job_id'] } },
);

const items = new Table(
  {
    org: column.text,
    job_id: column.text,
    location_id: column.text,
    number: column.integer,
    /** The person at the company it is assigned to. */
    assigned_to: column.text,
    title: column.text,
    description: column.text,
    trade_id: column.text,
    company_id: column.text,
    kind: column.text,
    ready: column.integer,
    waiting_on: column.text,
    /** JSON: the ids of the tasks that have to be done first. */
    waiting_on_items: column.text,
    ready_by: column.text,
    bought_out: column.integer,
    po_or_co: column.text,
    status: column.text,
    completed_by: column.text,
    completed_at: column.text,
    source: column.text,
    /** Where it sits in its location's list, once dragged there. */
    position: column.real,
    /** JSON: the answers to the added fields, by field id. */
    extra: column.text,
    /** 1 while it waits for its title, company or trade. */
    unfinished: column.integer,
    visit_id: column.text,
    /** Estimated time, in hours. */
    hours: column.real,
    bt_external_id: column.text,
    /** When the company said it is done, from its page (out of the app for now). */
    marked_done_at: column.text,
    /** 1 when it is wanted first. */
    priority: column.integer,
    /** JSON: the steps inside it, each with its words and whether it is done. */
    checklist: column.text,
    /** Where it is pinned on the plans: the sheet, and the spot as fractions across and down. */
    plan_id: column.text,
    pin_x: column.real,
    pin_y: column.real,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { job: ['job_id'], location: ['location_id'], assigned: ['assigned_to'], plan: ['plan_id'] } },
);

/** A sheet of the job's plans, one per level, to pin items on. Its picture is in storage like a photo's. */
const plan_sheets = new Table(
  {
    org: column.text,
    job_id: column.text,
    floor: column.text,
    name: column.text,
    storage_path: column.text,
    width: column.integer,
    height: column.integer,
    sort_order: column.integer,
    removed: column.integer,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { job: ['job_id'] } },
);

const item_history = new Table(
  {
    org: column.text,
    item_id: column.text,
    job_id: column.text,
    person_id: column.text,
    field: column.text,
    before: column.text,
    after: column.text,
    source: column.text,
    at: column.text,
  },
  { indexes: { item: ['item_id'] } },
);

/** Who did what on a job besides changing items: photos, visits, lists sent and setup. Read only. */
const job_activity = new Table(
  {
    org: column.text,
    job_id: column.text,
    item_id: column.text,
    person_id: column.text,
    kind: column.text,
    /** JSON */
    detail: column.text,
    at: column.text,
  },
  { indexes: { job: ['job_id'], item: ['item_id'] } },
);

const title_library = new Table({
  org: column.text,
  title: column.text,
  trade_id: column.text,
  uses: column.integer,
  approved: column.integer,
  /** How long the work usually takes, in hours. */
  hours: column.real,
  /** The kinds of room it is common in, as a JSON list. */
  rooms: column.text,
  created_at: column.text,
});

const custom_fields = new Table({
  org: column.text,
  label: column.text,
  kind: column.text,
  /** JSON: the choices, for a list. */
  options: column.text,
  sort_order: column.integer,
  active: column.integer,
  created_at: column.text,
});

/** The picture itself is a file on the phone named for the photo's id, until it is uploaded. */
const photos = new Table(
  {
    org: column.text,
    job_id: column.text,
    item_id: column.text,
    storage_path: column.text,
    width: column.integer,
    height: column.integer,
    /** JSON: the marks drawn on it. */
    marks: column.text,
    sort_order: column.integer,
    removed: column.integer,
    created_by: column.text,
    created_at: column.text,
  },
  { indexes: { item: ['item_id'], job: ['job_id'] } },
);

/** A company's trip to the job for a batch of items. */
const visits = new Table(
  {
    org: column.text,
    job_id: column.text,
    company_id: column.text,
    start_date: column.text,
    days: column.integer,
    confirmed: column.integer,
    note: column.text,
    removed: column.integer,
    /** Other dates the company asked for from its page. */
    asked_start: column.text,
    asked_days: column.integer,
    asked_name: column.text,
    asked_at: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { job: ['job_id'] } },
);

/** Each list that went out, and the items on it. */
const list_sends = new Table(
  {
    org: column.text,
    job_id: column.text,
    list: column.text,
    /** JSON: the item ids. */
    item_ids: column.text,
    sent_at: column.text,
    sent_by: column.text,
    removed: column.integer,
    /** JSON: the schedule as it went out, for the look ahead and the Schedule Email. */
    snapshot: column.text,
  },
  { indexes: { job: ['job_id'] } },
);

/** A comment on an item, or on a company's whole list: from your team, or from the company doing the work. Never deleted. */
const comments = new Table(
  {
    org: column.text,
    job_id: column.text,
    item_id: column.text,
    company_id: column.text,
    body: column.text,
    person_id: column.text,
    from_company: column.integer,
    author_name: column.text,
    /** 1: internal, for your own company only. */
    internal: column.integer,
    removed: column.integer,
    created_at: column.text,
  },
  { indexes: { job: ['job_id'], item: ['item_id'] } },
);

/** Each company's private page on a job. The row's id is the link's token. */
const company_links = new Table(
  {
    org: column.text,
    job_id: column.text,
    company_id: column.text,
    created_by: column.text,
    created_at: column.text,
    revoked: column.integer,
  },
  { indexes: { job: ['job_id'] } },
);

/** Each person's own settings. The row's id is the person's id. */
const person_settings = new Table({
  org: column.text,
  person_id: column.text,
  /** JSON */
  item_form: column.text,
  /** JSON */
  job_view: column.text,
  updated_at: column.text,
});

/** What always needs doing in a house: named lists of tasks, added to a job in one go. */
const templates = new Table({ org: column.text, name: column.text, active: column.integer, sort_order: column.integer, created_by: column.text, created_at: column.text, updated_at: column.text });

const template_items = new Table(
  {
    org: column.text,
    template_id: column.text,
    title: column.text,
    description: column.text,
    kind: column.text,
    trade_id: column.text,
    hours: column.real,
    /** The Whole House or another area every job has, or a kind of room: every location of that kind. */
    place: column.text,
    /** JSON: the tasks in the same template that have to be done first. */
    waits_on: column.text,
    sort_order: column.integer,
    active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { template: ['template_id'] } },
);

/**
 * Where each photo's picture is on this phone, by the photo's id: taken here and waiting to go up
 * (uploaded 0), or up, or brought down from storage to show (uploaded 1). Never sent up.
 */
const photo_files = new Table({ uri: column.text, uploaded: column.integer }, { localOnly: true });

/** Changes the server refused for good (a broken rule, not a lost signal). Kept on the phone, shown in the app. */
const rejected_changes = new Table(
  {
    table_name: column.text,
    row_id: column.text,
    op: column.text,
    data: column.text,
    error: column.text,
    at: column.text,
  },
  { localOnly: true },
);

export const AppSchema = new Schema({
  orgs,
  people,
  jobs,
  job_team,
  locations,
  trades,
  companies,
  company_contacts,
  job_companies,
  job_waiting_on,
  items,
  item_history,
  job_activity,
  title_library,
  custom_fields,
  templates,
  template_items,
  photos,
  plan_sheets,
  visits,
  list_sends,
  comments,
  company_links,
  person_settings,
  photo_files,
  rejected_changes,
});
