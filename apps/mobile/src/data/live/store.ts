// The app's state on the iPhone, read from the phone's database and kept current as changes come
// down from the server or are made here. A change is shown at once and written to the phone's
// database in the same moment; PowerSync sends it up when there is a signal. The database's log
// (item History and the job's Activity) is read where it is shown, not kept here.

import { randomUUID } from 'expo-crypto';
import { DEFAULT_FORM, DEFAULT_VIEW, KINDS, readViewSettings, type FormSettings, type ItemKind, type Org, type Person } from '@punch/core';
import type { State } from '../engine';
import {
  rowToComment,
  rowToCompany,
  rowToCompanyLink,
  rowToContact,
  rowToCustomField,
  rowToItem,
  rowToJob,
  rowToJobCompany,
  rowToListSend,
  rowToLocation,
  rowToPerson,
  rowToPhoto,
  rowToPlanSheet,
  rowToStandardTitle,
  rowToTeamMember,
  rowToTemplate,
  rowToTemplateItem,
  rowToTrade,
  rowToVisit,
} from '../rows';
import { db } from './db';
import { planWrites, toSql, type HoldupRow } from './writes';

type Row = Record<string, unknown>;

const LISTS = {
  people: { sql: 'SELECT * FROM people ORDER BY name', map: rowToPerson },
  jobs: { sql: 'SELECT * FROM jobs ORDER BY name', map: rowToJob },
  team: { sql: 'SELECT * FROM job_team ORDER BY job_id, created_at', map: rowToTeamMember },
  locations: { sql: 'SELECT * FROM locations ORDER BY job_id, sort_order', map: rowToLocation },
  trades: { sql: 'SELECT * FROM trades ORDER BY sort_order, name', map: rowToTrade },
  companies: { sql: 'SELECT * FROM companies ORDER BY name', map: rowToCompany },
  contacts: { sql: 'SELECT * FROM company_contacts ORDER BY company_id, sort_order', map: rowToContact },
  links: { sql: 'SELECT * FROM company_links ORDER BY created_at', map: rowToCompanyLink },
  jobCompanies: { sql: 'SELECT * FROM job_companies ORDER BY job_id', map: rowToJobCompany },
  // An item made on this phone has no number until the database gives it one.
  items: { sql: 'SELECT * FROM items ORDER BY job_id, number IS NULL, number, created_at', map: rowToItem },
  photos: {
    sql: 'SELECT p.*, f.uri AS local_uri FROM photos p LEFT JOIN photo_files f ON f.id = p.id ORDER BY p.item_id, p.sort_order',
    map: (r: Row) => rowToPhoto(r, typeof r.local_uri === 'string' ? r.local_uri : ''),
  },
  plans: {
    sql: 'SELECT s.*, f.uri AS local_uri FROM plan_sheets s LEFT JOIN photo_files f ON f.id = s.id ORDER BY s.job_id, s.sort_order',
    map: (r: Row) => rowToPlanSheet(r, typeof r.local_uri === 'string' ? r.local_uri : ''),
  },
  visits: { sql: 'SELECT * FROM visits ORDER BY start_date', map: rowToVisit },
  sends: { sql: 'SELECT * FROM list_sends ORDER BY sent_at', map: rowToListSend },
  comments: { sql: 'SELECT * FROM comments ORDER BY created_at', map: rowToComment },
  titles: { sql: 'SELECT * FROM title_library ORDER BY title', map: rowToStandardTitle },
  customFields: { sql: 'SELECT * FROM custom_fields ORDER BY sort_order', map: rowToCustomField },
  templates: { sql: 'SELECT * FROM templates ORDER BY sort_order', map: rowToTemplate },
  templateItems: { sql: 'SELECT * FROM template_items ORDER BY template_id, sort_order', map: rowToTemplateItem },
} as const;

type ListKey = keyof typeof LISTS;
type Part = ListKey | 'waitingOn' | 'settings' | 'org';

