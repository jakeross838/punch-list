// What each change writes in the phone's database, which PowerSync then sends up in order.

import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, DEFAULT_VIEW, type Comment, type CompanyLink, type Item, type Person, type Photo } from '@punch/core';
import type { State } from '../src/data/engine';
import { planWrites, toSql, type WriteContext } from '../src/data/live/writes';

const me: Person = { id: 'p1', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true, role: 'admin', sees: 'all', phone: null };

function state(over: Partial<State> = {}): State {
  return {
    me,
    signedIn: true,
    codeFor: null,
    newAccount: null,
    org: { id: 'ross_built', name: 'Ross Built' },
    people: [me],
    activity: [],
    jobs: [{ id: 'j1', name: 'Fish', address: '715 North Shore Drive', closed: false }],
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
    ...over,
  };
}

let n = 0;
const ctx = (over: Partial<WriteContext> = {}): WriteContext => ({ meId: me.id, hasSettings: false, holdups: new Map(), newId: () => `new-${++n}`, ...over });

const item: Item = {
  id: 'i1',
  jobId: 'j1',
  locationId: 'l1',
  number: null,
  assignedTo: null,
  title: 'Install towel bar',
  description: '',
  tradeId: 't1',
  companyId: 'c1',
  kind: 'completion',
  ready: false,
  waitingOn: ['Owner'],
  waitingOnItems: [],
  readyBy: null,
  boughtOut: true,
  poOrCo: null,
  status: 'open',
  completedBy: null,
  completedAt: null,
  source: 'walk',
  position: null,
  extra: {},
  unfinished: false,
  visitId: null,
  hours: 0.5,
  btExternalId: null,
  createdBy: 'p1',
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
};

