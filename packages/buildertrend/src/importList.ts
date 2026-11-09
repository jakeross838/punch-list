// One-time, read-only import of a job's Completion List into the app's own data shape.
// It follows the locked Completion List standard (8 October 2026): a room group is a room, an item is
// one piece of work for one company with one trade tag, and anything tagged DELETE is skipped.
// readForImport does the reading, through a guard that refuses anything but a read.
// importCompletionList is pure: it maps what was read and never calls Buildertrend.
// Whatever does not fit the standard is kept where it can be and reported in plain sentences.
//
// The first real read (Fish, 9 November 2026) showed what the stand-in could not: groups left from
// before the standard that are named for a trade, with each item's place as a tag; a Waiting On that
// is a short dropdown (Subcontractor, Owner, Supplier); words where an order number goes; work a
// company marked complete itself; and the builder's own Action Items beside the list. The options
// below are how a job says what its own list needs: its room list with levels, other names for a
// place, and whether the Action Items come too.

import {
  DAY_HOURS,
  defaultWaitingOnExtras,
  isEmail,
  isPriced,
  KIND_LABELS,
  MAX_HOURS,
  parseRoomList,
  SHARED_AREAS,
  SHARED_GROUP,
  tidyEmail,
  tidyTitle,
  tidyWaitingOn,
  TITLE_MAX,
  type ItemKind,
  type LocationKind,
} from '@punch/core';
import { DELETE_TAG_NAME, TASK_FIELDS, TASK_STATUS, TASK_TYPE, type TaskFieldKey } from './config.js';
import { normalizeCompletionList, readTags, tagIndex, type Assignee, type CompletionItem } from './completion.js';
import { parseDefinitions, type FieldDef } from './customFields.js';
import { BtError, isRecord } from './envelope.js';
import { checkSession, listTasks, taskFieldDefinitions, taskTags, type BtTask, type TaskList } from './tasks.js';
import type { Transport } from './transport.js';

// ---------- the app's shape ----------

export interface ImportedLocation {
  label: string;
  name: string;
  number: string | null;
  floor: string | null;
  kind: LocationKind;
  sortOrder: number;
}

export interface ImportedCompany {
  name: string;
  tradeName: string | null;
}

