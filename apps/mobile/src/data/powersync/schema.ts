// The phone's copy of the database. Mirrors supabase/migrations; booleans are 0 or 1 here.
// Imported only by backend.native.tsx, never by the preview build.

import { column, Schema, Table } from '@powersync/react-native';

const people = new Table({
  org: column.text,
  email: column.text,
  name: column.text,
  active: column.integer,
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
    title: column.text,
    description: column.text,
    trade_id: column.text,
    company_id: column.text,
    kind: column.text,
    ready: column.integer,
    waiting_on: column.text,
    ready_by: column.text,
    bought_out: column.integer,
    po_or_co: column.text,
    status: column.text,
    completed_by: column.text,
    completed_at: column.text,
    source: column.text,
    bt_external_id: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { job: ['job_id'], location: ['location_id'] } },
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

const title_library = new Table({
  org: column.text,
  title: column.text,
  trade_id: column.text,
  uses: column.integer,
  approved: column.integer,
  created_at: column.text,
});

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
  people,
  jobs,
  locations,
  trades,
  companies,
  job_companies,
  job_waiting_on,
  items,
  item_history,
  title_library,
  rejected_changes,
});