describe('planWrites', () => {
  it('inserts a new item with its columns as the phone keeps them, and no number: the database gives it one', () => {
    const { writes } = planWrites(state(), { items: [item] }, ctx());
    expect(writes).toHaveLength(1);
    const w = writes[0]!;
    expect(w).toMatchObject({ table: 'items', op: 'insert', id: 'i1' });
    expect(w.values).not.toHaveProperty('number');
    expect(w.values).toMatchObject({
      job_id: 'j1',
      location_id: 'l1',
      title: 'Install towel bar',
      ready: 0,
      bought_out: 1,
      waiting_on: '["Owner"]',
      waiting_on_items: '[]',
      extra: '{}',
      hours: 0.5,
      source: 'walk',
      created_by: 'p1',
      created_at: '2026-11-03T12:00:00.000Z',
    });
  });

  it('updates only the columns that changed', () => {
    const before = state({ items: [item] });
    const done: Item = { ...item, status: 'complete', completedBy: 'p1', completedAt: '2026-11-03T13:00:00.000Z', updatedAt: '2026-11-03T13:00:00.000Z' };
    const { writes } = planWrites(before, { items: [done] }, ctx());
    expect(writes).toEqual([
      {
        table: 'items',
        op: 'update',
        id: 'i1',
        values: { status: 'complete', completed_by: 'p1', completed_at: '2026-11-03T13:00:00.000Z', updated_at: '2026-11-03T13:00:00.000Z' },
      },
    ]);
  });

  it('writes nothing for records that are the same, and an item with no location keeps none', () => {
    const before = state({ items: [item] });
    expect(planWrites(before, { items: [...before.items] }, ctx()).writes).toEqual([]);
    const draft: Item = { ...item, id: 'i2', locationId: '', unfinished: true };
    const w = planWrites(before, { items: [item, draft] }, ctx()).writes[0]!;
    expect(w.values).toMatchObject({ location_id: null, unfinished: 1 });
  });

  it('takes a comment back with removed alone: a comment is never changed', () => {
    const c: Comment = { id: 'm1', jobId: 'j1', itemId: 'i1', companyId: 'c1', body: 'Ready Monday', personId: 'p1', fromCompany: false, authorName: null, internal: false, removed: false, createdAt: '2026-11-03T12:00:00.000Z' };
    const { writes } = planWrites(state({ comments: [c] }), { comments: [{ ...c, removed: true, body: 'changed' }] }, ctx());
    expect(writes).toEqual([{ table: 'comments', op: 'update', id: 'm1', values: { removed: 1 } }]);
  });

  it("keeps a company link's token as its id, and taking it back changes revoked alone", () => {
    const link: CompanyLink = { token: 'a'.repeat(64), jobId: 'j1', companyId: 'c1', createdAt: '2026-11-03T12:00:00.000Z', revoked: false };
    const made = planWrites(state(), { links: [link] }, ctx()).writes;
    expect(made).toEqual([{ table: 'company_links', op: 'insert', id: link.token, values: { job_id: 'j1', company_id: 'c1', revoked: 0, created_at: link.createdAt } }]);
    const taken = planWrites(state({ links: [link] }), { links: [{ ...link, revoked: true }] }, ctx()).writes;
    expect(taken).toEqual([{ table: 'company_links', op: 'update', id: link.token, values: { revoked: 1 } }]);
  });

  it('gives a company put on a job a row id, changes its trade in place, and deletes it when it comes off', () => {
    const plan = planWrites(state(), { jobCompanies: [{ jobId: 'j1', companyId: 'c1', tradeId: 't1' }] }, ctx({ newId: () => 'jc1' }));
    expect(plan.writes).toEqual([{ table: 'job_companies', op: 'insert', id: 'jc1', values: { job_id: 'j1', company_id: 'c1', trade_id: 't1' } }]);
    expect(plan.next.jobCompanies).toEqual([{ id: 'jc1', jobId: 'j1', companyId: 'c1', tradeId: 't1' }]);
    const on = state({ jobCompanies: plan.next.jobCompanies! });
    expect(planWrites(on, { jobCompanies: [{ ...on.jobCompanies[0]!, tradeId: 't2' }] }, ctx()).writes).toEqual([
      { table: 'job_companies', op: 'update', id: 'jc1', values: { trade_id: 't2' } },
    ]);
    expect(planWrites(on, { jobCompanies: [] }, ctx()).writes).toEqual([{ table: 'job_companies', op: 'delete', id: 'jc1', values: {} }]);
  });

  it('deletes someone taken off a team, and never deletes an item taken out of the list', () => {
    const before = state({ team: [{ id: 'tm1', jobId: 'j1', personId: 'p1', part: 'field' }], items: [item] });
    expect(planWrites(before, { team: [] }, ctx()).writes).toEqual([{ table: 'job_team', op: 'delete', id: 'tm1', values: {} }]);
    expect(planWrites(before, { items: [] }, ctx()).writes).toEqual([]);
  });

  it("keeps a new photo's file on the phone until it is up, and leaves where it is in storage to the uploader", () => {
    const photo: Photo = {
      id: 'ph1',
      jobId: 'j1',
      itemId: 'i1',
      uri: 'file:///photos/ph1.jpg',
      storagePath: null,
      width: 4032,
      height: 3024,
      marks: [],
      sortOrder: 1,
      removed: false,
      done: true,
      createdBy: 'p1',
      createdAt: '2026-11-03T12:00:00.000Z',
    };
    const { writes } = planWrites(state(), { photos: [photo] }, ctx());
    expect(writes.map((w) => `${w.table} ${w.op}`)).toEqual(['photos insert', 'photo_files insert']);
    expect(writes[0]!.values).not.toHaveProperty('storage_path');
    // A done photo says so as it goes up; it never changes after.
    expect(writes[0]!.values).toMatchObject({ done: 1 });
    expect(writes[1]).toEqual({ table: 'photo_files', op: 'insert', id: 'ph1', values: { uri: 'file:///photos/ph1.jpg', uploaded: 0 } });
  });

  it("adds, orders and takes off a job's Waiting On choices", () => {
    const holdups = new Map([['j1', [{ id: 'h1', label: 'Owner', sortOrder: 1 }, { id: 'h2', label: 'Design Team', sortOrder: 2 }]]]);
    const before = state({ waitingOn: { j1: ['Owner', 'Design Team'] } });
    const plan = planWrites(before, { waitingOn: { j1: ['Design Team', 'Engineer'] } }, ctx({ holdups, newId: () => 'h3' }));
    expect(plan.writes).toEqual([
      { table: 'job_waiting_on', op: 'update', id: 'h2', values: { sort_order: 1 } },
      { table: 'job_waiting_on', op: 'insert', id: 'h3', values: { job_id: 'j1', label: 'Engineer', sort_order: 2 } },
      { table: 'job_waiting_on', op: 'delete', id: 'h1', values: {} },
    ]);
    expect(plan.holdups.get('j1')).toEqual([
      { id: 'h2', label: 'Design Team', sortOrder: 1 },
      { id: 'h3', label: 'Engineer', sortOrder: 2 },
    ]);
  });

  it("makes the person's settings row the first time, then changes only what changed", () => {
    const view = { ...DEFAULT_VIEW, groupBy: 'company' as const };
    const first = planWrites(state(), { viewSettings: view }, ctx());
    expect(first.writes).toEqual([
      { table: 'person_settings', op: 'insert', id: 'p1', values: { person_id: 'p1', item_form: JSON.stringify(DEFAULT_FORM), job_view: JSON.stringify(view) } },
    ]);
    const later = planWrites(state({ viewSettings: view }), { formSettings: { ...DEFAULT_FORM, startReady: false } }, ctx({ hasSettings: true }));
    expect(later.writes).toEqual([{ table: 'person_settings', op: 'update', id: 'p1', values: { item_form: JSON.stringify({ ...DEFAULT_FORM, startReady: false }) } }]);
  });

  it('leaves how often a standard title is used to the database', () => {
    const t = { id: 's1', title: 'Install towel bar', tradeId: 't1', uses: 3, approved: true, hours: 0.5, rooms: ['bathroom' as const] };
    expect(planWrites(state({ titles: [t] }), { titles: [{ ...t, uses: 4 }] }, ctx()).writes).toEqual([]);
  });

  it('makes a job closed by archiving it', () => {
    const before = state();
    expect(planWrites(before, { jobs: [{ ...before.jobs[0]!, closed: true }] }, ctx()).writes).toEqual([{ table: 'jobs', op: 'update', id: 'j1', values: { archived: 1 } }]);
  });
});

