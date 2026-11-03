// Preview backend: sample data in memory, for the preview link. Nothing leaves the browser tab and
// a reload starts over. Every change is logged the way the database logs it (a row for each item
// field that changed, and a row for photos, visits, lists sent and job setup), so Activity and
// each item's History show what the real app will.

import { randomUUID } from 'expo-crypto';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  contactProblem,
  isAdmin,
  isEmail,
  itemChanges,
  releasedBy,
  renamedHoldups,
  seesJob,
  tidyComment,
  tidyContact,
  tidyEmail,
  tidyName,
  tidyTitle,
  type Activity,
  type ActivityDetail,
  type ActivityKind,
  type Comment,
  type Contact,
  type Item,
  type Person,
  type Photo,
  type TeamMember,
  type Visit,
} from '@punch/core';
import { DataContext, type DataApi, type ItemPatch, type NewItem } from './api';
import { keepPhoto } from './photoFiles';
import { sampleState, type SampleState } from './sample';

let state: SampleState = sampleState();
const listeners = new Set<() => void>();

function setState(next: SampleState): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useStore(): SampleState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

const now = () => new Date().toISOString();

/** Something that happened, besides an item's fields changing: who and when are added on commit. */
interface Happened {
  jobId: string;
  itemId?: string | null;
  kind: Exclude<ActivityKind, 'item_created' | 'item_changed'>;
  detail?: ActivityDetail;
  /** Someone other than the signed-in person: null for the company, on its page. */
  personId?: string | null;
}

let seq = 0;
/** Ids in the order things happened, so two things done in the same moment keep their order. */
const nextId = () => `activity-live-${String(++seq).padStart(6, '0')}`;

/**
 * Saves a change and logs it: every item added or changed, field by field, the way the database
 * does, and the other things that happened, all as the signed-in person, now.
 */
/**
 * The trade follows the company, as the database has it: a trade the company does on the job stays,
 * otherwise the first one it does there, or its usual trade.
 */
function tradeFollows(item: Item): Item {
  if (!item.companyId) return item;
  const onJob = state.jobCompanies.filter((jc) => jc.jobId === item.jobId && jc.companyId === item.companyId);
  if (item.tradeId && onJob.some((jc) => jc.tradeId === item.tradeId)) return item;
  const order = (id: string) => state.trades.find((t) => t.id === id);
  const first = [...onJob].sort((a, b) => (order(a.tradeId)?.sortOrder ?? 0) - (order(b.tradeId)?.sortOrder ?? 0))[0]?.tradeId;
  const tradeId = first ?? state.companies.find((c) => c.id === item.companyId)?.defaultTradeId ?? item.tradeId;
  return tradeId === item.tradeId ? item : { ...item, tradeId };
}

/**
 * What the database does on every item write: the trade follows the company, a ready item waits
 * on nothing, and a task done or removed frees what waited on it (an item with nothing left to
 * wait on is ready).
 */
function settle(before: Item[], after: Item[]): Item[] {
  const was = new Map(before.map((i) => [i.id, i]));
  let items = after.map((i) => (was.get(i.id) === i ? i : tradeFollows(i))).map((i) =>
    i.ready && (i.waitingOn.length > 0 || i.waitingOnItems.length > 0 || i.readyBy !== null) ? { ...i, waitingOn: [], waitingOnItems: [], readyBy: null } : i,
  );
  const wasOpen = new Set(before.filter((i) => i.status === 'open').map((i) => i.id));
  for (const done of items.filter((i) => wasOpen.has(i.id) && i.status !== 'open')) {
    const freed = new Map(releasedBy(done.id, items).map((r) => [r.item.id, r.patch]));
    if (freed.size > 0) items = items.map((i) => (freed.has(i.id) ? { ...i, ...freed.get(i.id)!, updatedAt: now() } : i));
  }
  return items;
}

function commit(next: Partial<SampleState>, happened: Happened[] = []): void {
  const at = now();
  const personId = state.me.id;
  const entries: Activity[] = [];
  if (next.items && next.items !== state.items) {
    const before = new Map(state.items.map((i) => [i.id, i]));
    for (const item of next.items) {
      const was = before.get(item.id);
      if (!was) {
        entries.push({ id: nextId(), jobId: item.jobId, itemId: item.id, personId, at, kind: 'item_created', field: 'created', before: null, after: item.title });
      } else if (was !== item) {
        for (const c of itemChanges(was, item)) entries.push({ id: nextId(), jobId: item.jobId, itemId: item.id, personId, at, kind: 'item_changed', ...c });
      }
    }
  }
  for (const h of happened) {
    entries.push({ id: nextId(), jobId: h.jobId, itemId: h.itemId ?? null, personId: h.personId !== undefined ? h.personId : personId, at, kind: h.kind, detail: h.detail ?? {} });
  }
  setState({ ...state, ...next, activity: entries.length > 0 ? [...state.activity, ...entries] : state.activity });
}

