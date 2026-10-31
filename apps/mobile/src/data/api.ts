// The one interface the screens use. backend.tsx implements it with sample data in memory, for the
// preview link; the phone's, on PowerSync synced with Supabase, implements the same interface.
// Every read is a hook that updates when the data changes; every write goes through the core rules.

import { createContext, useContext } from 'react';
import type {
  Activity,
  Comment,
  Company,
  CustomField,
  FormSettings,
  Item,
  ItemFields,
  Job,
  JobCompany,
  ListSend,
  Location,
  Mark,
  ParsedLocation,
  Person,
  Photo,
  StandardTitle,
  Trade,
  ViewSettings,
  Visit,
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

export interface NewVisit {
  jobId: string;
  companyId: string;
  start: string;
  days: number;
  confirmed: boolean;
  note?: string;
  /** The items it covers; each moves onto this visit. */
  itemIds: string[];
}

/** A visit's dates, days, confirmation and note. New dates, or confirming it, answer what the company asked for. */
export type VisitPatch = Partial<Pick<Visit, 'start' | 'days' | 'confirmed' | 'note'>>;

export interface DataApi {
  /** preview: sample data, nothing saved beyond this browser tab. live: the real database. */
  mode: 'preview' | 'live';
  useMe(): Person | null;
  /** Everyone at Ross Built, for who did what. */
  usePeople(): Person[];
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
  /** The job's visits that are not removed. */
  useVisits(jobId: string): Visit[];
  /** The lists that went out on the job, not counting any undone. */
  useSends(jobId: string): ListSend[];
  /** Who did what on the job: item_history and job_activity together, in no particular order. */
  useActivity(jobId: string): Activity[];
  /** The job's comments, Ross Built only ones and ones taken back included. */
  useComments(jobId: string): Comment[];
  createJob(input: { name: string; address: string }): Promise<string>;
  updateJob(id: string, patch: Partial<Pick<Job, 'name' | 'address'>>): Promise<void>;
  /**
   * Adds locations after the job's existing ones, keeping floor order; one removed before comes
   * back where it was. Returns how many were added.
   */
  addLocations(jobId: string, locations: ParsedLocation[]): Promise<number>;
  /** Renames a location, or removes it from the job (active false), which keeps it in the history. */
  updateLocation(id: string, patch: Partial<Pick<Location, 'name' | 'number' | 'label' | 'active'>>): Promise<void>;
  /** Done Here on a walk marks locations walked; Start a New Walk clears them. */
  setWalked(locationIds: string[], walked: boolean): Promise<void>;
  createItem(item: NewItem): Promise<string>;
  updateItem(id: string, patch: ItemPatch): Promise<void>;
  /** Several items at once, as one change: clearing a holdup, moving a Ready By. */
  updateItems(changes: { id: string; patch: ItemPatch }[]): Promise<void>;
  /** Keeps the pictures with the item, after the ones it has. */
  addPhotos(photos: NewPhoto[]): Promise<void>;
  updatePhoto(id: string, patch: PhotoPatch): Promise<void>;
  addTrade(name: string): Promise<string>;
  addCompany(input: { name: string; defaultTradeId: string | null }): Promise<string>;
  addCompanyToJob(jobId: string, companyId: string, tradeId: string): Promise<void>;
  /** Renames a company on every job; items waiting on it by the old name keep waiting on it. */
  updateCompany(id: string, patch: Partial<Pick<Company, 'name'>>): Promise<void>;
  /** The trade a company does on the job; its items on the job with the old trade move to the new one. */
  setJobCompanyTrade(jobId: string, companyId: string, fromTradeId: string, toTradeId: string): Promise<void>;
  /** Takes a company off the job for that trade. Its items stay as they are. */
  removeCompanyFromJob(jobId: string, companyId: string, tradeId: string): Promise<void>;
  setWaitingOnExtras(jobId: string, labels: string[]): Promise<void>;
  addTitle(input: { title: string; tradeId: string | null; hours?: number | null }): Promise<string>;
  updateTitle(id: string, patch: Partial<Pick<StandardTitle, 'title' | 'tradeId' | 'approved' | 'hours' | 'rooms'>>): Promise<void>;
  addCustomField(input: Pick<CustomField, 'label' | 'kind' | 'options'>): Promise<string>;
  updateCustomField(id: string, patch: Partial<Pick<CustomField, 'label' | 'options' | 'active'>>): Promise<void>;
  addVisit(visit: NewVisit): Promise<string>;
  /** Changes the visit; with itemIds, those become exactly the items on it. */
  updateVisit(id: string, patch: VisitPatch, itemIds?: string[]): Promise<void>;
  /** Keeps a visit's dates when the company asked for others: what it asked is cleared, and the visit stays as it is. */
  keepVisitDates(id: string): Promise<void>;
  /** Marks it removed and takes its items off it. */
  removeVisit(id: string): Promise<void>;
  /** A comment from the signed-in person, on an item or on a company's whole list on the job. */
  addComment(input: { jobId: string; itemId: string | null; companyId: string | null; body: string; internal: boolean }): Promise<string>;
  /** Takes back the signed-in person's own comment, or brings it back (Undo). */
  setCommentRemoved(id: string, removed: boolean): Promise<void>;
  /**
   * A comment from the company's own page, through its private link: on one of its items, or on its
   * whole list. On the phone this goes through the database's trade_comment with the link's token.
   */
  addCompanyComment(input: { jobId: string; companyId: string; itemId: string | null; body: string; name: string | null }): Promise<string>;
  /**
   * From the company's own page: these dates work (the visit is confirmed), or other dates asked
   * for (the visit keeps its dates until Ross Built moves it). On the phone these go through the
   * database's trade_confirm_visit and trade_ask_visit with the link's token.
   */
  companyConfirmVisit(input: { visitId: string; name: string | null }): Promise<void>;
  companyAskVisit(input: { visitId: string; start: string; days: number; name: string | null }): Promise<void>;
  recordSend(send: { jobId: string; list: string; itemIds: string[] }): Promise<string>;
  undoSend(id: string): Promise<void>;
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
