// The app's data rules, the same on the preview page and on the iPhone: what every change does
// (the trade follows the company, a ready item waits on nothing, a task done frees what waited on
// it, what an admin alone may change, and the checks on names and emails). Where the changes are
// kept is up to the backend: in memory on the preview page, in the phone's database on the iPhone,
// which sends them up. There the database numbers items, puts whoever an item is assigned to on the
// job's team, counts how often each standard title is used, and keeps the log; the preview does it
// all itself.

import { randomUUID } from 'expo-crypto';
import { useMemo, useSyncExternalStore } from 'react';
import {
  companyNameProblem,
  contactProblem,
  inWalkOrder,
  isAdmin,
  isEmail,
  moveToLevel,
  parseRoomList,
  readingOrder,
  mergedWaits,
  releasedBy,
  renamedHoldups,
  seesJob,
  tidyComment,
  tidyCompanyName,
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
  type Location,
  type Person,
  type Photo,
  type PlanSheet,
  type TeamMember,
  type Visit,
} from '@punch/core';
import type { DataApi, ItemPatch, NewItem, SyncInfo } from './api';
import type { SampleState } from './sample';
import { addSampleJob } from './sampleJob';

export type State = SampleState;

/** Something that happened, besides an item's fields changing: who and when are added when it is logged. */
export interface Happened {
  jobId: string;
  itemId?: string | null;
  kind: Exclude<ActivityKind, 'item_created' | 'item_changed'>;
  detail?: ActivityDetail;
  /** Someone other than the signed-in person: null for the company, on its page. */
  personId?: string | null;
}

/** Where the changes are kept. */
export interface Keeper {
  mode: DataApi['mode'];
  /**
   * The server numbers items, puts whoever an item is assigned to on the job's team, counts how
   * often each standard title is used and keeps the log, so the app leaves those to it.
   */
  server: boolean;
  get(): State;
  subscribe(listener: () => void): () => void;
  /**
   * Keeps the parts of the state that changed. What happened is for the preview's log; the database
   * keeps its own. From the company's page, an item's changes are not logged as anyone's.
   */
  save(next: Partial<State>, happened?: Happened[], options?: { fromCompany?: boolean }): void | Promise<void>;
  /** Keeps a new photo's picture where it can be shown from, named for the photo. */
  keepPhoto(uri: string, id: string): Promise<string>;
}

/** What differs between the backends besides where the changes are kept. */
export type Extras = Pick<DataApi, 'sendSignInCode' | 'verifySignInCode' | 'signOut' | 'startCompany' | 'deleteAccount'> &
  Partial<Pick<DataApi, 'useMe' | 'useActivity' | 'useUpdates' | 'useSync' | 'clearRefused' | 'addCompanyComment' | 'companyConfirmVisit' | 'companyAskVisit' | 'companyMarkDone' | 'previewAs' | 'deleteJob' | 'jobStation' | 'mergeItems'>>;

const now = () => new Date().toISOString();

/** How many of the latest updates the Updates list keeps. */
export const UPDATES_KEPT = 300;

/** Newest first; two things done in the same moment keep the order they happened in. */
export function latestFirst(entries: readonly Activity[]): Activity[] {
  return [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id.localeCompare(a.id)));
}

/**
 * The trade follows the company, as the database has it: a trade the company does on the job stays,
 * otherwise the first one it does there, or its usual trade.
 */
function tradeFollows(state: State, item: Item): Item {
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
function settle(state: State, before: Item[], after: Item[]): Item[] {
  const was = new Map(before.map((i) => [i.id, i]));
  let items = after.map((i) => (was.get(i.id) === i ? i : tradeFollows(state, i))).map((i) =>
    i.ready && (i.waitingOn.length > 0 || i.waitingOnItems.length > 0 || i.readyBy !== null) ? { ...i, waitingOn: [], waitingOnItems: [], readyBy: null } : i,
  );
  // Completed: the company's word that it is done is answered (Undo puts it back). Off the plan, no pin.
  const wasComplete = new Set(before.filter((i) => i.status === 'complete').map((i) => i.id));
  items = items.map((i) => (i.status === 'complete' && !wasComplete.has(i.id) && i.markedDoneAt ? { ...i, markedDoneAt: null } : i));
  items = items.map((i) => (!i.planId && (i.pinX != null || i.pinY != null) ? { ...i, pinX: null, pinY: null } : i));
  // A company's confirmation is for the work as it was: changing what it is, where, who does it,
  // when it is ready or how long it takes, or opening it again, takes it back (as the database does).
  items = items.map((i) => {
    const b = was.get(i.id);
    if (!b || b === i || !i.confirmedAt || !b.confirmedAt) return i;
    const changed =
      i.title !== b.title ||
      i.description !== b.description ||
      i.locationId !== b.locationId ||
      i.companyId !== b.companyId ||
      i.readyBy !== b.readyBy ||
      i.hours !== b.hours ||
      (i.status === 'open' && b.status !== 'open');
    return changed ? { ...i, confirmedAt: null } : i;
  });
  const wasOpen = new Set(before.filter((i) => i.status === 'open').map((i) => i.id));
  for (const done of items.filter((i) => wasOpen.has(i.id) && i.status !== 'open')) {
    const freed = new Map(releasedBy(done.id, items).map((r) => [r.item.id, r.patch]));
    if (freed.size > 0) items = items.map((i) => (freed.has(i.id) ? { ...i, ...freed.get(i.id)!, updatedAt: now() } : i));
  }
  return items;
}

/** What only an admin may do, refused the way the database refuses it. */
function adminOnly(state: State): void {
  if (!isAdmin(state.me)) throw new Error('Only an admin can change that.');
}

/**
 * Assigning puts the person on the job's team, as the database does: on it as Field when they were
 * not on it already.
 */
function joinTeams(state: State, items: Item[]): { team: TeamMember[]; happened: Happened[] } {
  let team = state.team;
  const happened: Happened[] = [];
  for (const i of items) {
    if (!i.assignedTo || team.some((t) => t.jobId === i.jobId && t.personId === i.assignedTo)) continue;
    team = [...team, { id: randomUUID(), jobId: i.jobId, personId: i.assignedTo, part: 'field' }];
    happened.push({ jobId: i.jobId, kind: 'team_added', detail: { person_id: i.assignedTo, part: 'field' } });
  }
  return { team, happened };
}

/** A template's name as the database keeps it: trimmed, one space between words, and its own among the templates in use. */
function templateName(state: State, name: string, id: string | null): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new Error('Give the template a name.');
  if (state.templates.some((t) => t.id !== id && t.active && t.name.toLowerCase() === clean.toLowerCase())) throw new Error('There is a template with that name already.');
  return clean;
}