/** What only an admin may do, refused the way the database refuses it. */
function adminOnly(): void {
  if (!isAdmin(state.me)) throw new Error('Only an admin can change that.');
}

/**
 * Assigning puts the person on the job's team, as the database does: on it as Field when they were
 * not on it already.
 */
function joinTeams(items: Item[]): { team: TeamMember[]; happened: Happened[] } {
  let team = state.team;
  const happened: Happened[] = [];
  for (const i of items) {
    if (!i.assignedTo || team.some((t) => t.jobId === i.jobId && t.personId === i.assignedTo)) continue;
    team = [...team, { id: randomUUID(), jobId: i.jobId, personId: i.assignedTo, part: 'field' }];
    happened.push({ jobId: i.jobId, kind: 'team_added', detail: { person_id: i.assignedTo, part: 'field' } });
  }
  return { team, happened };
}

/** Saves items, with whoever they are now assigned to on the team. */
function commitItems(items: Item[], next: Partial<SampleState> = {}, happened: Happened[] = []): void {
  const joined = joinTeams(items.filter((i) => i.assignedTo && state.items.find((x) => x.id === i.id)?.assignedTo !== i.assignedTo));
  commit({ ...next, items, team: joined.team }, [...happened, ...joined.happened]);
}

/** A template's name as the database keeps it: trimmed, one space between words, and its own among the templates in use. */
function templateName(name: string, id: string | null): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new Error('Give the template a name.');
  if (state.templates.some((t) => t.id !== id && t.active && t.name.toLowerCase() === clean.toLowerCase())) throw new Error('There is a template with that name already.');
  return clean;
}

/** A person as the database keeps them: the email tidied and checked, the name trimmed. */
function checkPerson(p: Pick<Person, 'name' | 'email'>, id: string | null): void {
  if (p.name.trim() === '') throw new Error('Give them a name.');
  if (!isEmail(p.email)) throw new Error('That email does not look right.');
  if (state.people.some((x) => x.id !== id && x.email === p.email)) throw new Error('Someone already has that email.');
}

const visitDetail = (v: { id: string; companyId: string; start: string; days: number; confirmed: boolean }): ActivityDetail => ({
  visit_id: v.id,
  company_id: v.companyId,
  start: v.start,
  days: v.days,
  confirmed: v.confirmed,
});

/** A comment as the database logs it in the job's activity. */
const commentDetail = (c: Comment): ActivityDetail => ({
  comment_id: c.id,
  company_id: c.companyId,
  from_company: c.fromCompany,
  author_name: c.authorName,
  internal: c.internal,
  body: c.body.slice(0, 200),
});

/** A new link's token: 64 random hex characters, never short enough to guess. */
const newToken = () => `${randomUUID()}${randomUUID()}`.replace(/-/g, '').toLowerCase();