/** Which parts of the state each table fills. */
const TABLE_PARTS: Record<string, Part[]> = {
  people: ['people', 'settings'],
  jobs: ['jobs'],
  job_team: ['team'],
  locations: ['locations'],
  trades: ['trades'],
  companies: ['companies'],
  company_contacts: ['contacts'],
  company_links: ['links'],
  job_companies: ['jobCompanies'],
  job_waiting_on: ['waitingOn'],
  items: ['items'],
  photos: ['photos'],
  plan_sheets: ['plans'],
  photo_files: ['photos', 'plans'],
  visits: ['visits'],
  list_sends: ['sends'],
  comments: ['comments'],
  title_library: ['titles'],
  custom_fields: ['customFields'],
  templates: ['templates'],
  template_items: ['templateItems'],
  person_settings: ['settings'],
  orgs: ['org'],
};

export const WATCHED_TABLES = Object.keys(TABLE_PARTS);
const ALL_PARTS: Part[] = [...(Object.keys(LISTS) as ListKey[]), 'waitingOn', 'settings', 'org'];

/** Nobody signed in. */
const NOBODY: Person = { id: '', email: '', name: '', active: false, role: 'team', sees: 'assigned', phone: null };
/** No company yet. */
const NO_ORG: Org = { id: '', name: '' };

export function emptyState(): State {
  return {
    me: NOBODY,
    signedIn: false,
    codeFor: null,
    newAccount: null,
    org: NO_ORG,
    people: [],
    activity: [],
    jobs: [],
    team: [],
    locations: [],
    trades: [],
    companies: [],
    contacts: [],
    links: [],
    jobCompanies: [],
    waitingOn: {},
    items: [],
    photos: [],
    plans: [],
    visits: [],
    sends: [],
    comments: [],
    titles: [],
    customFields: [],
    templates: [],
    templateItems: [],
    formSettings: DEFAULT_FORM,
    viewSettings: DEFAULT_VIEW,
    counters: {},
  };
}

let state: State = emptyState();
const listeners = new Set<() => void>();
/** The signed-in email, from the Supabase session. */
let email: string | null = null;
/** Each job's holdup rows, for writing changes to them. */
let holdups = new Map<string, HoldupRow[]>();
/** The settings rows on the phone: only the signed-in person's comes down. */
let settingsRows: Row[] = [];

/** Who is signed in: the active person with the session's email, once their row is on the phone. */
function withMe(s: State): State {
  const me = email ? s.people.find((p) => p.email === email && p.active) : undefined;
  if (me === s.me && !!me === s.signedIn) return s;
  return { ...s, me: me ?? NOBODY, signedIn: !!me };
}

/** Jobs deleted on the server whose rows have not come off the phone yet: out of sight meanwhile. */
const gone = new Set<string>();

function setState(next: State): void {
  state = withMe(next);
  if (gone.size > 0 && state.jobs.some((j) => gone.has(j.id))) state = { ...state, jobs: state.jobs.filter((j) => !gone.has(j.id)) };
  for (const l of listeners) l();
}

/** A job just deleted on the server goes from the lists now, before the sync takes its rows off. */
export function hideJob(id: string): void {
  gone.add(id);
  setState(state);
}