describe('toSql', () => {
  it('adds the org to a new row the server keeps, and not to one only on the phone', () => {
    expect(toSql({ table: 'items', op: 'insert', id: 'i1', values: { title: 'A' } }, 'ross_built')).toEqual({
      sql: 'INSERT INTO items (id, org, title) VALUES (?, ?, ?)',
      params: ['i1', 'ross_built', 'A'],
    });
    expect(toSql({ table: 'photo_files', op: 'insert', id: 'ph1', values: { uri: 'file:///x.jpg', uploaded: 0 } }, 'ross_built')).toEqual({
      sql: 'INSERT INTO photo_files (id, uri, uploaded) VALUES (?, ?, ?)',
      params: ['ph1', 'file:///x.jpg', 0],
    });
  });

  it('updates and deletes by id', () => {
    expect(toSql({ table: 'items', op: 'update', id: 'i1', values: { status: 'complete', ready: 1 } }, 'ross_built')).toEqual({
      sql: 'UPDATE items SET status = ?, ready = ? WHERE id = ?',
      params: ['complete', 1, 'i1'],
    });
    expect(toSql({ table: 'job_team', op: 'delete', id: 'tm1', values: {} }, 'ross_built')).toEqual({ sql: 'DELETE FROM job_team WHERE id = ?', params: ['tm1'] });
  });
});