const api: DataApi = {
  mode: 'preview',
  useMe: () => {
    const s = useStore();
    return s.signedIn ? s.me : null;
  },
  usePeople: () => useStore().people,
  useJobs: () => {
    const s = useStore();
    return useMemo(() => s.jobs.filter((j) => seesJob(s.me, j.id, s.team)), [s.jobs, s.me, s.team]);
  },
  useTemplates: () => useStore().templates,
  useTemplateItems: () => useStore().templateItems,
  useTeams: () => {
    const s = useStore();
    return useMemo(() => s.team.filter((t) => seesJob(s.me, t.jobId, s.team)), [s.team, s.me]);
  },
  useAssigned: (personId) => {
    const s = useStore();
    return useMemo(
      () => s.items.filter((i) => i.assignedTo === personId && i.status !== 'removed' && seesJob(s.me, i.jobId, s.team)),
      [s.items, s.me, s.team, personId],
    );
  },
  useLocations: (jobId) => {
    const s = useStore();
    return useMemo(() => s.locations.filter((l) => l.jobId === jobId), [s.locations, jobId]);
  },
  useItems: (jobId) => {
    const s = useStore();
    return useMemo(() => s.items.filter((i) => i.jobId === jobId), [s.items, jobId]);
  },
  usePhotos: (jobId) => {
    const s = useStore();
    return useMemo(
      () => s.photos.filter((p) => p.jobId === jobId && !p.removed).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
      [s.photos, jobId],
    );
  },
  useTrades: () => useStore().trades,
  useCompanies: () => useStore().companies,
  useContacts: () => useStore().contacts,
  useCompanyLinks: (jobId) => {
    const s = useStore();
    return useMemo(() => s.links.filter((l) => l.jobId === jobId && !l.revoked), [s.links, jobId]);
  },
  useJobCompanies: (jobId) => {
    const s = useStore();
    return useMemo(() => s.jobCompanies.filter((jc) => jc.jobId === jobId), [s.jobCompanies, jobId]);
  },
  useWaitingOnExtras: (jobId) => useStore().waitingOn[jobId] ?? [],
  useTitles: () => useStore().titles,
  useCustomFields: () => useStore().customFields,
  useFormSettings: () => useStore().formSettings,
  useViewSettings: () => useStore().viewSettings,
  useVisits: (jobId) => {
    const s = useStore();
    return useMemo(() => s.visits.filter((v) => v.jobId === jobId && !v.removed), [s.visits, jobId]);
  },
  useSends: (jobId) => {
    const s = useStore();
    return useMemo(() => s.sends.filter((x) => x.jobId === jobId && !x.removed), [s.sends, jobId]);
  },
  useComments: (jobId) => {
    const s = useStore();
    return useMemo(() => s.comments.filter((c) => c.jobId === jobId), [s.comments, jobId]);
  },
  useActivity: (jobId) => {
    const s = useStore();
    return useMemo(() => s.activity.filter((a) => a.jobId === jobId), [s.activity, jobId]);
  },

  async createJob({ name, address, projectManagerId }) {
    adminOnly();
    const id = randomUUID();
    const pm = projectManagerId ? state.people.find((p) => p.id === projectManagerId && p.active) : undefined;
    commit(
      {
        jobs: [...state.jobs, { id, name, address, closed: false }],
        team: pm ? [...state.team, { id: randomUUID(), jobId: id, personId: pm.id, part: 'project_manager' }] : state.team,
        counters: { ...state.counters, [id]: 0 },
      },
      pm ? [{ jobId: id, kind: 'team_added', detail: { person_id: pm.id, part: 'project_manager' } }] : [],
    );
    return id;
  },
  async updateJob(id, patch) {
    adminOnly();
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return;
    const happened: Happened[] = [];
    if (patch.name !== undefined && patch.name !== job.name) happened.push({ jobId: id, kind: 'job_renamed', detail: { from: job.name, to: patch.name } });
    if (patch.address !== undefined && patch.address !== job.address) happened.push({ jobId: id, kind: 'job_address_changed', detail: { from: job.address, to: patch.address } });
    if (patch.closed !== undefined && patch.closed !== job.closed) happened.push({ jobId: id, kind: patch.closed ? 'job_closed' : 'job_reopened' });
    commit({ jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }, happened);
  },
  async addPerson(input) {
    adminOnly();
    const person: Person = { id: randomUUID(), name: input.name.trim(), email: tidyEmail(input.email), phone: input.phone?.trim() || null, role: input.role, sees: input.sees, active: true };
    checkPerson(person, null);
    setState({ ...state, people: [...state.people, person] });
    return person.id;
  },
  async updatePerson(id, patch) {
    adminOnly();
    const was = state.people.find((p) => p.id === id);
    if (!was) return;
    const next: Person = {
      ...was,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : was.name,
      email: patch.email !== undefined ? tidyEmail(patch.email) : was.email,
      phone: patch.phone !== undefined ? patch.phone?.trim() || null : was.phone,
    };
    checkPerson(next, id);
    const people = state.people.map((p) => (p.id === id ? next : p));
    if (!people.some(isAdmin)) throw new Error('Ross Built needs at least one admin. Make someone else an admin first.');
    setState({ ...state, people, me: state.me.id === id ? next : state.me });
  },
  async setTeamMember(jobId, personId, part) {
    adminOnly();
    const was = state.team.find((t) => t.jobId === jobId && t.personId === personId);
    if (part === null) {
      if (!was) return;
      commit({ team: state.team.filter((t) => t !== was) }, [{ jobId, kind: 'team_removed', detail: { person_id: personId, part: was.part } }]);
    } else if (!was) {
      commit({ team: [...state.team, { id: randomUUID(), jobId, personId, part }] }, [{ jobId, kind: 'team_added', detail: { person_id: personId, part } }]);
    } else if (was.part !== part) {
      commit({ team: state.team.map((t) => (t === was ? { ...t, part } : t)) }, [
        { jobId, kind: 'team_changed', detail: { person_id: personId, part, was_part: was.part } },
      ]);
    }
  },
  async addTemplate({ name, items = [] }) {
    adminOnly();
    const id = randomUUID();
    const clean = templateName(name, null);
    const ids = new Map(items.map((i) => [i.key, randomUUID()]));
    const tasks = items.map((i, n) => ({
      id: ids.get(i.key)!,
      templateId: id,
      title: tidyTitle(i.title),
      description: i.description.trim(),
      kind: i.kind,
      tradeId: i.tradeId,
      hours: i.hours,
      place: i.place,
      waitsOn: i.waitsOn.flatMap((k) => (ids.has(k) ? [ids.get(k)!] : [])),
      sortOrder: n + 1,
      active: true,
    }));
    const sortOrder = Math.max(0, ...state.templates.map((t) => t.sortOrder)) + 1;
    setState({ ...state, templates: [...state.templates, { id, name: clean, active: true, sortOrder }], templateItems: [...state.templateItems, ...tasks] });
    return id;
  },
  async updateTemplate(id, patch) {
    adminOnly();
    const was = state.templates.find((t) => t.id === id);
    if (!was) return;
    const name = patch.name !== undefined ? templateName(patch.name, id) : was.name;
    if (patch.active === true && !was.active) templateName(was.name, id);
    setState({ ...state, templates: state.templates.map((t) => (t.id === id ? { ...t, ...patch, name } : t)) });
  },
  async addTemplateItem(templateId, input) {
    adminOnly();
    const title = tidyTitle(input.title);
    if (title === '') throw new Error('Give the task a title.');
    const id = randomUUID();
    const sortOrder = Math.max(0, ...state.templateItems.filter((t) => t.templateId === templateId).map((t) => t.sortOrder)) + 1;
    const own = new Set(state.templateItems.filter((t) => t.templateId === templateId).map((t) => t.id));
    const task = { ...input, id, templateId, title, description: input.description.trim(), waitsOn: [...new Set(input.waitsOn)].filter((w) => own.has(w)), sortOrder, active: true };
    setState({ ...state, templateItems: [...state.templateItems, task] });
    return id;
  },
  async updateTemplateItem(id, patch) {
    adminOnly();
    const was = state.templateItems.find((t) => t.id === id);
    if (!was) return;
    const title = patch.title !== undefined ? tidyTitle(patch.title) : was.title;
    if (title === '') throw new Error('Give the task a title.');
    const own = new Set(state.templateItems.filter((t) => t.templateId === was.templateId && t.id !== id).map((t) => t.id));
    const waitsOn = patch.waitsOn !== undefined ? [...new Set(patch.waitsOn)].filter((w) => own.has(w)) : was.waitsOn;
    setState({ ...state, templateItems: state.templateItems.map((t) => (t.id === id ? { ...t, ...patch, title, waitsOn } : t)) });
  },
  previewAs(personId) {
    const person = state.people.find((p) => p.id === personId && p.active);
    if (person) setState({ ...state, me: person });
  },
  async addLocations(jobId, parsed) {
    adminOnly();
    const existing = state.locations.filter((l) => l.jobId === jobId);
    const byLabel = new Map(existing.map((l) => [l.label.toLowerCase(), l]));
    // One removed before comes back where it was.
    const back = new Set(
      parsed.flatMap((p) => {
        const was = byLabel.get(p.label.toLowerCase());
        return was && !was.active ? [was.id] : [];
      }),
    );
    let order = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0);
    const added = parsed
      .filter((p) => !byLabel.has(p.label.toLowerCase()))
      .map((p) => ({ ...p, id: randomUUID(), jobId, active: true, sortOrder: ++order, walkedAt: null }));
    commit({ locations: [...state.locations.map((l) => (back.has(l.id) ? { ...l, active: true } : l)), ...added] }, [
      ...added.map((l): Happened => ({ jobId, kind: 'location_added', detail: { location_id: l.id, label: l.label } })),
      ...existing.filter((l) => back.has(l.id)).map((l): Happened => ({ jobId, kind: 'location_restored', detail: { location_id: l.id, label: l.label } })),
    ]);
    return added.length + back.size;
  },
  async setWalked(locationIds, walked) {
    const on = new Set(locationIds);
    const at = walked ? now() : null;
    setState({ ...state, locations: state.locations.map((l) => (on.has(l.id) ? { ...l, walkedAt: at } : l)) });
  },
  async reorderLocations(jobId, orderedIds) {
    adminOnly();
    const moving = orderedIds.map((id) => state.locations.find((l) => l.id === id && l.jobId === jobId)).filter((l) => l !== undefined);
    const places = moving.map((l) => l.sortOrder).sort((a, b) => a - b);
    const next = new Map(moving.map((l, i) => [l.id, places[i]!]));
    setState({ ...state, locations: state.locations.map((l) => (next.has(l.id) ? { ...l, sortOrder: next.get(l.id)! } : l)) });
  },
  async updateLocation(id, patch) {
    adminOnly();
    const was = state.locations.find((l) => l.id === id);
    if (!was) return;
    const happened: Happened[] = [];
    if (patch.label !== undefined && patch.label !== was.label) {
      happened.push({ jobId: was.jobId, kind: 'location_renamed', detail: { location_id: id, from: was.label, to: patch.label } });
    }
    if (patch.active !== undefined && patch.active !== was.active) {
      happened.push({ jobId: was.jobId, kind: patch.active ? 'location_restored' : 'location_removed', detail: { location_id: id, label: patch.label ?? was.label } });
    }
    commit({ locations: state.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) }, happened);
  },
  async createItem(input: NewItem) {
    const id = randomUUID();
    const number = (state.counters[input.jobId] ?? 0) + 1;
    const item: Item = {
      ...input,
      id,
      number,
      btExternalId: null,
      createdBy: state.me.id,
      createdAt: now(),
      updatedAt: now(),
    };
    // A standard title used again moves up the suggestions.
    const key = item.title.toLowerCase();
    const titles = state.titles.map((t) => (t.title.toLowerCase() === key ? { ...t, uses: t.uses + 1 } : t));
    commitItems([...state.items, tradeFollows(item)], { titles, counters: { ...state.counters, [input.jobId]: number } });
    return id;
  },
  async addItems(planned) {
    const counters = { ...state.counters };
    const made: Item[] = planned.map((p) => {
      const number = (counters[p.jobId] ?? 0) + 1;
      counters[p.jobId] = number;
      return tradeFollows({ ...p, number, position: null, btExternalId: null, createdBy: state.me.id, createdAt: now(), updatedAt: now() });
    });
    // Each standard title used again moves up the suggestions.
    const used = new Map<string, number>();
    for (const i of made) used.set(i.title.toLowerCase(), (used.get(i.title.toLowerCase()) ?? 0) + 1);
    const titles = state.titles.map((t) => (used.has(t.title.toLowerCase()) ? { ...t, uses: t.uses + used.get(t.title.toLowerCase())! } : t));
    commitItems([...state.items, ...made], { titles, counters });
    return made.map((i) => i.id);
  },
  async updateItem(id: string, patch: ItemPatch) {
    commitItems(settle(state.items, state.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i))));
  },
  async updateItems(changes) {
    const byId = new Map(changes.map((c) => [c.id, c.patch]));
    commitItems(settle(state.items, state.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id), updatedAt: now() } : i))));
  },
  async addVisit({ itemIds, note, ...input }) {
    const id = randomUUID();
    const visit: Visit = {
      ...input,
      id,
      note: note ?? '',
      removed: false,
      askedStart: null,
      askedDays: null,
      askedName: null,
      askedAt: null,
      createdBy: state.me.id,
      createdAt: now(),
      updatedAt: now(),
    };
    const on = new Set(itemIds);
    commit(
      {
        visits: [...state.visits, visit],
        items: state.items.map((i) => (on.has(i.id) ? { ...i, visitId: id, updatedAt: now() } : i)),
      },
      [{ jobId: visit.jobId, kind: 'visit_added', detail: visitDetail(visit) }],
    );
    return id;
  },
  async updateVisit(id, patch, itemIds) {
    const was = state.visits.find((v) => v.id === id);
    if (!was) return;
    const changed = { ...was, ...patch, updatedAt: now() };
    // New dates, or confirming it, answer what the company asked for, as the database does.
    const answered = changed.start !== was.start || changed.days !== was.days || (changed.confirmed && !was.confirmed);
    const visit = answered ? { ...changed, askedStart: null, askedDays: null, askedName: null, askedAt: null } : changed;
    const on = itemIds ? new Set(itemIds) : null;
    const moved = visit.start !== was.start || visit.days !== was.days || visit.confirmed !== was.confirmed;
    commit(
      {
        visits: state.visits.map((v) => (v.id === id ? visit : v)),
        items: on
          ? state.items.map((i) =>
              on.has(i.id) && i.visitId !== id
                ? { ...i, visitId: id, updatedAt: now() }
                : !on.has(i.id) && i.visitId === id
                  ? { ...i, visitId: null, updatedAt: now() }
                  : i,
            )
          : state.items,
      },
      moved
        ? [{ jobId: was.jobId, kind: 'visit_changed', detail: { ...visitDetail(visit), was_start: was.start, was_days: was.days, was_confirmed: was.confirmed } }]
        : [],
    );
  },
  async keepVisitDates(id) {
    commit({ visits: state.visits.map((v) => (v.id === id ? { ...v, askedStart: null, askedDays: null, askedName: null, askedAt: null, updatedAt: now() } : v)) });
  },
  async companyConfirmVisit({ visitId, name }) {
    const was = state.visits.find((v) => v.id === visitId && !v.removed);
    if (!was) throw new Error('That visit is not on this list');
    const visit = { ...was, confirmed: true, askedStart: null, askedDays: null, askedName: null, askedAt: null, updatedAt: now() };
    commit({ visits: state.visits.map((v) => (v.id === visitId ? visit : v)) }, [
      { jobId: was.jobId, kind: 'visit_confirmed_by_company', detail: { ...visitDetail(visit), from_company: true, author_name: tidyName(name) }, personId: null },
    ]);
  },
  async companyAskVisit({ visitId, start, days, name }) {
    const was = state.visits.find((v) => v.id === visitId && !v.removed);
    if (!was) throw new Error('That visit is not on this list');
    const visit = { ...was, confirmed: false, askedStart: start, askedDays: Math.max(1, days), askedName: tidyName(name), askedAt: now(), updatedAt: now() };
    commit({ visits: state.visits.map((v) => (v.id === visitId ? visit : v)) }, [
      {
        jobId: was.jobId,
        kind: 'visit_change_asked',
        detail: { visit_id: was.id, company_id: was.companyId, start, days: Math.max(1, days), was_start: was.start, was_days: was.days, from_company: true, author_name: tidyName(name) },
        personId: null,
      },
    ]);
  },
  async removeVisit(id) {
    const was = state.visits.find((v) => v.id === id);
    if (!was) return;
    commit(
      {
        visits: state.visits.map((v) => (v.id === id ? { ...v, removed: true, updatedAt: now() } : v)),
        items: state.items.map((i) => (i.visitId === id ? { ...i, visitId: null, updatedAt: now() } : i)),
      },
      [{ jobId: was.jobId, kind: 'visit_removed', detail: visitDetail(was) }],
    );
  },
  async addComment({ jobId, itemId, companyId, body, internal }) {
    const text = tidyComment(body);
    if (text === '') return '';
    const item = itemId ? state.items.find((i) => i.id === itemId) : undefined;
    const comment: Comment = {
      id: randomUUID(),
      jobId,
      itemId,
      // An item's comment is with the company doing the item, as the database keeps it.
      companyId: item ? item.companyId : (companyId ?? null),
      body: text,
      personId: state.me.id,
      fromCompany: false,
      authorName: null,
      internal,
      removed: false,
      createdAt: now(),
    };
    commit({ comments: [...state.comments, comment] }, [{ jobId, itemId, kind: 'comment_added', detail: commentDetail(comment) }]);
    return comment.id;
  },
  async setCommentRemoved(id, removed) {
    const was = state.comments.find((c) => c.id === id);
    if (!was || was.personId !== state.me.id) return;
    setState({ ...state, comments: state.comments.map((c) => (c.id === id ? { ...c, removed } : c)) });
  },
  async addCompanyComment({ jobId, companyId, itemId, body, name }) {
    const text = tidyComment(body);
    if (text === '') return '';
    if (itemId && !state.items.some((i) => i.id === itemId && i.jobId === jobId && i.companyId === companyId)) throw new Error('That item is not on this list');
    const comment: Comment = {
      id: randomUUID(),
      jobId,
      itemId,
      companyId,
      body: text,
      personId: null,
      fromCompany: true,
      authorName: tidyName(name),
      internal: false,
      removed: false,
      createdAt: now(),
    };
    commit({ comments: [...state.comments, comment] }, [{ jobId, itemId, kind: 'comment_added', detail: commentDetail(comment), personId: null }]);
    return comment.id;
  },
  async recordSend({ jobId, list, itemIds, snapshot }) {
    const id = randomUUID();
    commit({ sends: [...state.sends, { id, jobId, list, itemIds, sentAt: now(), sentBy: state.me.id, removed: false, snapshot: snapshot ?? null }] }, [
      { jobId, kind: 'list_sent', detail: { list, items: itemIds.length } },
    ]);
    return id;
  },
  async undoSend(id) {
    const was = state.sends.find((x) => x.id === id);
    if (!was || was.removed) return;
    commit({ sends: state.sends.map((x) => (x.id === id ? { ...x, removed: true } : x)) }, [{ jobId: was.jobId, kind: 'list_undone', detail: { list: was.list } }]);
  },
  async addPhotos(list) {
    const added: Photo[] = [];
    for (const p of list) {
      const id = randomUUID();
      const order = Math.max(0, ...state.photos.filter((x) => x.itemId === p.itemId).map((x) => x.sortOrder), ...added.filter((x) => x.itemId === p.itemId).map((x) => x.sortOrder));
      added.push({
        id,
        jobId: p.jobId,
        itemId: p.itemId,
        uri: await keepPhoto(p.uri, id),
        storagePath: null,
        width: p.width,
        height: p.height,
        marks: p.marks,
        sortOrder: order + 1,
        removed: false,
        createdBy: state.me.id,
        createdAt: now(),
      });
    }
    commit(
      { photos: [...state.photos, ...added] },
      added.map((p) => ({ jobId: p.jobId, itemId: p.itemId, kind: 'photo_added', detail: { photo_id: p.id } })),
    );
  },
  async updatePhoto(id, patch) {
    const was = state.photos.find((p) => p.id === id);
    if (!was) return;
    const happened: Happened[] = [];
    if (patch.removed && !was.removed) happened.push({ jobId: was.jobId, itemId: was.itemId, kind: 'photo_removed', detail: { photo_id: id } });
    else if (patch.marks && JSON.stringify(patch.marks) !== JSON.stringify(was.marks)) {
      happened.push({ jobId: was.jobId, itemId: was.itemId, kind: 'photo_marked', detail: { photo_id: id } });
    }
    commit({ photos: state.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, happened);
  },
  async addTrade(name) {
    adminOnly();
    const id = randomUUID();
    setState({ ...state, trades: [...state.trades, { id, name, sortOrder: state.trades.length + 1 }] });
    return id;
  },
  async reorderTrades(orderedIds) {
    adminOnly();
    const place = new Map(orderedIds.map((id, i) => [id, i + 1]));
    setState({ ...state, trades: state.trades.map((t) => (place.has(t.id) ? { ...t, sortOrder: place.get(t.id)! } : t)) });
  },
  async addCompany({ name, defaultTradeId }) {
    adminOnly();
    const id = randomUUID();
    setState({ ...state, companies: [...state.companies, { id, name, defaultTradeId, phone: null, email: null, active: true }] });
    return id;
  },
  async addCompanyToJob(jobId, companyId, tradeId) {
    adminOnly();
    if (state.jobCompanies.some((jc) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) return;
    commit({ jobCompanies: [...state.jobCompanies, { jobId, companyId, tradeId }] }, [
      { jobId, kind: 'company_added', detail: { company_id: companyId, trade_id: tradeId } },
    ]);
  },
  async updateCompany(id, patch) {
    adminOnly();
    const was = state.companies.find((c) => c.id === id);
    if (!was) return;
    if (patch.name !== undefined && patch.name.trim() === '') throw new Error('Give the company a name.');
    const renamed = patch.name !== undefined && patch.name !== was.name;
    const holdups = renamed ? new Map(renamedHoldups(state.items, was.name, patch.name!).map((h) => [h.id, h.waitingOn])) : new Map<string, string[]>();
    // The new name shows on every job the company is on.
    const jobs = renamed ? [...new Set(state.jobCompanies.filter((jc) => jc.companyId === id).map((jc) => jc.jobId))] : [];
    commit(
      {
        companies: state.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        items: holdups.size > 0 ? state.items.map((i) => (holdups.has(i.id) ? { ...i, waitingOn: holdups.get(i.id)!, updatedAt: now() } : i)) : state.items,
      },
      jobs.map((jobId) => ({ jobId, kind: 'company_renamed', detail: { company_id: id, from: was.name, to: patch.name! } })),
    );
  },
  async addContact(input) {
    adminOnly();
    const problem = contactProblem(input);
    if (problem) throw new Error(problem);
    const sortOrder = Math.max(0, ...state.contacts.filter((x) => x.companyId === input.companyId).map((x) => x.sortOrder)) + 1;
    const contact: Contact = { ...tidyContact(input), id: randomUUID(), sortOrder, active: true };
    setState({ ...state, contacts: [...state.contacts, contact] });
    return contact.id;
  },
  async updateContact(id, patch) {
    adminOnly();
    const was = state.contacts.find((x) => x.id === id);
    if (!was) return;
    const next = tidyContact({ ...was, ...patch });
    const problem = contactProblem(next);
    if (problem) throw new Error(problem);
    setState({ ...state, contacts: state.contacts.map((x) => (x.id === id ? next : x)) });
  },
  async companyLink(jobId, companyId) {
    const live = state.links.find((l) => l.jobId === jobId && l.companyId === companyId && !l.revoked);
    if (live) return live.token;
    const token = newToken();
    setState({ ...state, links: [...state.links, { token, jobId, companyId, createdAt: now(), revoked: false }] });
    return token;
  },
  async revokeCompanyLink(token) {
    setState({ ...state, links: state.links.map((l) => (l.token === token ? { ...l, revoked: true } : l)) });
  },
  async setJobCompanyTrade(jobId, companyId, fromTradeId, toTradeId) {
    adminOnly();
    if (fromTradeId === toTradeId) return;
    const pair = (tradeId: string) => (jc: { jobId: string; companyId: string; tradeId: string }) =>
      jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId;
    // On the job for the new trade already: the two become one.
    const merging = state.jobCompanies.some(pair(toTradeId));
    const jobCompanies = merging
      ? state.jobCompanies.filter((jc) => !pair(fromTradeId)(jc))
      : state.jobCompanies.map((jc) => (pair(fromTradeId)(jc) ? { ...jc, tradeId: toTradeId } : jc));
    commit(
      {
        jobCompanies,
        items: state.items.map((i) =>
          i.jobId === jobId && i.companyId === companyId && i.tradeId === fromTradeId ? { ...i, tradeId: toTradeId, updatedAt: now() } : i,
        ),
      },
      [
        merging
          ? { jobId, kind: 'company_removed', detail: { company_id: companyId, trade_id: fromTradeId } }
          : { jobId, kind: 'company_trade_changed', detail: { company_id: companyId, from: fromTradeId, to: toTradeId } },
      ],
    );
  },
  async removeCompanyFromJob(jobId, companyId, tradeId) {
    adminOnly();
    if (!state.jobCompanies.some((jc) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) return;
    commit({ jobCompanies: state.jobCompanies.filter((jc) => !(jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) }, [
      { jobId, kind: 'company_removed', detail: { company_id: companyId, trade_id: tradeId } },
    ]);
  },
  async setWaitingOnExtras(jobId, labels) {
    setState({ ...state, waitingOn: { ...state.waitingOn, [jobId]: labels } });
  },
  async addTitle({ title, tradeId, hours }) {
    adminOnly();
    const id = randomUUID();
    setState({ ...state, titles: [...state.titles, { id, title, tradeId, uses: 0, approved: true, hours: hours ?? null, rooms: [] }] });
    return id;
  },
  async updateTitle(id, patch) {
    adminOnly();
    setState({ ...state, titles: state.titles.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  },
  async addCustomField({ label, kind, options }) {
    adminOnly();
    const id = randomUUID();
    const sortOrder = Math.max(0, ...state.customFields.map((f) => f.sortOrder)) + 1;
    setState({ ...state, customFields: [...state.customFields, { id, label, kind, options, sortOrder, active: true }] });
    return id;
  },
  async updateCustomField(id, patch) {
    adminOnly();
    setState({ ...state, customFields: state.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  },
  async setFormSettings(formSettings) {
    setState({ ...state, formSettings });
  },
  async setViewSettings(viewSettings) {
    setState({ ...state, viewSettings });
  },
  async sendSignInCode(email) {
    const clean = tidyEmail(email);
    if (!isEmail(clean)) throw new Error('That email does not look right.');
    // As the server does: a code only for someone Ross Built has added and not switched off.
    if (!state.people.some((p) => p.active && p.email === clean)) throw new Error('That email is not set up at Ross Built. Ask an admin to add you under People.');
    setState({ ...state, codeFor: clean });
  },
  async verifySignInCode(email, code) {
    const clean = tidyEmail(email);
    const person = state.people.find((p) => p.active && p.email === clean);
    // The preview sends no email: any six digits sign in.
    if (!person || state.codeFor !== clean) throw new Error('Send a code to that email first.');
    if (!/^\d{6}$/.test(code.trim())) throw new Error('That code did not work. Check it, or send a new one.');
    setState({ ...state, me: person, signedIn: true, codeFor: null });
  },
  async signOut() {
    // What was on the phone is cleared, as it is on the iPhone.
    setState({ ...sampleState(), signedIn: false });
  },
};

export function DataProvider({ children }: { children: ReactNode }) {
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}