export const store = {
  get: (): State => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function setSessionEmail(next: string | null): void {
  const clean = next ? next.trim().toLowerCase() : null;
  if (clean === email) return;
  email = clean;
  setState(state);
  // The settings that apply are the new person's.
  schedule(['settings']);
}

export const sessionEmail = () => email;

/** Signed in with an email that is not with a company yet, or null. */
export function setNewAccount(next: string | null): void {
  if (next === state.newAccount) return;
  setState({ ...state, newAccount: next });
}

// ---------- reading the phone's database ----------

/** Each list's records by id, with the row each was read from, so a record that did not change stays the same record. */
const read = new Map<ListKey, Map<string, { sig: string; record: unknown }>>();

async function loadList(key: ListKey): Promise<unknown[]> {
  const { sql, map } = LISTS[key];
  const rows = await db.getAll<Row>(sql);
  const before = read.get(key) ?? new Map<string, { sig: string; record: unknown }>();
  const now = new Map<string, { sig: string; record: unknown }>();
  const current = state[key] as unknown[];
  let same = rows.length === current.length;
  const list = rows.map((r, i) => {
    const id = String(r.id);
    const sig = JSON.stringify(r);
    const was = before.get(id);
    const record = was && was.sig === sig ? was.record : (map as (r: Row) => unknown)(r);
    now.set(id, { sig, record });
    if (same && current[i] !== record) same = false;
    return record;
  });
  read.set(key, now);
  return same ? current : list;
}

function readJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function readForm(raw: unknown): FormSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    hidden: Array.isArray(r.hidden) ? (r.hidden.filter((f) => typeof f === 'string') as FormSettings['hidden']) : DEFAULT_FORM.hidden,
    startReady: typeof r.startReady === 'boolean' ? r.startReady : DEFAULT_FORM.startReady,
    startKind: KINDS.includes(r.startKind as ItemKind) ? (r.startKind as ItemKind) : DEFAULT_FORM.startKind,
  };
}

async function loadParts(parts: Set<Part>): Promise<Partial<State>> {
  const out: Partial<State> = {};
  for (const part of parts) {
    if (part === 'waitingOn') {
      const rows = await db.getAll<Row>('SELECT id, job_id, label, sort_order FROM job_waiting_on ORDER BY job_id, sort_order, label');
      const byJob = new Map<string, HoldupRow[]>();
      for (const r of rows) {
        const job = String(r.job_id);
        byJob.set(job, [...(byJob.get(job) ?? []), { id: String(r.id), label: String(r.label ?? ''), sortOrder: Number(r.sort_order ?? 0) }]);
      }
      holdups = byJob;
      const waitingOn: Record<string, string[]> = {};
      for (const [job, list] of byJob) {
        const labels = list.map((h) => h.label);
        const was = state.waitingOn[job];
        waitingOn[job] = was && was.join('\n') === labels.join('\n') ? was : labels;
      }
      out.waitingOn = waitingOn;
    } else if (part === 'settings') {
      settingsRows = await db.getAll<Row>('SELECT * FROM person_settings');
    } else if (part === 'org') {
      // Only the signed-in person's company comes down.
      const row = await db.getOptional<Row>('SELECT id, name, logo, plan, trial_ends FROM orgs LIMIT 1');
      const org: Org = row
        ? {
            id: String(row.id),
            name: String(row.name ?? ''),
            logo: typeof row.logo === 'string' && row.logo !== '' ? row.logo : null,
            plan: row.plan === 'trial' || row.plan === 'paid' ? row.plan : 'free',
            trialEnds: typeof row.trial_ends === 'string' && row.trial_ends !== '' ? row.trial_ends : null,
          }
        : NO_ORG;
      const same =
        org.id === state.org.id && org.name === state.org.name && (org.logo ?? null) === (state.org.logo ?? null) && org.plan === state.org.plan && org.trialEnds === state.org.trialEnds;
      out.org = same ? state.org : org;
    } else {
      (out as Record<string, unknown>)[part] = await loadList(part);
    }
  }
  return out;
}

/** The signed-in person's settings, from their row. */
function settingsFor(s: State): Pick<State, 'formSettings' | 'viewSettings'> {
  const row = settingsRows.find((r) => r.person_id === s.me.id || r.id === s.me.id);
  if (!row) return { formSettings: DEFAULT_FORM, viewSettings: DEFAULT_VIEW };
  const form = readForm(readJson(row.item_form));
  const view = readViewSettings(readJson(row.job_view));
  return {
    formSettings: JSON.stringify(form) === JSON.stringify(s.formSettings) ? s.formSettings : form,
    viewSettings: JSON.stringify(view) === JSON.stringify(s.viewSettings) ? s.viewSettings : view,
  };
}

