// Activity: who did what on a job, in plain sentences. The database keeps it: a row for each item
// field that changed (item_history) and a row for everything else, photos, visits, lists sent and
// job setup (job_activity). Here it becomes the job's Activity screen and each item's History.
// Several changes one person makes to one item within a few minutes read as one line, so saving
// field by field does not flood the log.

import { KIND_LABELS } from './forms';
import { hoursText } from './time';
import type { Comment, Company, CustomField, Item, ItemKind, Location, Person, Trade, Visit } from './types';
import { waitingOnText } from './waitingOn';

export type ActivityKind =
  | 'item_created'
  | 'item_changed'
  | 'photo_added'
  | 'photo_marked'
  | 'photo_removed'
  | 'visit_added'
  | 'visit_changed'
  | 'visit_removed'
  | 'list_sent'
  | 'list_undone'
  | 'location_added'
  | 'location_renamed'
  | 'location_removed'
  | 'location_restored'
  | 'company_added'
  | 'company_renamed'
  | 'company_trade_changed'
  | 'company_removed'
  | 'job_renamed'
  | 'job_address_changed'
  | 'comment_added';

export type ActivityDetail = Record<string, string | number | boolean | null>;

export interface Activity {
  id: string;
  jobId: string;
  itemId: string | null;
  /** Who did it; null when the database could not tell (an import, say). */
  personId: string | null;
  /** When, as an ISO time. */
  at: string;
  kind: ActivityKind;
  /** An item added or changed: the database column, and its value before and after, as text. */
  field?: string;
  before?: string | null;
  after?: string | null;
  /** Everything else: what it was about, as the database wrote it. */
  detail?: ActivityDetail;
  /** Brought in from Buildertrend rather than done in the app. */
  imported?: boolean;
}

// ---------- item changes, the way the database logs them ----------

/** Not logged: who and when are the entry itself. */
const NOT_LOGGED = new Set(['id', 'jobId', 'createdAt', 'createdBy', 'updatedAt']);

/** An item's field as its database column: companyId is company_id. */
export const columnOf = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** A value as text, the way the database writes it in the log. */
export function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** The fields that changed between two versions of an item, named and written the way the database logs them. */
export function itemChanges(before: Item, after: Item): { field: string; before: string | null; after: string | null }[] {
  const out: { field: string; before: string | null; after: string | null }[] = [];
  for (const key of Object.keys(after) as (keyof Item)[]) {
    if (NOT_LOGGED.has(key)) continue;
    const was = asText(before[key]);
    const now = asText(after[key]);
    if (was !== now) out.push({ field: columnOf(key), before: was, after: now });
  }
  return out;
}

// ---------- in words ----------

export interface ActivityLookups {
  people: Map<string, string>;
  items: Map<string, Item>;
  locations: Map<string, string>;
  companies: Map<string, string>;
  trades: Map<string, string>;
  visits: Map<string, Pick<Visit, 'start' | 'days'>>;
  fields: Map<string, string>;
  /** Comments their writers took back: gone from Activity too. */
  takenBack: Set<string>;
  today: Date;
}

export function activityLookups(input: {
  people: Person[];
  items: Item[];
  locations: Location[];
  companies: Company[];
  trades: Trade[];
  visits: Visit[];
  customFields: CustomField[];
  comments?: Comment[];
  today?: Date;
}): ActivityLookups {
  return {
    people: new Map(input.people.map((p) => [p.id, p.name])),
    items: new Map(input.items.map((i) => [i.id, i])),
    locations: new Map(input.locations.map((l) => [l.id, l.label])),
    companies: new Map(input.companies.map((c) => [c.id, c.name])),
    trades: new Map(input.trades.map((t) => [t.id, t.name])),
    visits: new Map(input.visits.map((v) => [v.id, { start: v.start, days: v.days }])),
    fields: new Map(input.customFields.map((f) => [f.id, f.label])),
    takenBack: new Set((input.comments ?? []).filter((c) => c.removed).map((c) => c.id)),
    today: input.today ?? new Date(),
  };
}

