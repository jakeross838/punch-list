// Preview backend: sample data in memory, for the preview link. Nothing leaves the browser tab and
// a reload starts over. The phone uses backend.native.tsx instead.

import { randomUUID } from 'expo-crypto';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { Item } from '@punch/core';
import { DataContext, type DataApi, type ItemPatch, type NewItem } from './api';
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
  useTrades: () => useStore().trades,
  useCompanies: () => useStore().companies,
  useJobCompanies: (jobId) => {
    const s = useStore();
    return useMemo(() => s.jobCompanies.filter((jc) => jc.jobId === jobId), [s.jobCompanies, jobId]);
  },
  useWaitingOnExtras: (jobId) => useStore().waitingOn[jobId] ?? [],

  async createJob({ name, address }) {
    const id = randomUUID();
    setState({ ...state, jobs: [...state.jobs, { id, name, address }], counters: { ...state.counters, [id]: 0 } });
    return id;
  },
  async addLocations(jobId, parsed) {
    const existing = state.locations.filter((l) => l.jobId === jobId);
    const labels = new Set(existing.map((l) => l.label.toLowerCase()));
    let order = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0);
    const added = parsed
      .filter((p) => !labels.has(p.label.toLowerCase()))
      .map((p) => ({ ...p, id: randomUUID(), jobId, active: true, sortOrder: ++order }));
    setState({ ...state, locations: [...state.locations, ...added] });
    return added.length;
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
    setState({ ...state, items: [...state.items, item], counters: { ...state.counters, [input.jobId]: number } });
    return id;
  },
  async updateItem(id: string, patch: ItemPatch) {
    setState({ ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i)) });
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
  async setWaitingOnExtras(jobId, labels) {
    setState({ ...state, waitingOn: { ...state.waitingOn, [jobId]: labels } });
  },
  async signOut() {
    setState(sampleState());
  },
};

export function DataProvider({ children }: { children: ReactNode }) {
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}