// Reading again waits for any write in progress, and starts over if one was made while it read,
// so a change shown at once is never covered by an older read.
let writing = 0;
let version = 0;
let reading = false;
const dirty = new Set<Part>();

export function schedule(parts: Part[] = ALL_PARTS): void {
  for (const p of parts) dirty.add(p);
  if (!reading) void readAgain();
}

async function readAgain(): Promise<void> {
  reading = true;
  try {
    while (dirty.size > 0 && writing === 0) {
      const parts = new Set(dirty);
      dirty.clear();
      const started = version;
      const loaded = await loadParts(parts);
      if (version !== started || writing > 0) {
        for (const p of parts) dirty.add(p);
        continue;
      }
      let next = withMe({ ...state, ...loaded });
      if (parts.has('settings') || parts.has('people')) next = { ...next, ...settingsFor(next) };
      setState(next);
    }
  } catch (e) {
    console.warn('Reading the phone database', e);
  } finally {
    reading = false;
  }
}

/** Every table changed: the phone's database was just opened, or cleared. */
export async function loadEverything(): Promise<void> {
  const loaded = await loadParts(new Set(ALL_PARTS));
  const next = withMe({ ...emptyState(), ...loaded, newAccount: state.newAccount });
  setState({ ...next, ...settingsFor(next) });
}

/** Tables PowerSync says changed, as names of the app's tables. */
export function changed(tables: string[]): void {
  const parts = new Set<Part>();
  for (const t of tables) {
    const name = t.replace(/^ps_data_local__/, '').replace(/^ps_data__/, '');
    for (const p of TABLE_PARTS[name] ?? []) parts.add(p);
  }
  if (parts.size > 0) schedule([...parts]);
}

/** Starting over: nobody signed in and nothing on the phone. */
export function reset(): void {
  read.clear();
  holdups = new Map();
  settingsRows = [];
  dirty.clear();
  setState(emptyState());
}

// ---------- writing ----------

/** The parts of the state that are the app's own; the rest the phone works out. */
const KEPT: (keyof State)[] = [
  'org',
  'people',
  'jobs',
  'team',
  'locations',
  'trades',
  'companies',
  'contacts',
  'links',
  'jobCompanies',
  'waitingOn',
  'items',
  'photos',
  'visits',
  'sends',
  'comments',
  'titles',
  'customFields',
  'templates',
  'templateItems',
  'formSettings',
  'viewSettings',
];

/**
 * Keeps a change: shown at once, and written to the phone's database as one transaction, which
 * PowerSync sends up in order.
 */
export async function save(next: Partial<State>): Promise<void> {
  const before = state;
  const plan = planWrites(before, next, {
    meId: before.me.id,
    hasSettings: settingsRows.some((r) => r.person_id === before.me.id || r.id === before.me.id),
    holdups,
    newId: randomUUID,
  });
  const kept: Partial<State> = {};
  for (const k of KEPT) if (k in plan.next) (kept as Record<string, unknown>)[k] = plan.next[k];
  for (const [job, rows] of plan.holdups) holdups.set(job, rows);
  // A settings row made now is there for the next change, before it is read back.
  if (plan.writes.some((w) => w.table === 'person_settings' && w.op === 'insert')) settingsRows = [...settingsRows, { id: before.me.id, person_id: before.me.id }];
  if (plan.writes.length === 0) {
    setState({ ...state, ...kept });
    return;
  }
  writing++;
  version++;
  setState({ ...state, ...kept });
  try {
    await db.writeTransaction(async (tx) => {
      for (const w of plan.writes) {
        const { sql, params } = toSql(w, before.org.id);
        await tx.execute(sql, params);
      }
    });
  } catch (e) {
    // Nothing was kept: show what the phone's database has.
    schedule();
    throw e;
  } finally {
    writing--;
    if (writing === 0) schedule([]);
  }
}
