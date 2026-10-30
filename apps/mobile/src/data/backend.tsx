// Preview backend: sample data in memory, for the preview link. Nothing leaves the browser tab and
// a reload starts over.

import { randomUUID } from 'expo-crypto';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { renamedHoldups, type Item, type Photo } from '@punch/core';
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

const api: DataApi = {
  mode: 'preview',
  useMe: () => useStore().me,
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

  async createJob({ name, address }) {
    const id = randomUUID();
    setState({ ...state, jobs: [...state.jobs, { id, name, address }], counters: { ...state.counters, [id]: 0 } });
    return id;
  },
  async updateJob(id, patch) {
    setState({ ...state, jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
  },
  async addLocations(jobId, parsed) {
    const existing = state.locations.filter((l) => l.jobId === jobId);
    const byLabel = new Map(existing.map((l) => [l.label.toLowerCase(), l]));
    // One removed before comes back where it was.
    const back = new Set(parsed.flatMap((p) => {
      const was = byLabel.get(p.label.toLowerCase());
      return was && !was.active ? [was.id] : [];
    }));
    let order = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0);
    const added = parsed
      .filter((p) => !byLabel.has(p.label.toLowerCase()))
      .map((p) => ({ ...p, id: randomUUID(), jobId, active: true, sortOrder: ++order }));
    setState({ ...state, locations: [...state.locations.map((l) => (back.has(l.id) ? { ...l, active: true } : l)), ...added] });
    return added.length + back.size;
  },
  async updateLocation(id, patch) {
    setState({ ...state, locations: state.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
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
    setState({ ...state, items: [...state.items, item], titles, counters: { ...state.counters, [input.jobId]: number } });
    return id;
  },
  async updateItem(id: string, patch: ItemPatch) {
    setState({ ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i)) });
  },
  async updateItems(changes) {
    const byId = new Map(changes.map((c) => [c.id, c.patch]));
    setState({ ...state, items: state.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id), updatedAt: now() } : i)) });
  },
  async addVisit({ itemIds, note, ...input }) {
    const id = randomUUID();
    const visit = { ...input, id, note: note ?? '', removed: false, createdBy: state.me.id, createdAt: now(), updatedAt: now() };
    const on = new Set(itemIds);
    setState({
      ...state,
      visits: [...state.visits, visit],
      items: state.items.map((i) => (on.has(i.id) ? { ...i, visitId: id, updatedAt: now() } : i)),
    });
    return id;
  },
  async updateVisit(id, patch, itemIds) {
    const on = itemIds ? new Set(itemIds) : null;
    setState({
      ...state,
      visits: state.visits.map((v) => (v.id === id ? { ...v, ...patch, updatedAt: now() } : v)),
      items: on
        ? state.items.map((i) =>
            on.has(i.id) && i.visitId !== id
              ? { ...i, visitId: id, updatedAt: now() }
              : !on.has(i.id) && i.visitId === id
                ? { ...i, visitId: null, updatedAt: now() }
                : i,
          )
        : state.items,
    });
  },
  async removeVisit(id) {
    setState({
      ...state,
      visits: state.visits.map((v) => (v.id === id ? { ...v, removed: true, updatedAt: now() } : v)),
      items: state.items.map((i) => (i.visitId === id ? { ...i, visitId: null, updatedAt: now() } : i)),
    });
  },
  async recordSend({ jobId, list, itemIds }) {
    const id = randomUUID();
    setState({ ...state, sends: [...state.sends, { id, jobId, list, itemIds, sentAt: now(), sentBy: state.me.id, removed: false }] });
    return id;
  },
  async undoSend(id) {
    setState({ ...state, sends: state.sends.map((x) => (x.id === id ? { ...x, removed: true } : x)) });
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
    setState({ ...state, photos: [...state.photos, ...added] });
  },
  async updatePhoto(id, patch) {
    setState({ ...state, photos: state.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
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
    setState({ ...state, jobCompanies: [...state.jobCompanies, { jobId, companyId, tradeId }] });
  },
  async updateCompany(id, patch) {
    const was = state.companies.find((c) => c.id === id);
    const holdups = was && patch.name ? new Map(renamedHoldups(state.items, was.name, patch.name).map((h) => [h.id, h.waitingOn])) : new Map<string, string[]>();
    setState({
      ...state,
      companies: state.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      items: holdups.size > 0 ? state.items.map((i) => (holdups.has(i.id) ? { ...i, waitingOn: holdups.get(i.id)!, updatedAt: now() } : i)) : state.items,
    });
  },
  async setJobCompanyTrade(jobId, companyId, fromTradeId, toTradeId) {
    if (fromTradeId === toTradeId) return;
    const pair = (tradeId: string) => (jc: { jobId: string; companyId: string; tradeId: string }) =>
      jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId;
    // On the job for the new trade already: the two become one.
    const jobCompanies = state.jobCompanies.some(pair(toTradeId))
      ? state.jobCompanies.filter((jc) => !pair(fromTradeId)(jc))
      : state.jobCompanies.map((jc) => (pair(fromTradeId)(jc) ? { ...jc, tradeId: toTradeId } : jc));
    setState({
      ...state,
      jobCompanies,
      items: state.items.map((i) =>
        i.jobId === jobId && i.companyId === companyId && i.tradeId === fromTradeId ? { ...i, tradeId: toTradeId, updatedAt: now() } : i,
      ),
    });
  },
  async removeCompanyFromJob(jobId, companyId, tradeId) {
    setState({ ...state, jobCompanies: state.jobCompanies.filter((jc) => !(jc.jobId === jobId && jc.companyId === companyId && jc.tradeId === tradeId)) });
  },
  async setWaitingOnExtras(jobId, labels) {
    setState({ ...state, waitingOn: { ...state.waitingOn, [jobId]: labels } });
  },
  async addTitle({ title, tradeId }) {
    const id = randomUUID();
    setState({ ...state, titles: [...state.titles, { id, title, tradeId, uses: 0, approved: true }] });
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
