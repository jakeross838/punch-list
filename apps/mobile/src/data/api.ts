// The one interface the screens use. engine.ts implements it once, with the app's rules; the preview
// keeps the changes in memory (previewBackend.tsx) and the iPhone in its own database, synced with
// Supabase through PowerSync (live/). Every read is a hook that updates when the data changes;
// every write goes through the core rules.

import { createContext, useContext } from 'react';
import type {
  Activity,
  Comment,
  Company,
  CompanyLink,
  Contact,
  CustomField,
  FormSettings,
  Item,
  ItemFields,
  Job,
  JobCompany,
  ListSend,
  Location,
  Mark,
  NewTemplateItem,
  Org,
  ParsedLocation,
  PlannedItem,
  Person,
  Photo,
  PlanSheet,
  Role,
  ScheduleSnapshot,
  Sees,
  StandardTitle,
  TeamMember,
  TeamPart,
  Template,
  TemplateItem,
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
  /** Where it sits in its location's list, from dragging it. */
  position?: number | null;
}

/** A template's task as it is added or changed. */
export type TemplateItemInput = Pick<TemplateItem, 'title' | 'description' | 'kind' | 'tradeId' | 'hours' | 'place' | 'waitsOn'>;

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

export interface NewPlan {
  jobId: string;
  /** The level it shows, as the locations name it. */
  floor: string;
  name: string;
  /** The picture as the photo library or the camera gave it. */
  uri: string;
  width: number;
  height: number;
}

export type PlanPatch = Partial<Pick<PlanSheet, 'name' | 'floor' | 'removed' | 'sortOrder'>>;

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

/** Someone new at your company. They sign in with this email. */
export interface NewPerson {
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  sees: Sees;
}

export type PersonPatch = Partial<Pick<Person, 'name' | 'email' | 'phone' | 'role' | 'sees' | 'active'>>;

/** One of a company's people, as they are added. */
export interface NewContact {
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  getsLists: boolean;
}

export type ContactPatch = Partial<Pick<Contact, 'name' | 'email' | 'phone' | 'getsLists' | 'active' | 'sortOrder'>>;

/** A list that went out: which, the items on it, and for the schedule, the schedule as it went. */
export interface NewSend {
  jobId: string;
  list: string;
  itemIds: string[];
  snapshot?: ScheduleSnapshot | null;
}

/** After the code: signed in, or new here and about to start a company. */
export type SignInResult = 'signed_in' | 'new';

/** How this phone stands with the server. The preview has nothing to send. */
export interface SyncInfo {
  /** Signed in, with the jobs on their way down for the first time. */
  gettingJobs: boolean;
  /** Changes made on this phone that have not gone up yet, photos included. */
  waiting: number;
  /** Changes the server turned down for good, newest first: they are no longer on the phone. */
  refused: { id: string; at: string; what: string }[];
  /** Reaching the server right now. */
  online: boolean;
}

/** A visit's dates, days, confirmation and note. New dates, or confirming it, answer what the company asked for. */
export type VisitPatch = Partial<Pick<Visit, 'start' | 'days' | 'confirmed' | 'note'>>;

