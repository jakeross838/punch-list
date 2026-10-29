// The one interface the screens use. Two backends implement it:
//   backend.ts         sample data in memory, for the preview link (web)
//   backend.native.ts  PowerSync on the phone, synced with Supabase
// Every read is a hook that updates when the data changes; every write goes through the core rules.

import { createContext, useContext } from 'react';
import type { Company, Item, ItemFields, Job, JobCompany, Location, ParsedLocation, Person, Trade } from '@punch/core';

export interface NewItem extends ItemFields {
  jobId: string;
  locationId: string;
  source: Item['source'];
}

export interface ItemPatch extends Partial<ItemFields> {
  locationId?: string;
}

export interface DataApi {
  /** preview: sample data, nothing saved beyond this browser tab. live: the real database. */
  mode: 'preview' | 'live';
  useMe(): Person | null;
  useJobs(): Job[];
  useLocations(jobId: string): Location[];
  useItems(jobId: string): Item[];
  useTrades(): Trade[];
  useCompanies(): Company[];
  useJobCompanies(jobId: string): JobCompany[];
  useWaitingOnExtras(jobId: string): string[];
  createJob(input: { name: string; address: string }): Promise<string>;
  /** Adds rooms after the job's existing ones, keeping floor order. Returns how many were added. */
  addLocations(jobId: string, locations: ParsedLocation[]): Promise<number>;
  createItem(item: NewItem): Promise<string>;
  updateItem(id: string, patch: ItemPatch): Promise<void>;
  addTrade(name: string): Promise<string>;
  addCompany(input: { name: string; defaultTradeId: string | null }): Promise<string>;
  addCompanyToJob(jobId: string, companyId: string, tradeId: string): Promise<void>;
  setWaitingOnExtras(jobId: string, labels: string[]): Promise<void>;
  signOut(): Promise<void>;
}

export const DataContext = createContext<DataApi | null>(null);

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData needs the DataProvider from the root layout');
  return api;
}
