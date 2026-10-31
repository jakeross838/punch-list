// Preview backend: sample data in memory, for the preview link. Nothing leaves the browser tab and
// a reload starts over. Every change is logged the way the database logs it (a row for each item
// field that changed, and a row for photos, visits, lists sent and job setup), so Activity and
// each item's History show what the real app will.

import { randomUUID } from 'expo-crypto';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { itemChanges, renamedHoldups, type Activity, type ActivityDetail, type ActivityKind, type Item, type Photo } from '@punch/core';
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
}

let seq = 0;
/** Ids in the order things happened, so two things done in the same moment keep their order. */
const nextId = () => `activity-live-${String(++seq).padStart(6, '0')}`;

/**
 * Saves a change and logs it: every item added or changed, field by field, the way the database
 * does, and the other things that happened, all as the signed-in person, now.
 */
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
  for (const h of happened) entries.push({ id: nextId(), jobId: h.jobId, itemId: h.itemId ?? null, personId, at, kind: h.kind, detail: h.detail ?? {} });
  setState({ ...state, ...next, activity: entries.length > 0 ? [...state.activity, ...entries] : state.activity });
}

const visitDetail = (v: { id: string; companyId: string; start: string; days: number; confirmed: boolean }): ActivityDetail => ({
  visit_id: v.id,
  company_id: v.companyId,
  start: v.start,
  days: v.days,
  confirmed: v.confirmed,
});

const api: DataApi = {
  mode: 'preview',
  useMe: () => useStore().me,
  usePeople: () => useStore().people,
  useJobs: () => useStore().jobs,
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
  useActivity: (jobId) => {
    const s = useStore();
    return useMemo(() => s.activity.filter((a) => a.jobId === jobId), [s.activity, jobId]);
  },

  async createJob({ name, address }) {
    const id = randomUUID();
    setState({ ...state, jobs: [...state.jobs, { id, name, address }], counters: { ...state.counters, [id]: 0 } });
    return id;
  },
  async updateJob(id, patch) {
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return;
    const happened: Happened[] = [];
    if (patch.name !== undefined && patch.name !== job.name) happened.push({ jobId: id, kind: 'job_renamed', detail: { from: job.name, to: patch.name } });
    if (patch.address !== undefined && patch.address !== job.address) happened.push({ jobId: id, kind: 'job_address_changed', detail: { from: job.address, to: patch.address } });
    commit({ jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }, happened);
  },
  async addLocations(jobId, parsed) {
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
      .map((p) => ({ ...p, id: randomUUID(), jobId, active: true, sortOrder: ++order }));
    commit({ locations: [...state.locations.map((l) => (back.has(l.id) ? { ...l, active: true } : l)), ...added] }, [
      ...added.map((l): Happened => ({ jobId, kind: 'location_added', detail: { location_id: l.id, label: l.label } })),
      ...existing.filter((l) => back.has(l.id)).map((l): Happened => ({ jobId, kind: 'location_restored', detail: { location_id: l.id, label: l.label } })),
    ]);
    return added.length + back.size;
  },
  async updateLocation(id, patch) {
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
    commit({ items: [...state.items, item], titles, counters: { ...state.counters, [input.jobId]: number } });
    return id;
  },
  async updateItem(id: string, patch: ItemPatch) {
    commit({ items: state.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i)) });
  },
  async updateItems(changes) {
    const byId = new Map(changes.map((c) => [c.id, c.patch]));
    commit({ items: state.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id), updatedAt: now() } : i)) });
  },
  async addVisit({ itemIds, note, ...input }) {
    const id = randomUUID();
    const visit = { ...input, id, note: note ?? '', removed: false, createdBy: state.me.id, createdAt: now(), updatedAt: now() };
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
    const visit = { ...was, ...patch, updatedAt: now() };
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
  async recordSend({ jobId, list, itemIds }) {
    const id = randomUUID();
    commit({ sends: [...state.sends, { id, jobId, list, itemIds, sentAt: now(), sentBy: state.me.id, removed: false }] }, [
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
    const id = randomUUID();
    setState({ ...state, trades: [...state.trades, { id, name, sortOrder: state.trades.length + 1 }] });
    return id;
  },
  async addCompany({ name, defaultTradeId }) {
    const id = randomUUID();
    setState({ ...state, companies: [...state.companies, { id, name, defaultTradeId, phone: null, email: null, active: true }] });
    return id;
  },
  async addCompanyToJob(jobId, companyId, tradeId) {
    if (state.jobCompanies.some((jc) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) return;
    commit({ jobCompanies: [...state.jobCompanies, { jobId, companyId, tradeId }] }, [
      { jobId, kind: 'company_added', detail: { company_id: companyId, trade_id: tradeId } },
    ]);
  },
  async updateCompany(id, patch) {
    const was = state.companies.find((c) => c.id === id);
    if (!was) return;
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
  async setJobCompanyTrade(jobId, companyId, fromTradeId, toTradeId) {
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
    if (!state.jobCompanies.some((jc) => jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) return;
    commit({ jobCompanies: state.jobCompanies.filter((jc) => !(jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) }, [
      { jobId, kind: 'company_removed', detail: { company_id: companyId, trade_id: tradeId } },
    ]);
  },
  async setWaitingOnExtras(jobId, labels) {
    setState({ ...state, waitingOn: { ...state.waitingOn, [jobId]: labels } });
  },
  async addTitle({ title, tradeId, hours }) {
    const id = randomUUID();
    setState({ ...state, titles: [...state.titles, { id, title, tradeId, uses: 0, approved: true, hours: hours ?? null }] });
    return id;
  },
  async updateTitle(id, patch) {
    setState({ ...state, titles: state.titles.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  },
  async addCustomField({ label, kind, options }) {
    const id = randomUUID();
    const sortOrder = Math.max(0, ...state.customFields.map((f) => f.sortOrder)) + 1;
    setState({ ...state, customFields: [...state.customFields, { id, label, kind, options, sortOrder, active: true }] });
    return id;
  },
  async updateCustomField(id, patch) {
    setState({ ...state, customFields: state.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  },
  async setFormSettings(formSettings) {
    setState({ ...state, formSettings });
  },
  async setViewSettings(viewSettings) {
    setState({ ...state, viewSettings });
  },
  async signOut() {
    setState(sampleState());
  },
};

export function DataProvider({ children }: { children: ReactNode }) {
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}
