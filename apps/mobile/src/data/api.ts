// The one interface the screens use. Two backends implement it:
//   backend.ts         sample data in memory, for the preview link (web)
//   backend.native.ts  PowerSync on the phone, synced with Supabase
// Every read is a hook that updates when the data changes; every write goes through the core rules.

import { createContext, useContext } from 'react';
import type {
  Company,
  CustomField,
  FormSettings,
  Item,
  ItemFields,
  Job,
  JobCompany,
  Location,
  Mark,
  ParsedLocation,
  Person,
  Photo,
  StandardTitle,
  Trade,
  ViewSettings,
} from '@punch/core';

export interface NewItem extends ItemFields {
  jobId: string;
  locationId: string;
  source: Item['source'];
}

export interface ItemPatch extends Partial<ItemFields> {
  locationId?: string;
}

export interface NewPhoto {
  jobId: string;
  itemId: string;
  /** The picture as the camera or the photo library gave it. */
  uri: string;
  width: number;
  height: number;
  marks: Mark[];
}

export type PhotoPatch = Partial<Pick<Photo, 'marks' | 'removed' | 'sortOrder'>>;

export interface DataApi {
  /** preview: sample data, nothing saved beyond this browser tab. live: the real database. */
  mode: 'preview' | 'live';
  useMe(): Person | null;
  useJobs(): Job[];
  useLocations(jobId: string): Location[];
  useItems(jobId: string): Item[];
  /** The job's photos that are not removed, each item's in order. */
  usePhotos(jobId: string): Photo[];
  useTrades(): Trade[];
  useCompanies(): Company[];
  useJobCompanies(jobId: string): JobCompany[];
  useWaitingOnExtras(jobId: string): string[];
  /** The standard titles, each with its trade. */
  useTitles(): StandardTitle[];
  /** The fields added to the item form in Item Form setup. */
  useCustomFields(): CustomField[];
  /** The signed-in person's Item Form setup. */
  useFormSettings(): FormSettings;
  /** How the signed-in person likes a job to open. */
  useViewSettings(): ViewSettings;
  createJob(input: { name: string; address: string }): Promise<string>;
  /** Adds rooms after the job's existing ones, keeping floor order. Returns how many were added. */
  addLocations(jobId: string, locations: ParsedLocation[]): Promise<number>;
  createItem(item: NewItem): Promise<string>;
  updateItem(id: string, patch: ItemPatch): Promise<void>;
  /** Keeps the pictures with the item, after the ones it has. */
  addPhotos(photos: NewPhoto[]): Promise<void>;
  updatePhoto(id: string, patch: PhotoPatch): Promise<void>;
  addTrade(name: string): Promise<string>;
  addCompany(input: { name: string; defaultTradeId: string | null }): Promise<string>;
  addCompanyToJob(jobId: string, companyId: string, tradeId: string): Promise<void>;
  setWaitingOnExtras(jobId: string, labels: string[]): Promise<void>;
  addTitle(input: { title: string; tradeId: string | null }): Promise<string>;
  updateTitle(id: string, patch: Partial<Pick<StandardTitle, 'title' | 'tradeId' | 'approved'>>): Promise<void>;
  addCustomField(input: Pick<CustomField, 'label' | 'kind' | 'options'>): Promise<string>;
  updateCustomField(id: string, patch: Partial<Pick<CustomField, 'label' | 'options' | 'active'>>): Promise<void>;
  setFormSettings(settings: FormSettings): Promise<void>;
  setViewSettings(settings: ViewSettings): Promise<void>;
  signOut(): Promise<void>;
}

export const DataContext = createContext<DataApi | null>(null);

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData needs the DataProvider from the root layout');
  return api;
}