/** Someone at a company, from its Buildertrend record: who its lists go to. */
export interface ImportedContact {
  companyName: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ImportedItem {
  btExternalId: string;
  locationLabel: string;
  title: string;
  description: string;
  tradeName: string | null;
  companyName: string | null;
  ready: boolean;
  waitingOn: string[];
  /** YYYY-MM-DD */
  readyBy: string | null;
  boughtOut: boolean;
  poOrCo: string | null;
  kind: ItemKind;
  status: 'open' | 'complete';
  completedAt: string | null;
  /** About how long the work takes, in hours, from Buildertrend's Duration at 8 hours a working day. */
  hours: number | null;
  /** Buildertrend's Priority is 1 High. */
  priority: boolean;
  /** When the company marked it complete in Buildertrend itself: it comes in open, to check. */
  markedDoneAt: string | null;
  /** When it was put on the list in Buildertrend. */
  addedAt: string | null;
  /** One of the builder's own Action Items: nobody's work on the house, a thing to do. */
  actionItem: boolean;
  /** The builder's own people it is assigned to in Buildertrend, by name. */
  assignedTo: string[];
  /** An Action Item's due day, YYYY-MM-DD. The app has no place for it yet. */
  due: string | null;
}

export interface ImportedList {
  job: { name: string; address: string | null };
  locations: ImportedLocation[];
  trades: string[];
  companies: ImportedCompany[];
  /** The companies' people, when their Buildertrend records were read too. */
  contacts: ImportedContact[];
  items: ImportedItem[];
  /** Plain sentences for the owner, one per kind of problem, with counts. */
  problems: string[];
}

// ---------- reading ----------

/** What the client reads for a job: its tasks, the task field definitions and the tag names. */
export interface ImportSource {
  jobId: number;
  list: TaskList;
  definitions: FieldDef[];
  tagNames: Map<number, string>;
}

/** The one POST route that only reads. */
const READ_POSTS = new Set(['/apix/v2/Tasks/list']);

/** Lets reads through and refuses anything else before it goes out. The import never writes to Buildertrend. */
export function readOnlyTransport(inner: Transport): Transport {
  return {
    async request(method, path, body) {
      const isRead = method === 'GET' || (method === 'POST' && READ_POSTS.has(path));
      if (!isRead) throw new BtError(`${method} ${path}: refused, the import only reads from Buildertrend`);
      return inner.request(method, path, body);
    },
  };
}

/** Reads the job the way the Phase 0 read checks do, through the read-only guard. */
export async function readForImport(t: Transport, jobId: number): Promise<ImportSource> {
  const reader = readOnlyTransport(t);
  await checkSession(reader);
  const definitions = parseDefinitions(await taskFieldDefinitions(reader));
  const tagNames = tagIndex(await taskTags(reader));
  const list = await listTasks(reader, jobId);
  return { jobId, list, definitions, tagNames };
}

// ---------- mapping ----------

/** A company's record in Buildertrend, as much of it as the import uses. */
export interface SubRecord {
  id: number;
  company?: string | null;
  primaryContact?: string | null;
  businessPhone?: string | null;
  cellPhone?: string | null;
  emails?: { emailAddress?: string | null; friendlyName?: string | null }[] | null;
}

export interface ImportOptions {
  /** The job's name and address in the app. Without it they come from Buildertrend's job record. */
  job?: { name: string; address: string | null };
  /**
   * The job's room list as Job Setup takes it pasted: a line ending in a colon names the level for
   * the rooms under it, and the lines under "Outside and Whole House:" are areas outside. With it the
   * locations are this list, in this order, and a group in Buildertrend that is not on it is not a
   * location: its items go by a tag that names one. Without it every group is a room.
   */
  rooms?: string;
  /** Other names for a location: a group's title or a place tag in Buildertrend, and the location it means. */
  places?: Record<string, string>;
  /** A company's name as the app should spell it, by its name in Buildertrend. */
  companyNames?: Record<string, string>;
  /** A title to use in place of Buildertrend's, by the task's external id: for one over the app's 80 characters. */
  titles?: Record<string, string>;
  /** Bring the open Action Items too. One with no tag naming a location goes to this one (desk work). */
  actionItems?: { place: string };
  /** The companies' records, for their people. */
  subs?: SubRecord[];
}

/** The same wording as the app's Waiting On list. */
const ROSS_BUILT = 'Ross Built';
/** Assignment loginType for a Ross Built user (3 is a sub or vendor). */
const INTERNAL_USER = 1;

const FIELD_LABELS: Record<TaskFieldKey, string> = {
  location: 'Location',
  ready: 'Ready',
  waitingOn: 'Waiting On',
  readyBy: 'Ready By',
  boughtOut: 'Bought Out',
  poOrCo: 'PO / CO',
};

/** The client's stand-ins for a tag or a dropdown choice whose name did not come back. */
const UNKNOWN_TAG = /^tag \d+$/;
const UNKNOWN_OPTION = /^option \d+$/;

type CompanyIssue = 'none' | 'unnamed' | 'rossBuilt' | 'many';
type TradeIssue = 'none' | 'unnamed' | 'many';

/** What an open item that is not ready waits on when Buildertrend does not say: the app takes none that waits on nothing. */
export const NOT_SAID = 'Not Said';

interface Placement {
  item: CompletionItem;
  label: string;
  company: string | null;
  trade: string | null;
  /** The tag that placed it, for an item in a group that is not a location. */
  placeTag: string | null;
}

/** Counts behind the problem sentences. */
interface Tally {
  missingFields: string[];
  jobFallbackName: string | null;
  floorGroups: string[];
  deleteGroups: string[];
  deleteGroupItems: number;
  duplicateRooms: { label: string; count: number }[];
  unnamedGroups: string[];
  offListGroups: string[];
  offListItems: number;
  deleteItems: number;
  nested: number;
  typedTasks: number;
  outsidePlaced: number;
  outsideByTag: number;
  outsideLeftOut: string[];
  locationMismatch: number;
  company: Record<CompanyIssue, number>;
  trade: Record<TradeIssue, number>;
  otherTrade: number;
  otherTradeCompanies: string[];
  notReadyNoWaitingOn: number;
  completeMadeReady: number;
  completeStillWaiting: number;
  readyWithWaitingOn: number;
  readyByNotDate: number;
  orderWords: string[];
  orderWordItems: number;
  addedScope: number;
  addedScopeBoughtOutNoPo: number;
  completion: number;
  completeNoDate: number;
  markedDone: number;
  longTitles: number;
  actionItems: number;
  actionItemsDue: number;
  actionItemsNobody: number;
  noContact: string[];
  badEmails: number;
}

export function importCompletionList(source: ImportSource, options: ImportOptions = {}): ImportedList {
  const { jobId, list, definitions, tagNames } = source;
  const tally = newTally();
  const normalized = normalizeCompletionList(jobId, list, definitions, tagNames);
  const live = new Map(list.tasks.filter((t) => t.isDeleted !== true).map((t) => [t.taskId, t] as const));
  const punch = new Map([...live].filter(([, t]) => t.taskType === TASK_TYPE.punchList));

  // Location is not asked for: it left Buildertrend when the room became the group.
  tally.missingFields = (Object.keys(TASK_FIELDS) as TaskFieldKey[])
    .filter((key) => key !== 'location' && !definitions.some((d) => d.id === TASK_FIELDS[key]))
    .map((key) => FIELD_LABELS[key]);

  let job = options.job;
  if (!job) {
    const found = jobRecord(list, jobId);
    const name = found.name ?? `Buildertrend job ${jobId}`;
    if (!found.name) tally.jobFallbackName = name;
    job = { name, address: found.address };
  }

  // Rooms: the job's own room list when it is given; otherwise every room group through the app's
  // room rules, in Buildertrend's order. Then the shared areas.
  const given = options.rooms !== undefined;
  const deleteGroups = normalized.rooms.filter((r) => taggedDelete(punch.get(r.taskId), tagNames));
  const groups = normalized.rooms.filter((r) => !deleteGroups.includes(r));
  const titles = groups.map((g) => g.label.replace(/\s+/g, ' ').trim());
  const parsed = given ? givenRooms(options.rooms ?? '') : parseRoomList(titles.join('\n')).locations;
  // A shared area is spelled the way it is on every job, wherever Buildertrend has it.
  const sharedSpelling = new Map(SHARED_AREAS.map((s) => [s.toLowerCase(), s] as const));
  const locations = parsed.map((l): ImportedLocation => {
    const shared = sharedSpelling.get(l.label.toLowerCase());
    if (shared) return { label: shared, name: shared, number: null, floor: null, kind: 'shared', sortOrder: l.sortOrder };
    return { label: l.label, name: l.name, number: l.number, floor: l.floor, kind: l.kind, sortOrder: l.sortOrder };
  });
  const locationByKey = new Map(locations.map((l) => [l.label.toLowerCase(), l] as const));
  const otherNames = new Map(Object.entries(options.places ?? {}).map(([from, to]) => [nameKey(from), to] as const));
  /** The location a name means: another name given for one, or its own label by the room rules. */
  const locationNamed = (name: string): ImportedLocation | undefined => {
    const label = otherNames.get(nameKey(name)) ?? roomLabelOf(name);
    return label ? locationByKey.get(label.toLowerCase()) : undefined;
  };

  const labelOfGroup = new Map(
    groups.map((g, i) => [g.taskId, given ? (locationNamed(titles[i] ?? '')?.label ?? null) : roomLabelOf(titles[i] ?? '')] as const),
  );
  tally.deleteGroups = deleteGroups.map((g) => g.label);
  tally.duplicateRooms = repeated([...labelOfGroup.values()].filter((l): l is string => l !== null));
  groups.forEach((g, i) => {
    const title = titles[i] ?? '';
    if (labelOfGroup.get(g.taskId)) return;
    if (given) tally.offListGroups.push(title || 'a group with no title');
    else if (title.endsWith(':')) tally.floorGroups.push(title);
    else tally.unnamedGroups.push(title || 'a group with no title');
  });

  // A tag can name the item's place instead of its trade: the lists from before the standard have
  // both on each item ("Garage 003" and "Stucco"). A tag is the trade unless it names a location and
  // another tag does not.
  const tradeTagsOf = (item: CompletionItem): string[] => {
    const plain = item.trades.filter((t) => !locationNamed(t));
    return plain.length > 0 ? plain : item.trades;
  };
  const placeTagOf = (item: CompletionItem, trade: string | null): { tag: string; location: ImportedLocation } | null => {
    for (const tag of item.trades) {
      const location = tag === trade ? undefined : locationNamed(tag);
      if (location) return { tag, location };
    }
    return null;
  };

  // Items: in their room group where it is a location, otherwise placed by their Location field or
  // by a tag that names a location, or left out.
  const placed: { item: CompletionItem; label: string; placeTag: string | null }[] = [];
  const outside: CompletionItem[] = [];
  const place = (item: CompletionItem, label: string | null | undefined): void => {
    if (item.markedDelete) tally.deleteItems += 1;
    else if (label) placed.push({ item, label, placeTag: null });
    else outside.push(item);
  };
  for (const group of groups) {
    const label = labelOfGroup.get(group.taskId);
    for (const item of group.items) {
      if (item.markedDelete) {
        place(item, label);
        continue;
      }
      if (given && !label) tally.offListItems += 1;
      if (item.typedTask) tally.typedTasks += 1;
      if (label && locationFieldDiffers(item, label)) tally.locationMismatch += 1;
      place(item, label);
    }
  }
  for (const group of deleteGroups) {
    for (const item of group.items) {
      if (!item.markedDelete) tally.deleteGroupItems += 1;
      place(item, null);
    }
  }
  for (const item of normalized.nested) {
    const roomId = roomAbove(punch.get(item.taskId), punch, labelOfGroup);
    const label = roomId === null ? null : labelOfGroup.get(roomId);
    if (label && !item.markedDelete) tally.nested += 1;
    place(item, label);
  }
  for (const item of normalized.orphans) place(item, null);
  for (const item of outside) {
    const named = locationFieldLabel(item);
    const byField = named ? locationByKey.get(named.toLowerCase()) : undefined;
    const byTag = byField ? null : placeTagOf(item, tradeOf(tradeTagsOf(item)).name);
    if (byField) {
      placed.push({ item, label: byField.label, placeTag: null });
      tally.outsidePlaced += 1;
    } else if (byTag) {
      // The tag comes off the title only when it is the location's own name: another name for a
      // wider location ("Pool Vault" on the ground level) still says where.
      const own = (roomLabelOf(byTag.tag) ?? '').toLowerCase() === byTag.location.label.toLowerCase();
      placed.push({ item, label: byTag.location.label, placeTag: own ? byTag.tag : null });
      tally.outsideByTag += 1;
    } else {
      tally.outsideLeftOut.push(tidyTitle(item.title));
    }
  }

  // Companies and trades, each spelled one way across the job.
  const companySpelling = new Map<string, string>();
  const tradeSpelling = new Map<string, string>();
  const renamed = new Map(Object.entries(options.companyNames ?? {}).map(([from, to]) => [nameKey(from), to.trim()] as const));
  const subOfCompany = new Map<string, number>();
  const companyFor = (assignees: Assignee[]): { name: string | null; issue: CompanyIssue | null } => {
    const company = companyOf(assignees);
    if (company.name === null || company.issue === 'rossBuilt') return company;
    const name = spelled(companySpelling, renamed.get(nameKey(company.name)) ?? tidyCompany(company.name));
    const sub = assignees.find((a) => a.loginType !== INTERNAL_USER && a.name.trim() !== '');
    if (name !== null && sub && !subOfCompany.has(name.toLowerCase())) subOfCompany.set(name.toLowerCase(), sub.id);
    return { name, issue: company.issue };
  };
  const placements: Placement[] = placed.map(({ item, label, placeTag }) => {
    const company = companyFor(item.assignees);
    const trade = tradeOf(tradeTagsOf(item));
    if (company.issue) tally.company[company.issue] += 1;
    if (trade.issue) tally.trade[trade.issue] += 1;
    // The location's own label, so every item names its room exactly as the room list does.
    const location = locationByKey.get(label.toLowerCase());
    return {
      item,
      label: location?.label ?? label,
      company: company.issue === 'rossBuilt' ? spelled(companySpelling, company.name) : company.name,
      trade: spelled(tradeSpelling, trade.name),
      placeTag,
    };
  });

  // The builder's own Action Items, when they are asked for: the open ones, soonest due first.
  const actions: ImportedItem[] = [];
  if (options.actionItems) {
    const desk = options.actionItems.place.replace(/\s+/g, ' ').trim();
    const open = normalized.actionItems.filter((a) => !a.complete && !a.markedDelete);
    const needsDesk = open.some((a) => !placeTagOf(a, null));
    if (needsDesk && !locationNamed(desk)) {
      const label = roomLabelOf(desk) ?? desk;
      const added: ImportedLocation = { label, name: label, number: null, floor: null, kind: 'shared', sortOrder: locations.length + 1 };
      locations.push(added);
      locationByKey.set(label.toLowerCase(), added);
    }
    for (const item of open) {
      const location = placeTagOf(item, null)?.location ?? locationNamed(desk);
      if (!location) continue;
      const company = companyFor(item.assignees.filter((a) => a.loginType !== INTERNAL_USER));
      actions.push(toActionItem(item, location.label, company.name, live.get(item.taskId), tally, options));
    }
    // Soonest due first, the ones with no date last; ties stay in Buildertrend's order.
    const dueOrder = (a: ImportedItem) => a.due ?? '9999-12-31';
    actions.sort((a, b) => dueOrder(a).localeCompare(dueOrder(b)));
  }

  const known = [...defaultWaitingOnExtras(ROSS_BUILT), ...companySpelling.values()];
  const sortOrderOf = (label: string) => locationByKey.get(label.toLowerCase())?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const items = [...placements.map((p) => toItem(p, known, live.get(p.item.taskId), tally, options)), ...actions].sort(
    (a, b) => sortOrderOf(a.locationLabel) - sortOrderOf(b.locationLabel),
  );

  // Each company once, with the trade on most of its items.
  const tradesByCompany = new Map<string, Map<string, number>>();
  for (const item of items) {
    if (item.companyName === null) continue;
    const counts = tradesByCompany.get(item.companyName) ?? new Map<string, number>();
    if (item.tradeName !== null) counts.set(item.tradeName, (counts.get(item.tradeName) ?? 0) + 1);
    tradesByCompany.set(item.companyName, counts);
  }
  // A company's own trade is the tag on most of its items. The builder's name as a tag says who does
  // the work: it is the trade of the builder's own crew, and of another company only when its items
  // carry no other.
  const ownTrade = (company: string, counts: Map<string, number>): string | null => {
    if (company.toLowerCase().startsWith(ROSS_BUILT.toLowerCase())) return mostUsed(counts);
    const others = new Map([...counts].filter(([trade]) => trade.toLowerCase() !== ROSS_BUILT.toLowerCase()));
    return mostUsed(others.size > 0 ? others : counts);
  };
  const companies = [...tradesByCompany]
    .map(([name, counts]): ImportedCompany => ({ name, tradeName: ownTrade(name, counts) }))
    .sort((a, b) => compareText(a.name, b.name));
  // In the app the trade is not asked for: it follows the company's trade on the job. So each item
  // comes in under its company's own trade, whatever tag it was left with in Buildertrend.
  const tradeOfCompany = new Map(companies.map((c) => [c.name, c.tradeName] as const));
  for (const item of items) {
    const own = item.companyName === null ? null : (tradeOfCompany.get(item.companyName) ?? null);
    if (own === null || item.tradeName === own) continue;
    if (item.tradeName !== null) {
      tally.otherTrade += 1;
      if (!tally.otherTradeCompanies.includes(item.companyName ?? '')) tally.otherTradeCompanies.push(item.companyName ?? '');
    }
    item.tradeName = own;
  }
  const trades = [...new Set(items.map((i) => i.tradeName).filter((t): t is string => t !== null))].sort(compareText);

  // Their people, when the companies' own records were read.
  const contacts: ImportedContact[] = [];
  if (options.subs) {
    const records = new Map(options.subs.map((r) => [Number(r.id), r] as const));
    for (const company of companies) {
      const id = subOfCompany.get(company.name.toLowerCase());
      const people = id === undefined ? [] : contactsOf(company.name, records.get(id), tally);
      if (people.length === 0 && company.name !== ROSS_BUILT) tally.noContact.push(company.name);
      contacts.push(...people);
    }
  }

  return { job, locations, trades, companies, contacts, items, problems: problemSentences(tally) };
}

/**
 * The job's own room list, read the way Job Setup reads it, with one thing more: the lines under
 * "Outside and Whole House:" are areas outside, not rooms on a level. The shared areas it does not
 * name are added at the end, as on every job.
 */
function givenRooms(text: string): ImportedLocation[] {
  const out: ImportedLocation[] = parseRoomList(text, { includeShared: false }).locations.map((l) =>
    l.floor?.toLowerCase() === SHARED_GROUP.toLowerCase() ? { ...l, floor: null, kind: 'shared' } : { ...l },
  );
  const seen = new Set(out.map((l) => l.label.toLowerCase()));
  for (const name of SHARED_AREAS) {
    if (!seen.has(name.toLowerCase())) out.push({ label: name, name, number: null, floor: null, kind: 'shared', sortOrder: out.length + 1 });
  }
  return out;
}

function toItem(p: Placement, known: string[], task: BtTask | undefined, tally: Tally, options: ImportOptions): ImportedItem {
  const { item } = p;
  // Only the builder completes an item in the app. One its own company marked complete comes in open,
  // with the day it was marked, for the builder to look at.
  const markedDoneAt = item.complete && completedByItsCompany(item, task) ? completedAtOf(task) : null;
  const complete = item.complete && markedDoneAt === null;
  const done = item.complete;
  if (markedDoneAt !== null) tally.markedDone += 1;
  const { title, description } = titleAndDescription(item, p.placeTag, tally, options);
  const order = text(item.fields.poOrCo);
  // An order number has a number in it. "None", or who is paying, is not one.
  const poOrCo = order !== null && /\d/.test(order) ? order : null;
  if (order !== null && poOrCo === null) {
    tally.orderWordItems += 1;
    if (!tally.orderWords.some((w) => w.toLowerCase() === order.toLowerCase())) tally.orderWords.push(order);
  }
  const boughtOut = checked(item.fields.boughtOut);
  const readyByText = dateText(item.fields.readyBy);
  let ready = checked(item.fields.ready);
  let waitingOn = splitWaitingOn(text(item.fields.waitingOn), known);
  let readyBy = isoDate(readyByText);

  if (ready) {
    // As in the app: Waiting On and Ready By only mean something while an item is not ready.
    if (!done && (waitingOn.length > 0 || readyByText !== null)) tally.readyWithWaitingOn += 1;
    waitingOn = [];
    readyBy = null;
  } else if (done) {
    // Done work was ready, whatever it waited on before, and the app does not take an item that is
    // not ready and waits on nothing.
    if (waitingOn.length === 0) tally.completeMadeReady += 1;
    else tally.completeStillWaiting += 1;
    ready = true;
    waitingOn = [];
    readyBy = null;
  } else {
    if (waitingOn.length === 0) {
      tally.notReadyNoWaitingOn += 1;
      waitingOn = [NOT_SAID];
    }
    if (readyByText !== null && readyBy === null) tally.readyByNotDate += 1;
  }

  // Buildertrend does not say which work is a deficiency, so work in scope comes in as Incomplete.
  const kind: ItemKind = isAddedScope(poOrCo, title, description) ? 'added_scope' : 'completion';
  if (kind === 'added_scope') {
    tally.addedScope += 1;
    if (boughtOut && poOrCo === null) tally.addedScopeBoughtOutNoPo += 1;
  } else tally.completion += 1;
  const completedAt = complete ? completedAtOf(task) : null;
  if (complete && completedAt === null) tally.completeNoDate += 1;

  return {
    btExternalId: item.externalId,
    locationLabel: p.label,
    title,
    description,
    tradeName: p.trade,
    companyName: p.company,
    ready,
    waitingOn,
    readyBy,
    // As in the app, Bought Out follows the type and the order number.
    boughtOut: isPriced({ kind, poOrCo }),
    poOrCo,
    kind,
    status: complete ? 'complete' : 'open',
    completedAt,
    hours: hoursOf(item.more.duration),
    priority: isHigh(item.more.priority),
    markedDoneAt,
    addedAt: timeText(task?.addedByDateUtc),
    actionItem: false,
    assignedTo: [],
    due: null,
  };
}

/** One of the builder's own Action Items: ready, nobody's trade, assigned to the people it is in Buildertrend. */
function toActionItem(
  item: CompletionItem,
  label: string,
  company: string | null,
  task: BtTask | undefined,
  tally: Tally,
  options: ImportOptions,
): ImportedItem {
  const { title, description } = titleAndDescription(item, null, tally, options);
  const assignedTo = distinctNames(item.assignees.filter((a) => a.loginType === INTERNAL_USER).map((a) => a.name));
  const due = isoDate(timeText(task?.endDate));
  tally.actionItems += 1;
  if (due !== null) tally.actionItemsDue += 1;
  if (assignedTo.length === 0 && company === null) tally.actionItemsNobody += 1;
  return {
    btExternalId: item.externalId,
    locationLabel: label,
    title,
    description,
    tradeName: null,
    companyName: company,
    ready: true,
    waitingOn: [],
    readyBy: null,
    boughtOut: true,
    poOrCo: null,
    kind: 'completion',
    status: 'open',
    completedAt: null,
    hours: null,
    priority: false,
    markedDoneAt: null,
    addedAt: timeText(task?.addedByDateUtc),
    actionItem: true,
    assignedTo,
    due,
  };
}

/**
 * The title the app keeps, and the description. A title from before the standard ends in its place
 * ("Install baseboard, Laundry 119"): placed by that tag, it loses it, since the location says it now.
 * One over the app's 80 characters is cut at a whole word, with its full wording at the top of the
 * description, unless the job gave a title for it.
 */
function titleAndDescription(
  item: CompletionItem,
  placeTag: string | null,
  tally: Tally,
  options: ImportOptions,
): { title: string; description: string } {
  const own = options.titles?.[item.externalId];
  let title = tidyTitle(own ?? item.title);
  if (own === undefined && placeTag !== null) {
    const ending = `, ${placeTag}`.toLowerCase();
    if (title.toLowerCase().endsWith(ending) && title.length > ending.length) title = tidyTitle(title.slice(0, -ending.length));
  }
  if (title.length <= TITLE_MAX) return { title, description: item.description };
  tally.longTitles += 1;
  const words = title.slice(0, TITLE_MAX + 1).split(' ').slice(0, -1).join(' ');
  const cut = tidyTitle((words || title.slice(0, TITLE_MAX)).replace(/[\s,;:]+$/, ''));
  return { title: cut, description: [title, item.description].filter((part) => part !== '').join('\n\n') };
}

/** Whether the one who marked it complete is a company it is assigned to, not one of the builder's people. */
function completedByItsCompany(item: CompletionItem, task: BtTask | undefined): boolean {
  const by = Number(task?.statusLastChangedById);
  return Number.isFinite(by) && item.assignees.some((a) => a.loginType !== INTERNAL_USER && a.id === by);
}

/** Buildertrend's Duration in working days ("0.5 day", "2 days") as the app's hours. */
function hoursOf(value: string | boolean | null): number | null {
  const m = typeof value === 'string' ? /^(\d+(?:\.\d+)?)\s*days?$/i.exec(value.trim()) : null;
  if (!m) return null;
  const hours = Number(m[1]) * DAY_HOURS;
  return hours > 0 ? Math.min(MAX_HOURS, Math.round(hours * 4) / 4) : null;
}

/** Buildertrend's Priority: "1 High" is wanted first. */
function isHigh(value: string | boolean | null): boolean {
  return typeof value === 'string' && /^(?:1\b|high\b)/i.test(value.trim());
}

/** A time as Buildertrend sends it, or null. */
function timeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// ---------- the companies' people ----------

/**
 * A company's people from its Buildertrend record: one for each email, named by the email's own
 * name or, for the first, the primary contact, with the company's phone on the first. A company with
 * only a phone has one person, reached by text.
 */
function contactsOf(companyName: string, record: SubRecord | undefined, tally: Tally): ImportedContact[] {
  if (!record) return [];
  const one = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');
  const primary = one(record.primaryContact).slice(0, 80);
  const phone = tidyPhone(record.cellPhone) ?? tidyPhone(record.businessPhone);
  const seen = new Set<string>();
  const emails: { email: string; name: string }[] = [];
  for (const e of record.emails ?? []) {
    const address = one(e.emailAddress);
    if (address === '') continue;
    if (!isEmail(address)) {
      tally.badEmails += 1;
      continue;
    }
    const email = tidyEmail(address);
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push({ email, name: one(e.friendlyName).slice(0, 80) });
  }
  if (emails.length === 0) return phone !== null ? [{ companyName, name: primary, email: null, phone }] : [];
  return emails.map((e, i) => ({ companyName, name: e.name || (i === 0 ? primary : ''), email: e.email, phone: i === 0 ? phone : null }));
}

/** A phone number as the app writes one, "941 555 0123", when it is a plain United States number; otherwise as it is. */
function tidyPhone(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().replace(/\s+/g, ' ');
  if (raw === '') return null;
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10 && /^[\d\s().+-]+$/.test(raw)) return `${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
  return raw.slice(0, 40);
}

/** A company's name tidied: single spaces, and no space before a comma. */
function tidyCompany(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/\s+,/g, ',');
}

/** A name as a key: trimmed, single spaces, lower case. */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// ---------- Waiting On ----------

const SEPARATOR = /\s*[,;]\s*(?:(?:and|&)\s+)?|\s+and\s+|\s+&\s*|&\s+|\s*\/\s*/i;
/** Single letters around a slash ("A/C") stay one word. */
const LETTER_PAIR = /\b[A-Za-z]\/[A-Za-z]\b/g;
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

/**
 * Waiting On text to a list of names: split at commas, "and", "&" and "/", trimmed, each name once.
 * Known names (Ross Built, Owner, the companies on the job) keep their own spelling and are never
 * split, so "Bay and Gulf Glass" stays whole. A name written all in lower case gets capitals.
 */
export function splitWaitingOn(text: string | null | undefined, known: readonly string[] = defaultWaitingOnExtras(ROSS_BUILT)): string[] {
  if (!text) return [];
  const spelling = new Map<string, string>();
  for (const name of known) if (!spelling.has(name.trim().toLowerCase())) spelling.set(name.trim().toLowerCase(), name.trim());
  const held: string[] = [];
  const hold = (value: string) => `\u0000${held.push(value) - 1}\u0000`;
  let rest = text.replace(/\r?\n/g, ', ').replace(/\s+/g, ' ');
  const joined = [...spelling.values()].filter((k) => SEPARATOR.test(k)).sort((a, b) => b.length - a.length);
  for (const name of joined) rest = rest.replace(new RegExp(escapeRegExp(name), 'gi'), () => hold(name));
  rest = rest.replace(LETTER_PAIR, (pair) => hold(pair));
  const names = rest
    .split(SEPARATOR)
    .map((part) => part.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)] ?? ''))
    .map((part) => part.trim().replace(/^(?:and|&)\s+|\s+(?:and|&)$/gi, '').trim())
    .filter((part) => /[A-Za-z0-9]/.test(part))
    .map((part) => spelling.get(part.toLowerCase()) ?? (part === part.toLowerCase() ? capitalizeWords(part) : part));
  return tidyWaitingOn(names);
}

function capitalizeWords(name: string): string {
  return name
    .split(' ')
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- kind ----------

const CHANGE_ORDER_NUMBER = /\b(?:C\.?\s?O\.?|change\s+order)\s*(?:#|no\.?|number)?\s*[-:#]?\s*\d+/i;
const SAYS_ADDED_SCOPE = /\badded[\s-]+scope\b/i;

/** Clearly added scope: a change order number in PO / CO, or the words "added scope" on the item. */
export function isAddedScope(poOrCo: string | null, title: string, description: string): boolean {
  if (poOrCo !== null && CHANGE_ORDER_NUMBER.test(poOrCo)) return true;
  return [poOrCo ?? '', title, description].some((t) => SAYS_ADDED_SCOPE.test(t));
}

// ---------- reading the parts ----------

/** The label the app's room rules give one line, or null when the line is not a room. */
function roomLabelOf(line: string): string | null {
  return parseRoomList(line, { includeShared: false }).locations[0]?.label ?? null;
}

/** The room an item's Location field names, through the same room rules. */
function locationFieldLabel(item: CompletionItem): string | null {
  const value = item.fields.location;
  if (typeof value !== 'string' || UNKNOWN_OPTION.test(value)) return null;
  return roomLabelOf(value);
}

function locationFieldDiffers(item: CompletionItem, label: string): boolean {
  const named = locationFieldLabel(item);
  return named !== null && named.toLowerCase() !== label.toLowerCase();
}

function taggedDelete(task: BtTask | undefined, tagNames: Map<number, string>): boolean {
  return readTags(task?.tags, tagNames).some((t) => t.name.toUpperCase() === DELETE_TAG_NAME);
}

/** Walks up from a nested item to the room group above it. */
function roomAbove(task: BtTask | undefined, punch: Map<number, BtTask>, rooms: Map<number, unknown>): number | null {
  const seen = new Set<number>();
  let id = task?.ancestorId ?? null;
  while (id !== null && !seen.has(id)) {
    if (rooms.has(id)) return id;
    seen.add(id);
    id = punch.get(id)?.ancestorId ?? null;
  }
  return null;
}

/** One company per item: a sub or vendor first; an item only a Ross Built user holds is Ross Built's. */
function companyOf(assignees: Assignee[]): { name: string | null; issue: CompanyIssue | null } {
  const companies = assignees.filter((a) => a.loginType !== INTERNAL_USER);
  const names = distinctNames(companies.map((a) => a.name));
  const first = names[0];
  if (first !== undefined) return { name: first, issue: names.length > 1 ? 'many' : null };
  if (companies.length > 0) return { name: null, issue: 'unnamed' };
  if (assignees.length > 0) return { name: ROSS_BUILT, issue: 'rossBuilt' };
  return { name: null, issue: 'none' };
}

/** One trade per item: its first tag that is not DELETE and has a name. */
function tradeOf(tags: string[]): { name: string | null; issue: TradeIssue | null } {
  const names = distinctNames(tags.filter((t) => !UNKNOWN_TAG.test(t)));
  const first = names[0];
  if (first !== undefined) return { name: first, issue: names.length > 1 ? 'many' : null };
  return { name: null, issue: tags.length > 0 ? 'unnamed' : 'none' };
}

/** The job's name and address from the jobs list that comes with the tasks. Its shape is not confirmed yet. */
function jobRecord(list: TaskList, jobId: number): { name: string | null; address: string | null } {
  const record = (list.jobs ?? []).filter(isRecord).find((j) => Number(j.jobId ?? j.id) === jobId);
  return {
    name: firstText(record, ['jobName', 'name', 'title']),
    address: firstText(record, ['address', 'streetAddress', 'street', 'jobAddress']),
  };
}

const COMPLETED_AT_KEYS = ['completedDate', 'completedOn', 'dateCompleted', 'completionDate', 'completedAt'];

/**
 * When the item was completed, if the task carries a date for it. The live list has no completion
 * date of its own: a complete task's last status change is when it was completed.
 */
function completedAtOf(task: BtTask | undefined): string | null {
  for (const key of COMPLETED_AT_KEYS) {
    const value = task?.[key];
    if (typeof value === 'string' && isoDate(value) !== null) return value.trim();
  }
  const changed = task?.status === TASK_STATUS.completed ? task.statusLastChangedDateUtc : null;
  return typeof changed === 'string' && isoDate(changed) !== null ? changed.trim() : null;
}

function text(value: string | boolean | null): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

/** Date text, or null when empty, counting the empty date 0001-01-01 as empty. */
function dateText(value: string | boolean | null): string | null {
  const t = text(value);
  return t === null || t.startsWith('0001-01-01') ? null : t;
}

function checked(value: string | boolean | null): boolean {
  return value === true || (typeof value === 'string' && /^(true|yes|1)$/i.test(value.trim()));
}

/** YYYY-MM-DD from an ISO date or a US date (10/30/2026). Null for anything else, and for the empty date 0001-01-01. */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1]?.padStart(2, '0'), us[2]?.padStart(2, '0')] : [];
  const [y, m, d] = parts;
  if (!y || !m || !d || Number(y) < 1900) return null;
  const day = `${y}-${m}-${d}`;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

function firstText(record: Record<string, unknown> | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function distinctNames(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name !== '' && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/** The first spelling of a name seen on the job. */
function spelled(spellings: Map<string, string>, name: string | null): string | null {
  if (name === null) return null;
  const key = name.toLowerCase();
  if (!spellings.has(key)) spellings.set(key, name);
  return spellings.get(key) ?? name;
}

function repeated(labels: string[]): { label: string; count: number }[] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const label of labels) {
    const entry = seen.get(label.toLowerCase());
    if (entry) entry.count += 1;
    else seen.set(label.toLowerCase(), { label, count: 1 });
  }
  return [...seen.values()].filter((e) => e.count > 1);
}

function mostUsed(counts: Map<string, number>): string | null {
  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1] || (entry[1] === best[1] && compareText(entry[0], best[0]) < 0)) best = entry;
  }
  return best ? best[0] : null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en');
}

// ---------- the problem sentences ----------

function newTally(): Tally {
  return {
    missingFields: [],
    jobFallbackName: null,
    floorGroups: [],
    deleteGroups: [],
    deleteGroupItems: 0,
    duplicateRooms: [],
    unnamedGroups: [],
    offListGroups: [],
    offListItems: 0,
    deleteItems: 0,
    nested: 0,
    typedTasks: 0,
    outsidePlaced: 0,
    outsideByTag: 0,
    outsideLeftOut: [],
    locationMismatch: 0,
    company: { none: 0, unnamed: 0, rossBuilt: 0, many: 0 },
    trade: { none: 0, unnamed: 0, many: 0 },
    otherTrade: 0,
    otherTradeCompanies: [],
    notReadyNoWaitingOn: 0,
    completeMadeReady: 0,
    completeStillWaiting: 0,
    readyWithWaitingOn: 0,
    readyByNotDate: 0,
    orderWords: [],
    orderWordItems: 0,
    addedScope: 0,
    addedScopeBoughtOutNoPo: 0,
    completion: 0,
    completeNoDate: 0,
    markedDone: 0,
    longTitles: 0,
    actionItems: 0,
    actionItemsDue: 0,
    actionItemsNobody: 0,
    noContact: [],
    badEmails: 0,
  };
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "A", "A and B", "A, B and C"; past five names, "and 3 more". */
function nameList(names: string[], max = 5): string {
  const shown = names.slice(0, max);
  const parts = names.length > max ? [...shown, `${names.length - max} more`] : shown;
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function problemSentences(t: Tally): string[] {
  const out: string[] = [];
  const say = (when: boolean | number, sentence: () => string): void => {
    if (when) out.push(sentence());
  };
  const one = (n: number) => n === 1;
  const c = t.company;
  const tr = t.trade;
  const placedOutside = t.outsidePlaced + t.outsideByTag;
  const outsideTotal = placedOutside + t.outsideLeftOut.length;
  const firstDuplicate = t.duplicateRooms[0];

  say(t.missingFields.length, () => {
    const n = t.missingFields.length;
    return `The ${nameList(t.missingFields)} ${one(n) ? 'field was' : 'fields were'} not in Buildertrend's task field list, so ${one(n) ? 'its values' : 'their values'} may not have come through correctly.`;
  });
  say(t.jobFallbackName !== null, () => `Buildertrend did not return the job's name, so it is called "${t.jobFallbackName}" until it is renamed in the app.`);

  // Rooms
  say(t.floorGroups.length, () =>
    one(t.floorGroups.length)
      ? `1 room group reads as a floor name (${t.floorGroups[0]}), so the rooms after it were given that floor.`
      : `${t.floorGroups.length} room groups read as floor names (${nameList(t.floorGroups)}), so the rooms after each were given its floor.`,
  );
  say(t.deleteGroups.length, () => {
    const g = t.deleteGroups.length;
    const n = t.deleteGroupItems;
    const tail = n === 0 ? '.' : `; the ${count(n, 'item')} in ${one(g) ? 'it' : 'them'} ${one(n) ? 'is' : 'are'} treated as not in a room.`;
    return `${count(g, 'room group')} tagged DELETE ${one(g) ? 'was' : 'were'} skipped (${nameList(t.deleteGroups)})${tail}`;
  });
  say(t.duplicateRooms.length, () =>
    one(t.duplicateRooms.length) && firstDuplicate
      ? `${firstDuplicate.label} appears as ${firstDuplicate.count} room groups in Buildertrend; their items were put together under one room.`
      : `${t.duplicateRooms.length} rooms appear as more than one room group in Buildertrend (${nameList(t.duplicateRooms.map((d) => d.label))}); the items of each were put together under one room.`,
  );
  say(t.unnamedGroups.length, () => {
    const g = t.unnamedGroups.length;
    return `${count(g, 'room group')} ${one(g) ? 'has' : 'have'} no room name (${nameList(t.unnamedGroups)}), so ${one(g) ? 'its' : 'their'} items are treated as not in a room.`;
  });
  say(t.offListGroups.length, () => {
    const g = t.offListGroups.length;
    const n = t.offListItems;
    return `${count(g, 'group')} in Buildertrend ${one(g) ? 'is' : 'are'} not on the job's room list (${nameList(t.offListGroups)}), so ${one(g) ? 'its' : 'their'} ${count(n, 'item')} ${one(n) ? 'is' : 'are'} treated as not in a room.`;
  });

  // Where the items went
  say(t.deleteItems, () => `${count(t.deleteItems, 'item')} tagged DELETE ${one(t.deleteItems) ? 'was' : 'were'} skipped.`);
  say(t.nested, () =>
    one(t.nested)
      ? '1 item was nested more than one level deep; it was imported into its room as a regular item.'
      : `${t.nested} items were nested more than one level deep; each was imported into its room as a regular item.`,
  );
  say(t.typedTasks, () => {
    const n = t.typedTasks;
    return `${count(n, 'task')} of type Task ${one(n) ? 'sits' : 'sit'} in a room group; ${one(n) ? 'it' : 'each'} came in as a regular item.`;
  });
  say(outsideTotal, () => {
    const placed = placedOutside;
    const left = t.outsideLeftOut.length;
    const head = `${count(outsideTotal, 'item')} ${one(outsideTotal) ? 'is' : 'are'} not in a room in Buildertrend`;
    // What placed them: the Location field, a tag that names a location, or one or the other.
    const its = t.outsideByTag === 0 ? 'its Location field' : t.outsidePlaced === 0 ? 'its tag that names a location' : 'its Location field or its tag that names a location';
    const their = t.outsideByTag === 0 ? 'their Location field' : t.outsidePlaced === 0 ? 'their tags that name a location' : 'their Location field or a tag that names a location';
    if (left === 0) return `${head}; ${one(placed) ? 'it was' : 'each was'} placed using ${its}.`;
    if (placed === 0) return `${head} and ${one(left) ? 'was' : 'were'} left out: ${nameList(t.outsideLeftOut)}.`;
    return `${head}: ${placed} ${one(placed) ? `was placed using ${its}` : `were placed using ${their}`}, and ${left} ${one(left) ? 'was' : 'were'} left out (${nameList(t.outsideLeftOut)}).`;
  });
  say(t.locationMismatch, () => {
    const n = t.locationMismatch;
    return `${count(n, 'item')} ${one(n) ? 'has' : 'have'} a Location field that names a different room than ${one(n) ? 'its' : 'their'} room group; the room group was used.`;
  });

  // Company and trade
  say(c.none, () => `${count(c.none, 'item')} ${one(c.none) ? 'has' : 'have'} no company assigned; each item needs one.`);
  say(c.unnamed, () => `${count(c.unnamed, 'item')} ${one(c.unnamed) ? 'is' : 'are'} assigned to a company whose name Buildertrend did not return, so ${one(c.unnamed) ? 'it has' : 'they have'} no company.`);
  say(c.rossBuilt, () => `${count(c.rossBuilt, 'item')} ${one(c.rossBuilt) ? 'is' : 'are'} assigned to a Ross Built user rather than a company, so the company was set to Ross Built.`);
  say(c.many, () => `${count(c.many, 'item')} ${one(c.many) ? 'is' : 'are'} assigned to more than one company; the first company was used.`);
  say(tr.none, () => `${count(tr.none, 'item')} ${one(tr.none) ? 'has' : 'have'} no trade tag; each item needs one.`);
  say(tr.unnamed, () => `${count(tr.unnamed, 'item')} ${one(tr.unnamed) ? 'has' : 'have'} a trade tag whose name Buildertrend did not return, so ${one(tr.unnamed) ? 'it has' : 'they have'} no trade.`);
  say(tr.many, () => `${count(tr.many, 'item')} ${one(tr.many) ? 'has' : 'have'} more than one trade tag; the first tag was used.`);
  say(t.otherTrade, () => {
    const n = t.otherTrade;
    return `${count(n, 'item')} ${one(n) ? 'carries' : 'carry'} a trade tag that is not ${one(n) ? 'its' : 'their'} company's own trade (${nameList(t.otherTradeCompanies)}); in the app the trade follows the company, so ${one(n) ? 'it' : 'each'} came in under its company's trade.`;
  });

  // Ready and Waiting On
  say(t.notReadyNoWaitingOn, () =>
    one(t.notReadyNoWaitingOn)
      ? `1 open item is not ready but says nothing in Waiting On; it came in waiting on ${NOT_SAID}. Say what it is waiting on, or mark it ready.`
      : `${t.notReadyNoWaitingOn} open items are not ready but say nothing in Waiting On; each came in waiting on ${NOT_SAID}. Say what each one is waiting on, or mark it ready.`,
  );
  say(t.completeMadeReady, () => `${count(t.completeMadeReady, 'complete item')} had Ready unchecked and nothing in Waiting On; ${one(t.completeMadeReady) ? 'it was' : 'they were'} imported as ready, since the work is done.`);
  say(t.completeStillWaiting, () => {
    const n = t.completeStillWaiting;
    return `${count(n, 'complete item')} still said what ${one(n) ? 'it was' : 'they were'} waiting on; ${one(n) ? 'it was' : 'they were'} imported as ready, since the work is done.`;
  });
  say(t.readyWithWaitingOn, () => {
    const n = t.readyWithWaitingOn;
    return `${count(n, 'open item')} ${one(n) ? 'is' : 'are'} marked Ready but also ${one(n) ? 'has' : 'have'} Waiting On or Ready By filled in; those were left empty, as the app does for ready items.`;
  });
  say(t.readyByNotDate, () =>
    one(t.readyByNotDate)
      ? '1 item has a Ready By that is not a date; it was left empty.'
      : `${t.readyByNotDate} items have a Ready By that is not a date; those were left empty.`,
  );

  // The order number
  say(t.orderWordItems, () => {
    const n = t.orderWordItems;
    return `${count(n, 'item')} ${one(n) ? 'has' : 'have'} words where the order number goes (${nameList(t.orderWords)}); ${one(n) ? 'it was' : 'those were'} left empty.`;
  });

  // Kind
  say(t.addedScope, () => `${count(t.addedScope, 'item')} ${one(t.addedScope) ? 'was' : 'were'} set to ${KIND_LABELS.added_scope} because the PO / CO field holds a change order number or the item says added scope; check that ${one(t.addedScope) ? 'it is' : 'these are'} right.`);
  say(t.addedScopeBoughtOutNoPo, () => {
    const n = t.addedScopeBoughtOutNoPo;
    return `${count(n, 'item')} marked ${KIND_LABELS.added_scope} ${one(n) ? 'is' : 'are'} Bought Out in Buildertrend with no order number; the app shows ${one(n) ? 'it' : 'them'} under Needs a Price until ${one(n) ? 'it has' : 'they have'} one.`;
  });
  say(t.completion, () => `${count(t.completion, 'item')} came in as ${KIND_LABELS.completion}, since Buildertrend does not say which are deficiencies; change any that are.`);

  // Completion
  say(t.completeNoDate, () => {
    const n = t.completeNoDate;
    return `${count(n, 'complete item')} ${one(n) ? 'has' : 'have'} no completion date from Buildertrend; the app will date ${one(n) ? 'it the day it is' : 'them the day they are'} loaded.`;
  });
  say(t.markedDone, () => {
    const n = t.markedDone;
    return `${count(n, 'item')} ${one(n) ? 'was' : 'were'} marked complete in Buildertrend by the company itself; ${one(n) ? 'it' : 'each'} came in open, marked done that day, for ${ROSS_BUILT} to check and complete.`;
  });

  // Titles
  say(t.longTitles, () => {
    const n = t.longTitles;
    return `${count(n, 'title')} ${one(n) ? 'is' : 'are'} longer than the app's ${TITLE_MAX} characters; ${one(n) ? 'it was' : 'each was'} cut at a whole word, with the full wording at the top of the description.`;
  });

  // Action Items
  say(t.actionItems, () => {
    const n = t.actionItems;
    const due = t.actionItemsDue;
    const dates = due === 0 ? '' : ` ${due === n ? (one(n) ? 'It has' : 'Each has') : `${due} have`} a due date in Buildertrend, which the app has no place for yet.`;
    return `${count(n, 'open Action Item')} came in, assigned to the people ${one(n) ? 'it is' : 'they are'} assigned to in Buildertrend.${dates}`;
  });
  say(t.actionItemsNobody, () => {
    const n = t.actionItemsNobody;
    return `${count(n, 'Action Item')} ${one(n) ? 'is' : 'are'} assigned to nobody in Buildertrend; ${one(n) ? 'it needs' : 'each needs'} someone.`;
  });

  // The companies' people
  say(t.noContact.length, () => {
    const n = t.noContact.length;
    return `${count(n, 'company', 'companies')} ${one(n) ? 'has' : 'have'} nobody with an email or a phone in Buildertrend (${nameList(t.noContact)}), so ${one(n) ? 'its' : 'their'} lists have nowhere to go yet.`;
  });
  say(t.badEmails, () => {
    const n = t.badEmails;
    return `${count(n, 'email address', 'email addresses')} in Buildertrend ${one(n) ? 'does' : 'do'} not read as an email; ${one(n) ? 'it was' : 'those were'} left out.`;
  });
  return out;
}