/** A person as the database keeps them: the email tidied and checked, the name trimmed. */
function checkPerson(state: State, p: Pick<Person, 'name' | 'email'>, id: string | null): void {
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

/**
 * The locations with one job's put in this order and numbered from 1 (the walk order); every other
 * job's as they were. New ones go on the end of the list.
 */
function numbered(all: Location[], ordered: Location[]): Location[] {
  const placed = new Map(ordered.map((l, i) => [l.id, l.sortOrder === i + 1 ? l : { ...l, sortOrder: i + 1 }]));
  const had = new Set(all.map((l) => l.id));
  return [...all.map((l) => placed.get(l.id) ?? l), ...ordered.filter((l) => !had.has(l.id)).map((l) => placed.get(l.id)!)];
}

export function makeApi(keeper: Keeper, extras: Extras): DataApi {
  const get = keeper.get;
  /** The preview's station links, by job. */
  const stations = new Map<string, string>();
  const save = (next: Partial<State>, happened: Happened[] = []) => keeper.save(next, happened);
  const useStore = (): State => useSyncExternalStore(keeper.subscribe, get, get);

  /** Saves items, with whoever they are now assigned to on the team (on the phone, the database does that). */
  const saveItems = async (items: Item[], next: Partial<State> = {}, happened: Happened[] = []) => {
    const state = get();
    if (keeper.server) return save({ ...next, items }, happened);
    const joined = joinTeams(state, items.filter((i) => i.assignedTo && state.items.find((x) => x.id === i.id)?.assignedTo !== i.assignedTo));
    return save({ ...next, items, team: joined.team }, [...happened, ...joined.happened]);
  };

  const api: DataApi = {
    mode: keeper.mode,
    useMe:
      extras.useMe ??
      (() => {
        const s = useStore();
        return s.signedIn ? s.me : null;
      }),
    useOrg: () => useStore().org,
    useNewAccount: () => useStore().newAccount,
    async renameOrg(name) {
      const state = get();
      adminOnly(state);
      const problem = companyNameProblem(name);
      if (problem) throw new Error(`${problem}.`);
      const clean = tidyCompanyName(name);
      if (clean === state.org.name) return;
      await save({ org: { ...state.org, name: clean } });
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
    useAllItems: () => useStore().items,
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
    useWaitingOnExtras: (jobId) => useStore().waitingOn[jobId] ?? NO_LABELS,
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
    useActivity:
      extras.useActivity ??
      ((jobId) => {
        const s = useStore();
        return useMemo(() => s.activity.filter((a) => a.jobId === jobId), [s.activity, jobId]);
      }),
    useUpdates:
      extras.useUpdates ??
      (() => {
        const s = useStore();
        return useMemo(() => latestFirst(s.activity).slice(0, UPDATES_KEPT), [s.activity]);
      }),

    addSampleJob: (photos) => addSampleJob(api, get, photos),
    async createJob({ name, address, projectManagerId, from }) {
      const state = get();
      adminOnly(state);
      const id = randomUUID();
      const pm = projectManagerId ? state.people.find((p) => p.id === projectManagerId && p.active) : undefined;
      // Another job's setup to start with: its companies and Waiting On choices, its team (anyone
      // still switched on, and not the Project Manager twice), and its locations, none walked yet.
      const source = from ? state.jobs.find((j) => j.id === from.jobId) : undefined;
      // Each a new row: the database gives it its own id.
      const companies = source && from?.companies ? state.jobCompanies.filter((jc) => jc.jobId === source.id).map((jc) => ({ jobId: id, companyId: jc.companyId, tradeId: jc.tradeId })) : [];
      const waiting = source && from?.companies ? (state.waitingOn[source.id] ?? []) : [];
      const team: TeamMember[] = [
        ...(pm ? [{ id: randomUUID(), jobId: id, personId: pm.id, part: 'project_manager' as const }] : []),
        ...(source && from?.team
          ? state.team
              .filter((t) => t.jobId === source.id && t.personId !== pm?.id && state.people.some((p) => p.id === t.personId && p.active))
              .map((t) => ({ ...t, id: randomUUID(), jobId: id }))
          : []),
      ];
      const locations =
        source && from?.locations
          ? state.locations
              .filter((l) => l.jobId === source.id && l.active)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((l) => ({ ...l, id: randomUUID(), jobId: id, walkedAt: null }))
          : [];
      await save(
        {
          jobs: [...state.jobs, { id, name, address, closed: false }],
          team: [...state.team, ...team],
          jobCompanies: companies.length > 0 ? [...state.jobCompanies, ...companies] : state.jobCompanies,
          locations: locations.length > 0 ? numbered(state.locations, locations) : state.locations,
          waitingOn: waiting.length > 0 ? { ...state.waitingOn, [id]: [...waiting] } : state.waitingOn,
          ...(keeper.server ? {} : { counters: { ...state.counters, [id]: 0 } }),
        },
        [
          ...team.map((t): Happened => ({ jobId: id, kind: 'team_added', detail: { person_id: t.personId, part: t.part } })),
          ...companies.map((jc): Happened => ({ jobId: id, kind: 'company_added', detail: { company_id: jc.companyId, trade_id: jc.tradeId } })),
          ...locations.map((l): Happened => ({ jobId: id, kind: 'location_added', detail: { location_id: l.id, label: l.label } })),
        ],
      );
      return id;
    },
    async updateJob(id, patch) {
      const state = get();
      adminOnly(state);
      const job = state.jobs.find((j) => j.id === id);
      if (!job) return;
      const happened: Happened[] = [];
      if (patch.name !== undefined && patch.name !== job.name) happened.push({ jobId: id, kind: 'job_renamed', detail: { from: job.name, to: patch.name } });
      if (patch.address !== undefined && patch.address !== job.address) happened.push({ jobId: id, kind: 'job_address_changed', detail: { from: job.address, to: patch.address } });
      if (patch.closed !== undefined && patch.closed !== job.closed) happened.push({ jobId: id, kind: patch.closed ? 'job_closed' : 'job_reopened' });
      await save({ jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }, happened);
    },
    // The preview keeps each job's station link in memory: its page is the sample station.
    jobStation:
      extras.jobStation ??
      (async (jobId, action) => {
        if (!get().jobs.some((j) => j.id === jobId)) throw new Error('That job is not here.');
        if (action === 'new' || action === 'off') stations.delete(jobId);
        if (action === 'off') return null;
        if (!stations.has(jobId) && (action === 'make' || action === 'new')) stations.set(jobId, newToken());
        return stations.get(jobId) ?? null;
      }),
    deleteJob:
      extras.deleteJob ??
      (async (id) => {
        const state = get();
        adminOnly(state);
        if (!state.jobs.some((j) => j.id === id)) return;
        const onJob = <T extends { jobId: string }>(rows: T[]) => rows.filter((r) => r.jobId !== id);
        const { [id]: _counter, ...counters } = state.counters;
        const { [id]: _waiting, ...waitingOn } = state.waitingOn;
        await save({
          jobs: state.jobs.filter((j) => j.id !== id),
          team: onJob(state.team),
          locations: onJob(state.locations),
          links: onJob(state.links),
          jobCompanies: onJob(state.jobCompanies),
          items: onJob(state.items),
          photos: onJob(state.photos),
          plans: onJob(state.plans),
          visits: onJob(state.visits),
          sends: onJob(state.sends),
          comments: onJob(state.comments),
          activity: onJob(state.activity),
          waitingOn,
          counters,
        });
      }),
    async addPerson(input) {
      const state = get();
      adminOnly(state);
      const person: Person = { id: randomUUID(), name: input.name.trim(), email: tidyEmail(input.email), phone: input.phone?.trim() || null, role: input.role, sees: input.sees, active: true };
      checkPerson(state, person, null);
      await save({ people: [...state.people, person] });
      return person.id;
    },
    async updatePerson(id, patch) {
      const state = get();
      adminOnly(state);
      const was = state.people.find((p) => p.id === id);
      if (!was) return;
      const next: Person = {
        ...was,
        ...patch,
        name: patch.name !== undefined ? patch.name.trim() : was.name,
        email: patch.email !== undefined ? tidyEmail(patch.email) : was.email,
        phone: patch.phone !== undefined ? patch.phone?.trim() || null : was.phone,
      };
      checkPerson(state, next, id);
      const people = state.people.map((p) => (p.id === id ? next : p));
      if (!people.some(isAdmin)) throw new Error('Your company needs at least one admin. Make someone else an admin first.');
      await save({ people, me: state.me.id === id ? next : state.me });
    },
    async setTeamMember(jobId, personId, part) {
      const state = get();
      adminOnly(state);
      const was = state.team.find((t) => t.jobId === jobId && t.personId === personId);
      if (part === null) {
        if (!was) return;
        await save({ team: state.team.filter((t) => t !== was) }, [{ jobId, kind: 'team_removed', detail: { person_id: personId, part: was.part } }]);
      } else if (!was) {
        await save({ team: [...state.team, { id: randomUUID(), jobId, personId, part }] }, [{ jobId, kind: 'team_added', detail: { person_id: personId, part } }]);
      } else if (was.part !== part) {
        await save({ team: state.team.map((t) => (t === was ? { ...t, part } : t)) }, [{ jobId, kind: 'team_changed', detail: { person_id: personId, part, was_part: was.part } }]);
      }
    },
    async addTemplate({ name, items = [] }) {
      const state = get();
      adminOnly(state);
      const id = randomUUID();
      const clean = templateName(state, name, null);
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
      await save({ templates: [...state.templates, { id, name: clean, active: true, sortOrder }], templateItems: [...state.templateItems, ...tasks] });
      return id;
    },
    async updateTemplate(id, patch) {
      const state = get();
      adminOnly(state);
      const was = state.templates.find((t) => t.id === id);
      if (!was) return;
      const name = patch.name !== undefined ? templateName(state, patch.name, id) : was.name;
      if (patch.active === true && !was.active) templateName(state, was.name, id);
      await save({ templates: state.templates.map((t) => (t.id === id ? { ...t, ...patch, name } : t)) });
    },
    async addTemplateItem(templateId, input) {
      const state = get();
      adminOnly(state);
      const title = tidyTitle(input.title);
      if (title === '') throw new Error('Give the task a title.');
      const id = randomUUID();
      const sortOrder = Math.max(0, ...state.templateItems.filter((t) => t.templateId === templateId).map((t) => t.sortOrder)) + 1;
      const own = new Set(state.templateItems.filter((t) => t.templateId === templateId).map((t) => t.id));
      const task = { ...input, id, templateId, title, description: input.description.trim(), waitsOn: [...new Set(input.waitsOn)].filter((w) => own.has(w)), sortOrder, active: true };
      await save({ templateItems: [...state.templateItems, task] });
      return id;
    },
    async updateTemplateItem(id, patch) {
      const state = get();
      adminOnly(state);
      const was = state.templateItems.find((t) => t.id === id);
      if (!was) return;
      const title = patch.title !== undefined ? tidyTitle(patch.title) : was.title;
      if (title === '') throw new Error('Give the task a title.');
      const own = new Set(state.templateItems.filter((t) => t.templateId === was.templateId && t.id !== id).map((t) => t.id));
      const waitsOn = patch.waitsOn !== undefined ? [...new Set(patch.waitsOn)].filter((w) => own.has(w)) : was.waitsOn;
      await save({ templateItems: state.templateItems.map((t) => (t.id === id ? { ...t, ...patch, title, waitsOn } : t)) });
    },
    previewAs: extras.previewAs,
    async addLocations(jobId, parsed) {
      const state = get();
      adminOnly(state);
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
      const job = [...existing.map((l) => (back.has(l.id) ? { ...l, active: true } : l)), ...added];
      await save({ locations: numbered(state.locations, inWalkOrder(job)) }, [
        ...added.map((l): Happened => ({ jobId, kind: 'location_added', detail: { location_id: l.id, label: l.label } })),
        ...existing.filter((l) => back.has(l.id)).map((l): Happened => ({ jobId, kind: 'location_restored', detail: { location_id: l.id, label: l.label } })),
      ]);
      return added.length + back.size;
    },
    async addLocation(jobId, name, floor = null) {
      const state = get();
      if (!seesJob(state.me, jobId, state.team)) throw new Error('You are not on this job.');
      const parsed = parseRoomList(name).locations[0];
      if (!parsed) throw new Error('Give the location a name.');
      const existing = state.locations.filter((l) => l.jobId === jobId);
      const was = existing.find((l) => l.label.toLowerCase() === parsed.label.toLowerCase());
      if (was) {
        if (!was.active) await save({ locations: state.locations.map((l) => (l.id === was.id ? { ...l, active: true } : l)) }, [{ jobId, kind: 'location_restored', detail: { location_id: was.id, label: was.label } }]);
        return was.id;
      }
      const id = randomUUID();
      const sortOrder = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 1;
      const location = { ...parsed, floor: parsed.floor ?? floor, id, jobId, active: true, sortOrder, walkedAt: null };
      // Only an admin changes the other locations' places: for anyone else it goes on the end.
      const locations = isAdmin(state.me) ? numbered(state.locations, inWalkOrder([...existing, location])) : [...state.locations, location];
      await save({ locations }, [{ jobId, kind: 'location_added', detail: { location_id: id, label: location.label } }]);
      return id;
    },
    async setWalked(locationIds, walked) {
      const state = get();
      const on = new Set(locationIds);
      const at = walked ? now() : null;
      await save({ locations: state.locations.map((l) => (on.has(l.id) ? { ...l, walkedAt: at } : l)) });
    },
    async reorderLocations(jobId, orderedIds) {
      const state = get();
      adminOnly(state);
      const moving = orderedIds.map((id) => state.locations.find((l) => l.id === id && l.jobId === jobId)).filter((l) => l !== undefined);
      const places = moving.map((l) => l.sortOrder).sort((a, b) => a - b);
      const next = new Map(moving.map((l, i) => [l.id, places[i]!]));
      await save({ locations: state.locations.map((l) => (next.has(l.id) ? { ...l, sortOrder: next.get(l.id)! } : l)) });
    },
    async moveLocation(id, to) {
      const state = get();
      adminOnly(state);
      const was = state.locations.find((l) => l.id === id);
      if (!was) return;
      await save({ locations: numbered(state.locations, moveToLevel(state.locations.filter((l) => l.jobId === was.jobId), id, to)) });
    },
    async renameLevel(jobId, from, to) {
      const state = get();
      adminOnly(state);
      const name = to.replace(/\s+/g, ' ').trim();
      if (name === '') return;
      const on = (l: Location) => l.jobId === jobId && l.kind === 'room' && (l.floor ?? null) === from;
      await save({ locations: state.locations.map((l) => (on(l) ? { ...l, floor: name } : l)) });
    },
    async addPlanLocations(jobId, rows) {
      const state = get();
      adminOnly(state);
      let job = state.locations.filter((l) => l.jobId === jobId);
      const happened: Happened[] = [];
      const read: string[] = [];
      const addedIds: string[] = [];
      let added = 0;
      let filledIn = 0;
      const nameFree = (label: string, id: string) => !job.some((l) => l.id !== id && l.label.toLowerCase() === label.toLowerCase());
      for (const row of rows) {
        const floor = row.kind === 'shared' ? null : row.floor;
        const place = { floor, kind: row.kind };
        const target = row.existing ? job.find((l) => l.id === row.existing?.id && l.active) : undefined;
        if (target) {
          read.push(target.id);
          // Its name only when nothing else on the job has that name.
          const naming = target.label !== row.label && nameFree(row.label, target.id) ? { name: row.name, number: row.number, label: row.label } : null;
          if (!naming && target.floor === floor && target.kind === row.kind) continue;
          if (naming) happened.push({ jobId, kind: 'location_renamed', detail: { location_id: target.id, from: target.label, to: row.label } });
          job = job.map((l) => (l.id === target.id ? { ...l, ...naming, ...place } : l));
          filledIn += 1;
          continue;
        }
        const same = job.find((l) => l.label.toLowerCase() === row.label.toLowerCase());
        if (same?.active) {
          read.push(same.id);
          continue;
        }
        if (same) {
          // Removed before: it comes back, where the plans put it.
          job = job.map((l) => (l.id === same.id ? { ...l, ...place, active: true } : l));
          happened.push({ jobId, kind: 'location_restored', detail: { location_id: same.id, label: same.label } });
          read.push(same.id);
          addedIds.push(same.id);
          added += 1;
          continue;
        }
        const id = randomUUID();
        job.push({ id, jobId, name: row.name, number: row.number, label: row.label, ...place, sortOrder: job.length + 1, active: true, walkedAt: null });
        happened.push({ jobId, kind: 'location_added', detail: { location_id: id, label: row.label } });
        read.push(id);
        addedIds.push(id);
        added += 1;
      }
      const before = state.locations.filter((l) => l.jobId === jobId);
      await save({ locations: numbered(state.locations, readingOrder(before, job, read)) }, happened);
      return { added, filledIn, addedIds };
    },
    async updateLocation(id, patch) {
      const state = get();
      adminOnly(state);
      const was = state.locations.find((l) => l.id === id);
      if (!was) return;
      const happened: Happened[] = [];
      if (patch.label !== undefined && patch.label !== was.label) {
        happened.push({ jobId: was.jobId, kind: 'location_renamed', detail: { location_id: id, from: was.label, to: patch.label } });
      }
      if (patch.active !== undefined && patch.active !== was.active) {
        happened.push({ jobId: was.jobId, kind: patch.active ? 'location_restored' : 'location_removed', detail: { location_id: id, label: patch.label ?? was.label } });
      }
      await save({ locations: state.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) }, happened);
    },
    async createItem(input: NewItem) {
      const state = get();
      const id = randomUUID();
      // On the phone the database numbers it, in the order items reach the server.
      const number = keeper.server ? null : (state.counters[input.jobId] ?? 0) + 1;
      const item: Item = { ...input, id, number, btExternalId: null, createdBy: state.me.id, createdAt: now(), updatedAt: now() };
      if (keeper.server) {
        await saveItems([...state.items, tradeFollows(state, item)]);
        return id;
      }
      // A standard title used again moves up the suggestions.
      const key = item.title.toLowerCase();
      const titles = state.titles.map((t) => (t.title.toLowerCase() === key ? { ...t, uses: t.uses + 1 } : t));
      await saveItems([...state.items, tradeFollows(state, item)], { titles, counters: { ...state.counters, [input.jobId]: number! } });
      return id;
    },
    async addItems(planned) {
      const state = get();
      const counters = { ...state.counters };
      const made: Item[] = planned.map((p) => {
        let number: number | null = null;
        if (!keeper.server) {
          number = (counters[p.jobId] ?? 0) + 1;
          counters[p.jobId] = number;
        }
        return tradeFollows(state, { ...p, number, position: null, btExternalId: null, createdBy: state.me.id, createdAt: now(), updatedAt: now() });
      });
      if (keeper.server) {
        await saveItems([...state.items, ...made]);
        return made.map((i) => i.id);
      }
      // Each standard title used again moves up the suggestions.
      const used = new Map<string, number>();
      for (const i of made) used.set(i.title.toLowerCase(), (used.get(i.title.toLowerCase()) ?? 0) + 1);
      const titles = state.titles.map((t) => (used.has(t.title.toLowerCase()) ? { ...t, uses: t.uses + used.get(t.title.toLowerCase())! } : t));
      await saveItems([...state.items, ...made], { titles, counters });
      return made.map((i) => i.id);
    },
    async updateItem(id: string, patch: ItemPatch) {
      const state = get();
      await saveItems(settle(state, state.items, state.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i))));
    },
    async updateItems(changes) {
      const state = get();
      const byId = new Map(changes.map((c) => [c.id, c.patch]));
      await saveItems(settle(state, state.items, state.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id), updatedAt: now() } : i))));
    },
    // On the phone the database merges them (merge_items), and the result comes back down.
    mergeItems:
      extras.mergeItems ??
      (async (keepId, mergeId) => {
        const state = get();
        const keep = state.items.find((i) => i.id === keepId);
        const merge = state.items.find((i) => i.id === mergeId);
        if (!keep || !merge || keepId === mergeId) throw new Error('Pick two different items.');
        if (keep.jobId !== merge.jobId) throw new Error('Both items have to be on the same job.');
        if (keep.status === 'removed' || merge.status === 'removed') throw new Error('One of those items was removed already.');
        const last = state.photos.filter((p) => p.itemId === keepId).reduce((m, p) => Math.max(m, p.sortOrder), 0);
        const moving = state.photos
          .filter((p) => p.itemId === mergeId && !p.removed)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
        const order = new Map(moving.map((p, i) => [p.id, last + i + 1]));
        const talking = state.comments.filter((c) => c.itemId === mergeId && !c.removed).map((c) => c.id);
        const moved = new Set(talking);
        const waits = mergedWaits(keepId, mergeId, state.items);
        const after = state.items.map((i) =>
          i.id === mergeId ? { ...i, status: 'removed' as const, updatedAt: now() } : waits.has(i.id) ? { ...i, waitingOnItems: waits.get(i.id)!, updatedAt: now() } : i,
        );
        const result = { photos: moving.length, comments: talking.length };
        await saveItems(
          settle(state, state.items, after),
          {
            photos: state.photos.map((p) => (order.has(p.id) ? { ...p, itemId: keepId, sortOrder: order.get(p.id)! } : p)),
            comments: state.comments.map((c) => (moved.has(c.id) ? { ...c, itemId: keepId } : c)),
          },
          [
            {
              jobId: keep.jobId,
              itemId: keepId,
              kind: 'items_merged',
              detail: { from_id: mergeId, from_number: merge.number, from_title: merge.title, into_number: keep.number, into_title: keep.title, ...result },
            },
          ],
        );
        return result;
      }),
    async addVisit({ itemIds, note, ...input }) {
      const state = get();
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
      await save(
        {
          visits: [...state.visits, visit],
          items: state.items.map((i) => (on.has(i.id) ? { ...i, visitId: id, updatedAt: now() } : i)),
        },
        [{ jobId: visit.jobId, kind: 'visit_added', detail: visitDetail(visit) }],
      );
      return id;
    },
    async updateVisit(id, patch, itemIds) {
      const state = get();
      const was = state.visits.find((v) => v.id === id);
      if (!was) return;
      const changed = { ...was, ...patch, updatedAt: now() };
      // New dates, or confirming it, answer what the company asked for, as the database does.
      const answered = changed.start !== was.start || changed.days !== was.days || (changed.confirmed && !was.confirmed);
      const visit = answered ? { ...changed, askedStart: null, askedDays: null, askedName: null, askedAt: null } : changed;
      const on = itemIds ? new Set(itemIds) : null;
      const moved = visit.start !== was.start || visit.days !== was.days || visit.confirmed !== was.confirmed;
      await save(
        {
          visits: state.visits.map((v) => (v.id === id ? visit : v)),
          items: on
            ? state.items.map((i) =>
                on.has(i.id) && i.visitId !== id ? { ...i, visitId: id, updatedAt: now() } : !on.has(i.id) && i.visitId === id ? { ...i, visitId: null, updatedAt: now() } : i,
              )
            : state.items,
        },
        moved ? [{ jobId: was.jobId, kind: 'visit_changed', detail: { ...visitDetail(visit), was_start: was.start, was_days: was.days, was_confirmed: was.confirmed } }] : [],
      );
    },
    async keepVisitDates(id) {
      const state = get();
      await save({ visits: state.visits.map((v) => (v.id === id ? { ...v, askedStart: null, askedDays: null, askedName: null, askedAt: null, updatedAt: now() } : v)) });
    },
    companyConfirmVisit:
      extras.companyConfirmVisit ??
      (async ({ visitId, name }) => {
        const state = get();
        const was = state.visits.find((v) => v.id === visitId && !v.removed);
        if (!was) throw new Error('That visit is not on this list');
        const visit = { ...was, confirmed: true, askedStart: null, askedDays: null, askedName: null, askedAt: null, updatedAt: now() };
        await save({ visits: state.visits.map((v) => (v.id === visitId ? visit : v)) }, [
          { jobId: was.jobId, kind: 'visit_confirmed_by_company', detail: { ...visitDetail(visit), from_company: true, author_name: tidyName(name) }, personId: null },
        ]);
      }),
    companyMarkDone:
      extras.companyMarkDone ??
      (async ({ jobId, companyId, itemId, done, name }) => {
        const state = get();
        const was = state.items.find((i) => i.id === itemId && i.jobId === jobId && i.companyId === companyId && i.status === 'open' && !i.unfinished);
        if (!was) throw new Error('That item is not on this list');
        if (done === !!was.markedDoneAt) return;
        await keeper.save(
          { items: state.items.map((i) => (i.id === itemId ? { ...i, markedDoneAt: done ? now() : null, updatedAt: now() } : i)) },
          done ? [{ jobId, itemId, kind: 'item_marked_done', detail: { company_id: companyId, from_company: true, author_name: tidyName(name) }, personId: null }] : [],
          { fromCompany: true },
        );
      }),
    companyAskVisit:
      extras.companyAskVisit ??
      (async ({ visitId, start, days, name }) => {
        const state = get();
        const was = state.visits.find((v) => v.id === visitId && !v.removed);
        if (!was) throw new Error('That visit is not on this list');
        const visit = { ...was, confirmed: false, askedStart: start, askedDays: Math.max(1, days), askedName: tidyName(name), askedAt: now(), updatedAt: now() };
        await save({ visits: state.visits.map((v) => (v.id === visitId ? visit : v)) }, [
          {
            jobId: was.jobId,
            kind: 'visit_change_asked',
            detail: { visit_id: was.id, company_id: was.companyId, start, days: Math.max(1, days), was_start: was.start, was_days: was.days, from_company: true, author_name: tidyName(name) },
            personId: null,
          },
        ]);
      }),
    async removeVisit(id) {
      const state = get();
      const was = state.visits.find((v) => v.id === id);
      if (!was) return;
      await save(
        {
          visits: state.visits.map((v) => (v.id === id ? { ...v, removed: true, updatedAt: now() } : v)),
          items: state.items.map((i) => (i.visitId === id ? { ...i, visitId: null, updatedAt: now() } : i)),
        },
        [{ jobId: was.jobId, kind: 'visit_removed', detail: visitDetail(was) }],
      );
    },
    async addComment({ jobId, itemId, companyId, body, internal }) {
      const state = get();
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
      await save({ comments: [...state.comments, comment] }, [{ jobId, itemId, kind: 'comment_added', detail: commentDetail(comment) }]);
      return comment.id;
    },
    async setCommentRemoved(id, removed) {
      const state = get();
      const was = state.comments.find((c) => c.id === id);
      if (!was || was.personId !== state.me.id) return;
      await save({ comments: state.comments.map((c) => (c.id === id ? { ...c, removed } : c)) });
    },
    addCompanyComment:
      extras.addCompanyComment ??
      (async ({ jobId, companyId, itemId, body, name }) => {
        const state = get();
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
        await save({ comments: [...state.comments, comment] }, [{ jobId, itemId, kind: 'comment_added', detail: commentDetail(comment), personId: null }]);
        return comment.id;
      }),
    async recordSend({ jobId, list, itemIds, snapshot }) {
      const state = get();
      const id = randomUUID();
      await save({ sends: [...state.sends, { id, jobId, list, itemIds, sentAt: now(), sentBy: state.me.id, removed: false, snapshot: snapshot ?? null }] }, [
        { jobId, kind: 'list_sent', detail: { list, items: itemIds.length } },
      ]);
      return id;
    },
    async undoSend(id) {
      const state = get();
      const was = state.sends.find((x) => x.id === id);
      if (!was || was.removed) return;
      await save({ sends: state.sends.map((x) => (x.id === id ? { ...x, removed: true } : x)) }, [{ jobId: was.jobId, kind: 'list_undone', detail: { list: was.list } }]);
    },
    async addPhotos(list) {
      const before = get();
      const added: Photo[] = [];
      for (const p of list) {
        const id = randomUUID();
        const order = Math.max(0, ...before.photos.filter((x) => x.itemId === p.itemId).map((x) => x.sortOrder), ...added.filter((x) => x.itemId === p.itemId).map((x) => x.sortOrder));
        added.push({
          id,
          jobId: p.jobId,
          itemId: p.itemId,
          uri: await keeper.keepPhoto(p.uri, id),
          storagePath: null,
          width: p.width,
          height: p.height,
          marks: p.marks,
          sortOrder: order + 1,
          removed: false,
          done: p.done ?? false,
          createdBy: before.me.id,
          createdAt: now(),
        });
      }
      // Keeping the pictures takes a moment: whatever changed meanwhile stays.
      const state = get();
      await save(
        { photos: [...state.photos, ...added] },
        added.map((p) => ({ jobId: p.jobId, itemId: p.itemId, kind: 'photo_added', detail: { photo_id: p.id, ...(p.done ? { done: true } : {}) } })),
      );
    },
    async replacePhoto(id, { uri, width, height, marks }) {
      if (!get().photos.some((p) => p.id === id)) return null;
      const newId = randomUUID();
      const kept = await keeper.keepPhoto(uri, newId);
      // Keeping the picture takes a moment: whatever changed meanwhile stays.
      const state = get();
      const was = state.photos.find((p) => p.id === id);
      if (!was) return null;
      const photo: Photo = {
        id: newId,
        jobId: was.jobId,
        itemId: was.itemId,
        uri: kept,
        storagePath: null,
        width,
        height,
        marks,
        sortOrder: was.sortOrder,
        removed: false,
        done: was.done,
        createdBy: state.me.id,
        createdAt: now(),
      };
      await save({ photos: [...state.photos.map((p) => (p.id === id ? { ...p, removed: true } : p)), photo] }, [
        { jobId: was.jobId, itemId: was.itemId, kind: 'photo_added', detail: { photo_id: newId, ...(was.done ? { done: true } : {}) } },
        { jobId: was.jobId, itemId: was.itemId, kind: 'photo_removed', detail: { photo_id: id } },
      ]);
      return newId;
    },
    async updatePhoto(id, patch) {
      const state = get();
      const was = state.photos.find((p) => p.id === id);
      if (!was) return;
      const happened: Happened[] = [];
      if (patch.removed && !was.removed) happened.push({ jobId: was.jobId, itemId: was.itemId, kind: 'photo_removed', detail: { photo_id: id } });
      else if (patch.marks && JSON.stringify(patch.marks) !== JSON.stringify(was.marks)) {
        happened.push({ jobId: was.jobId, itemId: was.itemId, kind: 'photo_marked', detail: { photo_id: id } });
      }
      await save({ photos: state.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, happened);
    },
    usePlans: (jobId) => {
      const s = useStore();
      return useMemo(() => s.plans.filter((p) => p.jobId === jobId && !p.removed).sort((a, b) => a.sortOrder - b.sortOrder), [s.plans, jobId]);
    },
    async addPlan({ jobId, floor, name, uri, width, height }) {
      const id = randomUUID();
      const clean = tidyName(name) || floor || 'Plan';
      const kept = await keeper.keepPhoto(uri, id);
      // Keeping the picture takes a moment: whatever changed meanwhile stays.
      const state = get();
      const order = Math.max(0, ...state.plans.filter((p) => p.jobId === jobId).map((p) => p.sortOrder)) + 1;
      const plan: PlanSheet = { id, jobId, floor, name: clean, uri: kept, width, height, sortOrder: order, removed: false };
      await save({ plans: [...state.plans, plan] }, [{ jobId, kind: 'plan_added', detail: { plan_id: id, name: clean, floor } }]);
      return id;
    },
    async updatePlan(id, patch) {
      const state = get();
      const was = state.plans.find((p) => p.id === id);
      if (!was) return;
      const next = { ...was, ...patch, ...(patch.name !== undefined ? { name: tidyName(patch.name) || was.name } : null) };
      await save(
        { plans: state.plans.map((p) => (p.id === id ? next : p)) },
        patch.removed && !was.removed ? [{ jobId: was.jobId, kind: 'plan_removed', detail: { plan_id: id, name: was.name, floor: was.floor } }] : [],
      );
    },
    async addTrade(name) {
      const state = get();
      adminOnly(state);
      const id = randomUUID();
      await save({ trades: [...state.trades, { id, name, sortOrder: state.trades.length + 1 }] });
      return id;
    },
    async reorderTrades(orderedIds) {
      const state = get();
      adminOnly(state);
      const place = new Map(orderedIds.map((id, i) => [id, i + 1]));
      await save({ trades: state.trades.map((t) => (place.has(t.id) ? { ...t, sortOrder: place.get(t.id)! } : t)) });
    },
    async addCompany({ name, defaultTradeId }) {
      const state = get();
      // Anyone at the company adds the companies they walk with; changing one is for an admin.
      if (!state.me?.active) throw new Error('Sign in again to add a company.');
      const clean = tidyCompanyName(name);
      const problem = companyNameProblem(clean);
      if (problem) throw new Error(problem);
      const same = state.companies.find((c) => c.name.trim().toLowerCase() === clean.toLowerCase());
      if (same) {
        if (!same.active) await save({ companies: state.companies.map((c) => (c.id === same.id ? { ...c, active: true } : c)) });
        return same.id;
      }
      const id = randomUUID();
      await save({ companies: [...state.companies, { id, name: clean, defaultTradeId, phone: null, email: null, active: true }] });
      return id;
    },
    async addCompanyToJob(jobId, companyId, tradeId) {
      const state = get();
      if (!seesJob(state.me, jobId, state.team)) throw new Error('You are not on this job.');
      if (state.jobCompanies.some((jc) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) return;
      await save({ jobCompanies: [...state.jobCompanies, { jobId, companyId, tradeId }] }, [{ jobId, kind: 'company_added', detail: { company_id: companyId, trade_id: tradeId } }]);
    },
    async updateCompany(id, patch) {
      const state = get();
      adminOnly(state);
      const was = state.companies.find((c) => c.id === id);
      if (!was) return;
      if (patch.name !== undefined && patch.name.trim() === '') throw new Error('Give the company a name.');
      const renamed = patch.name !== undefined && patch.name !== was.name;
      const holdups = renamed ? new Map(renamedHoldups(state.items, was.name, patch.name!).map((h) => [h.id, h.waitingOn])) : new Map<string, string[]>();
      // The new name shows on every job the company is on.
      const jobs = renamed ? [...new Set(state.jobCompanies.filter((jc) => jc.companyId === id).map((jc) => jc.jobId))] : [];
      await save(
        {
          companies: state.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          items: holdups.size > 0 ? state.items.map((i) => (holdups.has(i.id) ? { ...i, waitingOn: holdups.get(i.id)!, updatedAt: now() } : i)) : state.items,
        },
        jobs.map((jobId) => ({ jobId, kind: 'company_renamed', detail: { company_id: id, from: was.name, to: patch.name! } })),
      );
    },
    async addContact(input) {
      const state = get();
      adminOnly(state);
      const problem = contactProblem(input);
      if (problem) throw new Error(problem);
      const sortOrder = Math.max(0, ...state.contacts.filter((x) => x.companyId === input.companyId).map((x) => x.sortOrder)) + 1;
      const contact: Contact = { ...tidyContact(input), id: randomUUID(), sortOrder, active: true };
      await save({ contacts: [...state.contacts, contact] });
      return contact.id;
    },
    async updateContact(id, patch) {
      const state = get();
      adminOnly(state);
      const was = state.contacts.find((x) => x.id === id);
      if (!was) return;
      const next = tidyContact({ ...was, ...patch });
      const problem = contactProblem(next);
      if (problem) throw new Error(problem);
      await save({ contacts: state.contacts.map((x) => (x.id === id ? next : x)) });
    },
    async companyLink(jobId, companyId) {
      const state = get();
      const live = state.links.find((l) => l.jobId === jobId && l.companyId === companyId && !l.revoked);
      if (live) return live.token;
      const token = newToken();
      await save({ links: [...state.links, { token, jobId, companyId, createdAt: now(), revoked: false }] });
      return token;
    },
    async revokeCompanyLink(token) {
      const state = get();
      await save({ links: state.links.map((l) => (l.token === token ? { ...l, revoked: true } : l)) });
    },
    async setJobCompanyTrade(jobId, companyId, fromTradeId, toTradeId) {
      const state = get();
      adminOnly(state);
      if (fromTradeId === toTradeId) return;
      const pair = (tradeId: string) => (jc: { jobId: string; companyId: string; tradeId: string }) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId;
      // On the job for the new trade already: the two become one.
      const merging = state.jobCompanies.some(pair(toTradeId));
      const jobCompanies = merging
        ? state.jobCompanies.filter((jc) => !pair(fromTradeId)(jc))
        : state.jobCompanies.map((jc) => (pair(fromTradeId)(jc) ? { ...jc, tradeId: toTradeId } : jc));
      await save(
        {
          jobCompanies,
          items: state.items.map((i) => (i.jobId === jobId && i.companyId === companyId && i.tradeId === fromTradeId ? { ...i, tradeId: toTradeId, updatedAt: now() } : i)),
        },
        [
          merging
            ? { jobId, kind: 'company_removed', detail: { company_id: companyId, trade_id: fromTradeId } }
            : { jobId, kind: 'company_trade_changed', detail: { company_id: companyId, from: fromTradeId, to: toTradeId } },
        ],
      );
    },
    async removeCompanyFromJob(jobId, companyId, tradeId) {
      const state = get();
      adminOnly(state);
      if (!state.jobCompanies.some((jc) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) return;
      await save({ jobCompanies: state.jobCompanies.filter((jc) => !(jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) }, [
        { jobId, kind: 'company_removed', detail: { company_id: companyId, trade_id: tradeId } },
      ]);
    },
    async setWaitingOnExtras(jobId, labels) {
      const state = get();
      await save({ waitingOn: { ...state.waitingOn, [jobId]: labels } });
    },
    async addTitle({ title, tradeId, hours }) {
      const state = get();
      adminOnly(state);
      const id = randomUUID();
      await save({ titles: [...state.titles, { id, title, tradeId, uses: 0, approved: true, hours: hours ?? null, rooms: [] }] });
      return id;
    },
    async updateTitle(id, patch) {
      const state = get();
      adminOnly(state);
      await save({ titles: state.titles.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    },
    async addCustomField({ label, kind, options }) {
      const state = get();
      adminOnly(state);
      const id = randomUUID();
      const sortOrder = Math.max(0, ...state.customFields.map((f) => f.sortOrder)) + 1;
      await save({ customFields: [...state.customFields, { id, label, kind, options, sortOrder, active: true }] });
      return id;
    },
    async updateCustomField(id, patch) {
      const state = get();
      adminOnly(state);
      await save({ customFields: state.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
    },
    async setFormSettings(formSettings) {
      await save({ formSettings });
    },
    async setViewSettings(viewSettings) {
      await save({ viewSettings });
    },
    sendSignInCode: extras.sendSignInCode,
    verifySignInCode: extras.verifySignInCode,
    startCompany: extras.startCompany,
    deleteAccount: extras.deleteAccount,
    signOut: extras.signOut,
    useSync: extras.useSync ?? (() => UP_TO_DATE),
    clearRefused: extras.clearRefused ?? (async () => {}),
  };
  return api;
}

const NO_LABELS: string[] = [];

/** Nothing waiting and nothing turned down: the preview has no server. */
const UP_TO_DATE: SyncInfo = { gettingJobs: false, waiting: 0, refused: [], online: true };