/** One line of activity: who, what they did, and more about it. */
export interface ActivityLine {
  key: string;
  /** When, as an ISO time: the last of the changes it covers. */
  at: string;
  personId: string | null;
  /** "Jake Ross"; Buildertrend for an import; Ross Built when nobody is known. */
  who: string;
  itemId: string | null;
  /** What they did, read after their name: "added Touch up paint". */
  action: string;
  /** More about it, as short sentences, or empty: "Laundry 119. With a photo." */
  detail: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "November 5", or "Tuesday, November 5", with the year when it is not this one. */
function dayWords(ymd: string, today: Date, weekday = false): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const name = weekday ? `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ` : '';
  return `${name}${MONTHS[m - 1]} ${d}${y === today.getFullYear() ? '' : `, ${y}`}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const titleCase = (text: string) => text.replace(/\b\w/g, (c) => c.toUpperCase());
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

function parseList(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  } catch {
    return [];
  }
}

function parseObject(text: string | null | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Which list it was: "the SMS Carpentry list", "the Owner list", "the whole job list". */
function listName(list: unknown, look: ActivityLookups): string {
  const key = String(list ?? '');
  if (key === 'job') return 'the whole job list';
  if (key.startsWith('company:')) return `the ${look.companies.get(key.slice(8)) ?? 'company'} list`;
  if (key.startsWith('party:')) return `the ${titleCase(key.slice(6))} list`;
  return 'a list';
}

/** "Tuesday, November 3 to Wednesday, November 4, 2 days, confirmed". */
function visitWords(d: ActivityDetail, look: ActivityLookups): string {
  const start = typeof d.start === 'string' ? d.start : '';
  const days = typeof d.days === 'number' ? d.days : Number(d.days ?? 1);
  if (!start) return '';
  const parts = [dayWords(start, look.today, true), plural(days, 'day'), d.confirmed ? 'confirmed' : 'our best guess'];
  return parts.join(', ');
}

/**
 * What one field changed to, in words, for the detail line; nothing when it says nothing new. In
 * the job's Activity the line already names the item by its title, so a new title says what it
 * was before, and a draft's first title says nothing more.
 */
function fieldWords(field: string, before: string | null, after: string | null, look: ActivityLookups, forItem: boolean): string[] {
  switch (field) {
    case 'title':
      if (!forItem) return before?.trim() ? [`Renamed from ${before.trim()}`] : [];
      return after ? [`Title: ${after}`] : [];
    case 'description':
      return [after ? `Description: ${clip(after)}` : 'Description cleared'];
    case 'location_id':
      return [`Location: ${look.locations.get(after ?? '') ?? 'another location'}`];
    case 'company_id':
      return [after ? `Company: ${look.companies.get(after) ?? 'another company'}` : 'Company cleared'];
    case 'trade_id':
      return [after ? `Trade: ${look.trades.get(after) ?? 'another trade'}` : 'Trade cleared'];
    case 'kind':
      return [`Type: ${KIND_LABELS[(after ?? '') as ItemKind] ?? after}`];
    case 'ready':
      return [after === 'true' ? 'Ready' : 'Not ready'];
    case 'waiting_on': {
      const list = parseList(after);
      return list.length > 0 ? [`Waiting on ${waitingOnText(list)}`] : [];
    }
    case 'ready_by':
      return after ? [`Ready by ${dayWords(after, look.today)}`] : [];
    case 'po_or_co':
      return [after ? `Order number: ${after}` : 'Order number cleared'];
    case 'hours': {
      const hours = after === null ? NaN : Number(after);
      return [Number.isFinite(hours) && hours > 0 ? `Estimated time: ${hoursText(hours)}` : 'Estimated time cleared'];
    }
    case 'visit_id': {
      const visit = after ? look.visits.get(after) : undefined;
      return [after ? (visit ? `On the visit ${dayWords(visit.start, look.today, true)}` : 'On a visit') : 'Off its visit'];
    }
    case 'extra': {
      const was = parseObject(before);
      const now = parseObject(after);
      const out: string[] = [];
      for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
        if (JSON.stringify(was[key] ?? null) === JSON.stringify(now[key] ?? null)) continue;
        const label = look.fields.get(key) ?? 'A field';
        const value = now[key];
        out.push(value === null || value === undefined || value === '' ? `${label} cleared` : `${label}: ${value === true ? 'Yes' : value === false ? 'No' : String(value)}`);
      }
      return out;
    }
    default:
      return [];
  }
}

/** Fields that are not worth a line: they follow from others, or the database sets them. */
const QUIET = new Set(['bought_out', 'number', 'source', 'bt_external_id', 'org', 'completed_by', 'completed_at', 'job_id']);

type Kind = 'create' | 'status' | 'change' | 'photo' | 'locations' | 'other';

function classOf(e: Activity): Kind {
  if (e.kind === 'item_created') return 'create';
  if (e.kind === 'item_changed') return e.field === 'status' || e.field === 'completed_by' || e.field === 'completed_at' ? 'status' : 'change';
  if (e.kind === 'photo_added' || e.kind === 'photo_marked' || e.kind === 'photo_removed') return 'photo';
  if (e.kind === 'location_added') return 'locations';
  // A comment is its own line, never folded into changes to its item.
  return 'other';
}

interface Group {
  kind: Kind;
  personId: string | null;
  itemId: string | null;
  first: number;
  last: number;
  entries: Activity[];
}

/** Changes close together by the same person on the same item read as one. */
const TOGETHER_MS = 10 * 60 * 1000;

function joins(g: Group, e: Activity, kind: Kind, t: number): boolean {
  if (g.personId !== e.personId || t - g.last > TOGETHER_MS) return false;
  if (kind === 'locations') return g.kind === 'locations';
  if (kind === 'other' || !e.itemId || g.itemId !== e.itemId) return false;
  if (g.kind === 'status') return kind === 'status' && t - g.first < 2000;
  if (kind === 'status' || kind === 'create') return false;
  return g.kind === 'create' || g.kind === 'change' || g.kind === 'photo';
}

/**
 * The activity as lines, newest first. forItem: one item's History, where the item is "it" rather
 * than its title.
 */
export function activityLines(entries: Activity[], look: ActivityLookups, options: { forItem?: boolean } = {}): ActivityLine[] {
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  // Items put on a visit, or taken off it, as it was scheduled, changed or removed belong to the
  // visit's line rather than a line each. An item's own History keeps them.
  const onVisit = new Map<string, number>();
  const folded = new Set<string>();
  if (!options.forItem) {
    for (const v of sorted) {
      if (v.kind !== 'visit_added' && v.kind !== 'visit_changed' && v.kind !== 'visit_removed') continue;
      const id = String(v.detail?.visit_id ?? '');
      const t = Date.parse(v.at);
      let put = 0;
      for (const e of sorted) {
        if (e.kind !== 'item_changed' || e.field !== 'visit_id' || folded.has(e.id) || e.personId !== v.personId) continue;
        if (Math.abs(Date.parse(e.at) - t) > 2 * 60 * 1000 || (e.after !== id && e.before !== id)) continue;
        if (e.after === id) put += 1;
        folded.add(e.id);
      }
      onVisit.set(v.id, put);
    }
  }
  const groups: Group[] = [];
  for (const e of sorted) {
    if (folded.has(e.id)) continue;
    const kind = classOf(e);
    const t = Date.parse(e.at);
    const last = groups[groups.length - 1];
    // A later change to the same item still joins its group when other people's lines came between.
    const open = kind === 'locations' ? last : [...groups].reverse().find((g) => g.itemId === e.itemId && g.itemId !== null);
    const g = open && joins(open, e, kind, t) ? open : undefined;
    if (g) {
      g.entries.push(e);
      g.last = t;
    } else {
      groups.push({ kind, personId: e.personId, itemId: e.itemId, first: t, last: t, entries: [e] });
    }
  }
  const lines: ActivityLine[] = [];
  for (const g of groups) {
    const line = lineFor(g, look, options.forItem ?? false, onVisit);
    if (line) lines.push(line);
  }
  return lines.sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}

function whoOf(g: Group, look: ActivityLookups): string {
  if (g.personId) return look.people.get(g.personId) ?? 'Someone';
  return g.entries.some((e) => e.imported) ? 'Buildertrend' : 'Ross Built';
}

function lineFor(g: Group, look: ActivityLookups, forItem: boolean, onVisit: Map<string, number>): ActivityLine | null {
  const first = g.entries[0]!;
  const lastEntry = g.entries[g.entries.length - 1]!;
  const base = { key: first.id, at: lastEntry.at, personId: g.personId, who: whoOf(g, look), itemId: g.itemId };
  const done = (action: string, details: string[] = []): ActivityLine => ({
    ...base,
    action,
    detail: details.filter(Boolean).map(sentence).join(' '),
  });

  if (first.kind === 'comment_added') {
    // An item's own Comments show its comments; its History does not repeat them.
    const d = first.detail ?? {};
    if (forItem || look.takenBack.has(String(d.comment_id ?? ''))) return null;
    const companyName = look.companies.get(String(d.company_id ?? '')) ?? 'the company';
    const named = typeof d.author_name === 'string' && d.author_name.trim() !== '' ? d.author_name.trim() : '';
    const who = d.from_company === true ? (named ? `${named} at ${companyName}` : companyName) : base.who;
    const item = g.itemId ? look.items.get(g.itemId) : undefined;
    const on = g.itemId ? item?.title.trim() || 'an item' : `the ${companyName} list`;
    const where = item ? (look.locations.get(item.locationId) ?? '') : '';
    return {
      ...base,
      who,
      action: d.internal === true ? `added a Ross Built only note on ${on}` : `commented on ${on}`,
      detail: [where, clip(String(d.body ?? ''), 140)].filter(Boolean).map(sentence).join(' '),
    };
  }

  if (g.itemId) {
    const item = look.items.get(g.itemId);
    const created = g.entries.find((e) => e.kind === 'item_created');
    const title = forItem ? 'it' : item?.title.trim() || created?.after?.trim() || 'a draft';
    const where = forItem ? '' : (look.locations.get(item?.locationId ?? '') ?? '');
    const photos = g.entries.filter((e) => e.kind === 'photo_added').length;
    const marked = g.entries.some((e) => e.kind === 'photo_marked');
    const removedPhotos = g.entries.filter((e) => e.kind === 'photo_removed').length;
    const photoWords = [
      photos > 0 ? `With ${photos === 1 ? 'a photo' : plural(photos, 'photo')}${marked ? ', marked up' : ''}` : marked ? 'Photo marked up' : '',
      removedPhotos > 0 ? `${removedPhotos === 1 ? 'A photo' : plural(removedPhotos, 'photo')} removed` : '',
    ];

    if (g.kind === 'create') return done(`added ${title}`, [where, ...photoWords]);

    if (g.kind === 'status') {
      const s = g.entries.find((e) => e.field === 'status');
      if (!s) return null;
      if (s.after === 'complete') return done(`completed ${title}`, [where]);
      if (s.after === 'removed') return done(`removed ${title} from the list`, [where]);
      if (s.before === 'complete') return done(`reopened ${title}`, [where]);
      return done(`restored ${title} to the list`, [where]);
    }

    // Changes, with any photos: each field from where it started to where it ended.
    const net = new Map<string, { before: string | null; after: string | null }>();
    for (const e of g.entries) {
      if (e.kind !== 'item_changed' || !e.field || QUIET.has(e.field)) continue;
      const was = net.get(e.field);
      net.set(e.field, { before: was ? was.before : (e.before ?? null), after: e.after ?? null });
    }
    for (const [field, { before, after }] of net) if (before === after) net.delete(field);
    const fields = [...net.keys()];
    const wordsOf = (list: string[]) => list.flatMap((f) => fieldWords(f, net.get(f)!.before, net.get(f)!.after, look, forItem));
    const words = wordsOf(fields);

    if (fields.length === 0) {
      if (photos > 0) return done(`added ${photos === 1 ? 'a photo' : plural(photos, 'photo')} to ${title}`, [where, marked ? 'Marked up' : '']);
      if (marked) return done(`marked up the photo on ${title}`, [where]);
      if (removedPhotos > 0) return done(`removed ${removedPhotos === 1 ? 'a photo' : plural(removedPhotos, 'photo')} from ${title}`, [where]);
      return null;
    }
    const finished = net.get('unfinished');
    if (finished && finished.after === 'false') {
      return done(`put ${title} on the lists`, [where, ...wordsOf(fields.filter((f) => f !== 'unfinished')), ...photoWords]);
    }
    const only = (...names: string[]) => fields.every((f) => names.includes(f));
    if (only('ready', 'waiting_on', 'ready_by') && net.has('ready')) {
      const ready = net.get('ready')!.after === 'true';
      const rest = ready ? [] : wordsOf(fields.filter((f) => f !== 'ready'));
      return done(`marked ${title} ${ready ? 'ready' : 'not ready'}`, [where, ...rest, ...photoWords]);
    }
    if (only('location_id')) {
      return done(`moved ${title} to ${look.locations.get(net.get('location_id')!.after ?? '') ?? 'another location'}`, photoWords);
    }
    if (only('visit_id')) {
      const to = net.get('visit_id')!.after;
      const visit = to ? look.visits.get(to) : undefined;
      if (!to) return done(`took ${title} off its visit`, [where, ...photoWords]);
      return done(`scheduled ${title}`, [where, visit ? `On the visit ${dayWords(visit.start, look.today, true)}` : '', ...photoWords]);
    }
    return done(`changed ${title}`, [...(forItem ? [] : [where]), ...words, ...photoWords]);
  }

  // Everything that is not one item.
  const d = first.detail ?? {};
  const put = onVisit.get(first.id) ?? 0;
  const items = put > 0 ? plural(put, 'item') : '';
  const company = (id: unknown) => look.companies.get(String(id ?? '')) ?? 'a company';
  const trade = (id: unknown) => look.trades.get(String(id ?? '')) ?? 'another trade';
  switch (first.kind) {
    case 'location_added': {
      const labels = g.entries.map((e) => String(e.detail?.label ?? '')).filter(Boolean);
      if (labels.length === 1) return done(`added the location ${labels[0]}`);
      return done(`added ${plural(labels.length, 'location')}`, [clip(labels.join(', '), 120)]);
    }
    case 'location_renamed':
      return done(`renamed ${String(d.from ?? 'a location')} to ${String(d.to ?? '')}`);
    case 'location_removed':
      return done(`removed ${String(d.label ?? 'a location')} from the job`);
    case 'location_restored':
      return done(`brought back ${String(d.label ?? 'a location')}`);
    case 'company_added':
      return done(`added ${company(d.company_id)} to the job`, [trade(d.trade_id)]);
    case 'company_renamed':
      return done(`renamed ${String(d.from ?? 'a company')} to ${String(d.to ?? '')}`);
    case 'company_trade_changed':
      return done(`changed the trade for ${company(d.company_id)}`, [`Now ${trade(d.to)}`]);
    case 'company_removed':
      return done(`removed ${company(d.company_id)} from the job`, [trade(d.trade_id)]);
    case 'job_renamed':
      return done(`renamed the job to ${String(d.to ?? '')}`);
    case 'job_address_changed':
      return done(d.to ? `changed the job's address to ${String(d.to)}` : `cleared the job's address`);
    case 'visit_added':
      return done(`scheduled ${company(d.company_id)}`, [visitWords(d, look), items]);
    case 'visit_changed': {
      const confirmedNow = d.confirmed === true && d.was_confirmed === false;
      const moved = d.start !== d.was_start || d.days !== d.was_days;
      if (confirmedNow && !moved) return done(`confirmed the visit for ${company(d.company_id)}`, [visitWords(d, look), items]);
      return done(`changed the visit for ${company(d.company_id)}`, [`Now ${visitWords(d, look)}`, items]);
    }
    case 'visit_removed':
      return done(`removed the visit for ${company(d.company_id)}`, [visitWords(d, look)]);
    case 'list_sent': {
      const n = typeof d.items === 'number' ? d.items : null;
      return done(`sent ${listName(d.list, look)}`, [n !== null ? plural(n, 'item') : '']);
    }
    case 'list_undone':
      return done(`undid sending ${listName(d.list, look)}`);
    default:
      return null;
  }
}
