// One-time, read-only import of a job's Completion List into the app's own data shape.
// It follows the locked Completion List standard (8 October 2026): a room group is a room, an item is
// one piece of work for one company with one trade tag, and anything tagged DELETE is skipped.
// readForImport does the reading, through a guard that refuses anything but a read.
// importCompletionList is pure: it maps what was read and never calls Buildertrend.
// Whatever does not fit the standard is kept where it can be and reported in plain sentences.

import {
  DEFAULT_WAITING_ON_EXTRAS,
  isPriced,
  KIND_LABELS,
  parseRoomList,
  SHARED_AREAS,
  tidyTitle,
  tidyWaitingOn,
  type ItemKind,
  type LocationKind,
} from '@punch/core';
import { DELETE_TAG_NAME, TASK_FIELDS, TASK_TYPE, type TaskFieldKey } from './config.js';
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
}

export interface ImportedList {
  job: { name: string; address: string | null };
  locations: ImportedLocation[];
  trades: string[];
  companies: ImportedCompany[];
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

export interface ImportOptions {
  /** The job's name and address in the app. Without it they come from Buildertrend's job record. */
  job?: { name: string; address: string | null };
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

interface Placement {
  item: CompletionItem;
  label: string;
  company: string | null;
  trade: string | null;
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
  deleteItems: number;
  nested: number;
  outsidePlaced: number;
  outsideLeftOut: string[];
  locationMismatch: number;
  company: Record<CompanyIssue, number>;
  trade: Record<TradeIssue, number>;
  notReadyNoWaitingOn: number;
  completeMadeReady: number;
  readyWithWaitingOn: number;
  readyByNotDate: number;
  addedScope: number;
  addedScopeBoughtOutNoPo: number;
  completion: number;
  completeNoDate: number;
}

export function importCompletionList(source: ImportSource, options: ImportOptions = {}): ImportedList {
  const { jobId, list, definitions, tagNames } = source;
  const tally = newTally();
  const normalized = normalizeCompletionList(jobId, list, definitions, tagNames);
  const punch = new Map(
    list.tasks.filter((t) => t.isDeleted !== true && t.taskType === TASK_TYPE.punchList).map((t) => [t.taskId, t] as const),
  );

  tally.missingFields = (Object.keys(TASK_FIELDS) as TaskFieldKey[])
    .filter((key) => !definitions.some((d) => d.id === TASK_FIELDS[key]))
    .map((key) => FIELD_LABELS[key]);

  let job = options.job;
  if (!job) {
    const found = jobRecord(list, jobId);
    const name = found.name ?? `Buildertrend job ${jobId}`;
    if (!found.name) tally.jobFallbackName = name;
    job = { name, address: found.address };
  }

  // Rooms: every room group through the app's room rules, in Buildertrend's order, then the shared areas.
  const deleteGroups = normalized.rooms.filter((r) => taggedDelete(punch.get(r.taskId), tagNames));
  const groups = normalized.rooms.filter((r) => !deleteGroups.includes(r));
  const titles = groups.map((g) => g.label.replace(/\s+/g, ' ').trim());
  const parsed = parseRoomList(titles.join('\n'));
  const labelOfGroup = new Map(groups.map((g, i) => [g.taskId, roomLabelOf(titles[i] ?? '')] as const));
  // A shared area is spelled the way it is on every job, wherever Buildertrend has it.
  const sharedSpelling = new Map(SHARED_AREAS.map((s) => [s.toLowerCase(), s] as const));
  const locations = parsed.locations.map((l): ImportedLocation => {
    const shared = sharedSpelling.get(l.label.toLowerCase());
    if (shared) return { label: shared, name: shared, number: null, floor: null, kind: 'shared', sortOrder: l.sortOrder };
    return { label: l.label, name: l.name, number: l.number, floor: l.floor, kind: l.kind, sortOrder: l.sortOrder };
  });
  const locationByKey = new Map(locations.map((l) => [l.label.toLowerCase(), l] as const));

  tally.deleteGroups = deleteGroups.map((g) => g.label);
  tally.duplicateRooms = repeated([...labelOfGroup.values()].filter((l): l is string => l !== null));
  groups.forEach((g, i) => {
    const title = titles[i] ?? '';
    if (labelOfGroup.get(g.taskId)) return;
    if (title.endsWith(':')) tally.floorGroups.push(title);
    else tally.unnamedGroups.push(title || 'a group with no title');
  });

  // Items: in their room group where it is a room, otherwise placed by their Location field or left out.
  const placed: { item: CompletionItem; label: string }[] = [];
  const outside: CompletionItem[] = [];
  const place = (item: CompletionItem, label: string | null | undefined): void => {
    if (item.markedDelete) tally.deleteItems += 1;
    else if (label) placed.push({ item, label });
    else outside.push(item);
  };
  for (const group of groups) {
    const label = labelOfGroup.get(group.taskId);
    for (const item of group.items) {
      if (label && !item.markedDelete && locationFieldDiffers(item, label)) tally.locationMismatch += 1;
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
    const location = named ? locationByKey.get(named.toLowerCase()) : undefined;
    if (location) {
      placed.push({ item, label: location.label });
      tally.outsidePlaced += 1;
    } else {
      tally.outsideLeftOut.push(tidyTitle(item.title));
    }
  }

  // Companies and trades, each spelled one way across the job.
  const companySpelling = new Map<string, string>();
  const tradeSpelling = new Map<string, string>();
  const placements: Placement[] = placed.map(({ item, label }) => {
    const company = companyOf(item.assignees);
    const trade = tradeOf(item.trades);
    if (company.issue) tally.company[company.issue] += 1;
    if (trade.issue) tally.trade[trade.issue] += 1;
    // The location's own label, so every item names its room exactly as the room list does.
    const location = locationByKey.get(label.toLowerCase());
    return {
      item,
      label: location?.label ?? label,
      company: spelled(companySpelling, company.name),
      trade: spelled(tradeSpelling, trade.name),
    };
  });

  const known = [...DEFAULT_WAITING_ON_EXTRAS, ...companySpelling.values()];
  const sortOrderOf = (label: string) => locationByKey.get(label.toLowerCase())?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const items = placements
    .map((p) => toItem(p, known, punch.get(p.item.taskId), tally))
    .sort((a, b) => sortOrderOf(a.locationLabel) - sortOrderOf(b.locationLabel));

  // Each company once, with the trade on most of its items.
  const tradesByCompany = new Map<string, Map<string, number>>();
  for (const item of items) {
    if (item.companyName === null) continue;
    const counts = tradesByCompany.get(item.companyName) ?? new Map<string, number>();
    if (item.tradeName !== null) counts.set(item.tradeName, (counts.get(item.tradeName) ?? 0) + 1);
    tradesByCompany.set(item.companyName, counts);
  }
  const companies = [...tradesByCompany]
    .map(([name, counts]): ImportedCompany => ({ name, tradeName: mostUsed(counts) }))
    .sort((a, b) => compareText(a.name, b.name));
  const trades = [...new Set(items.map((i) => i.tradeName).filter((t): t is string => t !== null))].sort(compareText);

  return { job, locations, trades, companies, items, problems: problemSentences(tally) };
}

function toItem(p: Placement, known: string[], task: BtTask | undefined, tally: Tally): ImportedItem {
  const { item } = p;
  const complete = item.complete;
  const title = tidyTitle(item.title);
  const poOrCo = text(item.fields.poOrCo);
  const boughtOut = checked(item.fields.boughtOut);
  const readyByText = dateText(item.fields.readyBy);
  let ready = checked(item.fields.ready);
  let waitingOn = splitWaitingOn(text(item.fields.waitingOn), known);
  let readyBy = isoDate(readyByText);

  if (ready) {
    // As in the app: Waiting On and Ready By only mean something while an item is not ready.
    if (!complete && (waitingOn.length > 0 || readyByText !== null)) tally.readyWithWaitingOn += 1;
    waitingOn = [];
    readyBy = null;
  } else if (complete && waitingOn.length === 0) {
    // Done work was ready, and the app does not take an item that is not ready and waits on nothing.
    ready = true;
    readyBy = null;
    tally.completeMadeReady += 1;
  } else {
    if (waitingOn.length === 0) tally.notReadyNoWaitingOn += 1;
    if (readyByText !== null && readyBy === null) tally.readyByNotDate += 1;
  }

  // Buildertrend does not say which work is a deficiency, so work in scope comes in as Incomplete.
  const kind: ItemKind = isAddedScope(poOrCo, title, item.description) ? 'added_scope' : 'completion';
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
    description: item.description,
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
  };
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
export function splitWaitingOn(text: string | null | undefined, known: readonly string[] = DEFAULT_WAITING_ON_EXTRAS): string[] {
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

/** When the item was completed, if the task carries a date for it. The key is not confirmed yet. */
function completedAtOf(task: BtTask | undefined): string | null {
  for (const key of COMPLETED_AT_KEYS) {
    const value = task?.[key];
    if (typeof value === 'string' && isoDate(value) !== null) return value.trim();
  }
  return null;
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
    deleteItems: 0,
    nested: 0,
    outsidePlaced: 0,
    outsideLeftOut: [],
    locationMismatch: 0,
    company: { none: 0, unnamed: 0, rossBuilt: 0, many: 0 },
    trade: { none: 0, unnamed: 0, many: 0 },
    notReadyNoWaitingOn: 0,
    completeMadeReady: 0,
    readyWithWaitingOn: 0,
    readyByNotDate: 0,
    addedScope: 0,
    addedScopeBoughtOutNoPo: 0,
    completion: 0,
    completeNoDate: 0,
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
  const outsideTotal = t.outsidePlaced + t.outsideLeftOut.length;
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

  // Where the items went
  say(t.deleteItems, () => `${count(t.deleteItems, 'item')} tagged DELETE ${one(t.deleteItems) ? 'was' : 'were'} skipped.`);
  say(t.nested, () =>
    one(t.nested)
      ? '1 item was nested more than one level deep; it was imported into its room as a regular item.'
      : `${t.nested} items were nested more than one level deep; each was imported into its room as a regular item.`,
  );
  say(outsideTotal, () => {
    const placed = t.outsidePlaced;
    const left = t.outsideLeftOut.length;
    const head = `${count(outsideTotal, 'item')} ${one(outsideTotal) ? 'is' : 'are'} not in a room in Buildertrend`;
    if (left === 0) return `${head}; ${one(placed) ? 'it was' : 'each was'} placed using its Location field.`;
    if (placed === 0) return `${head} and ${one(left) ? 'was' : 'were'} left out: ${nameList(t.outsideLeftOut)}.`;
    return `${head}: ${placed} ${one(placed) ? 'was placed using its' : 'were placed using their'} Location field, and ${left} ${one(left) ? 'was' : 'were'} left out (${nameList(t.outsideLeftOut)}).`;
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

  // Ready and Waiting On
  say(t.notReadyNoWaitingOn, () =>
    one(t.notReadyNoWaitingOn)
      ? '1 open item is not ready but says nothing in Waiting On; say what it is waiting on, or mark it ready.'
      : `${t.notReadyNoWaitingOn} open items are not ready but say nothing in Waiting On; say what each one is waiting on, or mark it ready.`,
  );
  say(t.completeMadeReady, () => `${count(t.completeMadeReady, 'complete item')} had Ready unchecked and nothing in Waiting On; ${one(t.completeMadeReady) ? 'it was' : 'they were'} imported as ready, since the work is done.`);
  say(t.readyWithWaitingOn, () => {
    const n = t.readyWithWaitingOn;
    return `${count(n, 'open item')} ${one(n) ? 'is' : 'are'} marked Ready but also ${one(n) ? 'has' : 'have'} Waiting On or Ready By filled in; those were left empty, as the app does for ready items.`;
  });
  say(t.readyByNotDate, () =>
    one(t.readyByNotDate)
      ? '1 item has a Ready By that is not a date; it was left empty.'
      : `${t.readyByNotDate} items have a Ready By that is not a date; those were left empty.`,
  );

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
  return out;
}