export interface DataApi {
  /** preview: sample data, nothing saved beyond this browser tab. live: the real database. */
  mode: 'preview' | 'live';
  /** Whoever is signed in; null before signing in. */
  useMe(): Person | null;
  /** The signed-in person's company: its name goes on every list. Empty before signing in. */
  useOrg(): Org;
  /** Admins only. The company's name, on every list it sends. */
  renameOrg(name: string): Promise<void>;
  /** The email signed in that is not with a company yet, to start one; null otherwise. */
  useNewAccount(): string | null;
  /** Everyone at the company, switched off or not: for who did what, and for People. */
  usePeople(): Person[];
  /** The jobs the signed-in person sees, closed ones included. */
  useJobs(): Job[];
  /** Who is on each job's team, and as what, on every job the signed-in person sees. */
  useTeams(): TeamMember[];
  /** The items assigned to a person, on every job the signed-in person sees. */
  useAssigned(personId: string): Item[];
  /** Every template, switched off ones included. */
  useTemplates(): Template[];
  /** Every template's tasks, switched off ones included. */
  useTemplateItems(): TemplateItem[];
  useLocations(jobId: string): Location[];
  useItems(jobId: string): Item[];
  /** The job's photos that are not removed, each item's in order. */
  usePhotos(jobId: string): Photo[];
  useTrades(): Trade[];
  useCompanies(): Company[];
  /** Every company's people, switched off ones included. */
  useContacts(): Contact[];
  /** The job's company links that work: one for each company at most. */
  useCompanyLinks(jobId: string): CompanyLink[];
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
  /** What happened lately on every job you see, newest first: the Updates list. */
  useUpdates(): Activity[];
  /** The job's comments, internal notes and ones taken back included. */
  useComments(jobId: string): Comment[];
  /** Admins only. The Project Manager, when given, goes on the team. */
  createJob(input: { name: string; address: string; projectManagerId?: string | null }): Promise<string>;
  /** Admins only. Closed puts the job away; opening it again brings it back. */
  updateJob(id: string, patch: Partial<Pick<Job, 'name' | 'address' | 'closed'>>): Promise<void>;
  /**
   * Admins only. Deletes the job and everything on it (items, photos, comments, its log) for
   * everyone, for good. On the phone it needs a signal, and every change made here up first.
   */
  deleteJob(id: string): Promise<void>;
  /** Admins only. */
  addPerson(person: NewPerson): Promise<string>;
  /** Admins only. There is always at least one admin. */
  updatePerson(id: string, patch: PersonPatch): Promise<void>;
  /** Admins only. Puts a person on a job's team, changes what they are on it, or takes them off with null. */
  setTeamMember(jobId: string, personId: string, part: TeamPart | null): Promise<void>;
  /** Admins only. A new template, with tasks to start it (each key ties the waits together). */
  addTemplate(input: { name: string; items?: NewTemplateItem[] }): Promise<string>;
  /** Admins only. Its name, or switched off or back on. */
  updateTemplate(id: string, patch: Partial<Pick<Template, 'name' | 'active'>>): Promise<void>;
  /** Admins only. */
  addTemplateItem(templateId: string, item: TemplateItemInput): Promise<string>;
  /** Admins only. Switched off with active false; nothing is deleted. */
  updateTemplateItem(id: string, patch: Partial<TemplateItemInput & Pick<TemplateItem, 'active' | 'sortOrder'>>): Promise<void>;
  /** Preview only: see the app the way someone else does. */
  previewAs?(personId: string): void;
  /**
   * Adds locations after the job's existing ones, keeping floor order; one removed before comes
   * back where it was. Returns how many were added.
   */
  addLocations(jobId: string, locations: ParsedLocation[]): Promise<number>;
  /** One location, typed in while walking or adding an item: anyone on the job. Answers its id (the one already there when the name is taken). */
  addLocation(jobId: string, name: string, floor?: string | null): Promise<string>;
  /** Renames a location, or removes it from the job (active false), which keeps it in the history. */
  updateLocation(id: string, patch: Partial<Pick<Location, 'name' | 'number' | 'label' | 'active'>>): Promise<void>;
  /** Done Here on a walk marks locations walked; Start a New Walk clears them. */
  setWalked(locationIds: string[], walked: boolean): Promise<void>;
  /** Admins only. The walk order: the locations given, in this order, take the places they had between them. */
  reorderLocations(jobId: string, orderedIds: string[]): Promise<void>;
  createItem(item: NewItem): Promise<string>;
  updateItem(id: string, patch: ItemPatch): Promise<void>;
  /** Many new items at once, from Paste or a template, saved in the order given so each wait points at an item already saved. */
  addItems(items: PlannedItem[]): Promise<string[]>;
  /** Several items at once, as one change: clearing a holdup, moving a Ready By. */
  updateItems(changes: { id: string; patch: ItemPatch }[]): Promise<void>;
  /** Keeps the pictures with the item, after the ones it has. */
  addPhotos(photos: NewPhoto[]): Promise<void>;
  updatePhoto(id: string, patch: PhotoPatch): Promise<void>;
  /** The job's plan sheets, not taken off, in order. */
  usePlans(jobId: string): PlanSheet[];
  addPlan(plan: NewPlan): Promise<string>;
  updatePlan(id: string, patch: PlanPatch): Promise<void>;
  addTrade(name: string): Promise<string>;
  /** Admins only. The order the trades come in on every list: these trades, in this order. */
  reorderTrades(orderedIds: string[]): Promise<void>;
  addCompany(input: { name: string; defaultTradeId: string | null }): Promise<string>;
  addCompanyToJob(jobId: string, companyId: string, tradeId: string): Promise<void>;
  /** Renames a company on every job (items waiting on it by the old name keep waiting on it), or changes its usual trade. */
  updateCompany(id: string, patch: Partial<Pick<Company, 'name' | 'defaultTradeId'>>): Promise<void>;
  /** Admins only. */
  addContact(contact: NewContact): Promise<string>;
  /** Admins only. Switched off with active false; nobody is deleted. */
  updateContact(id: string, patch: ContactPatch): Promise<void>;
  /** The company's link on the job: the one that works, or a new one. Returns its token. */
  companyLink(jobId: string, companyId: string): Promise<string>;
  /** Takes a link back: it stops working at once, and the next list sent gets a new one. */
  revokeCompanyLink(token: string): Promise<void>;
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
   * for (the visit keeps its dates until it is moved). On the phone these go through the
   * database's trade_confirm_visit and trade_ask_visit with the link's token.
   */
  companyConfirmVisit(input: { visitId: string; name: string | null }): Promise<void>;
  /**
   * From the company's own page: the work on an item is done, or not yet after all. The item stays
   * open until your team marks it Complete or Not Done. On the phone this goes through
   * the database's trade_mark_done with the link's token.
   */
  companyMarkDone(input: { jobId: string; companyId: string; itemId: string; done: boolean; name: string | null }): Promise<void>;
  companyAskVisit(input: { visitId: string; start: string; days: number; name: string | null }): Promise<void>;
  recordSend(send: NewSend): Promise<string>;
  undoSend(id: string): Promise<void>;
  setFormSettings(settings: FormSettings): Promise<void>;
  setViewSettings(settings: ViewSettings): Promise<void>;
  /** Sends a six digit code to the email. Anyone may sign up; someone switched off at their company is told so. */
  sendSignInCode(email: string): Promise<void>;
  /** Signs in with the code from the email: into the app, or as someone new who starts a company next. */
  verifySignInCode(email: string, code: string): Promise<SignInResult>;
  /** For someone new, after the code: a company of their own, with them as its admin. */
  startCompany(input: { company: string; name: string }): Promise<void>;
  /**
   * Deletes the signed-in person's account and signs out. Their records stay with the company under
   * Deleted Account; the last person at a company takes the whole company with it.
   */
  deleteAccount(): Promise<void>;
  /** Signs out; what is on the phone is cleared. Refused while changes made here have not gone up. */
  signOut(): Promise<void>;
  /** How this phone stands with the server. */
  useSync(): SyncInfo;
  /** Clears the list of changes the server turned down. */
  clearRefused(): Promise<void>;
}

export const DataContext = createContext<DataApi | null>(null);

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData needs the DataProvider from the root layout');
  return api;
}
