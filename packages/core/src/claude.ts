// Claude's work in the app, by name: what each task is asked, which model does it and how long its
// answer may be. The iPhone sends a task's name and its input to the ai function, which builds the
// words here (they are bundled into the function), so nothing else can be asked on the app's key.
// The preview page asks the viewer's own Claude with the same words. Every answer is read back and
// checked by the task's reader, and a person checks it before anything is saved.
//
// Input reaches the function from a phone, so every prompt takes only what it expects, cut to a
// sensible size: text a person could not have typed in the app does not reach Claude.

import { howInput, howPrompt } from './help';
import { jsonIn } from './planReading';
import { TITLE_MAX } from './rules';
import { describeMarks, suggestPrompt, type SuggestContext } from './suggest';
import { tidyTitle } from './titles';
import type { ColumnMap } from './spreadsheet';
import type { Mark } from './types';

/** Haiku for quick text work; Sonnet for photos and anything that needs judgment. */
export type ClaudeTier = 'quick' | 'sharp';

export interface TaskSpec {
  tier: ClaudeTier;
  /** The longest answer, in tokens. */
  maxTokens: number;
  /** The most pictures that go with it, and the fewest. */
  images: number;
  minImages: number;
  /** The words Claude is asked, from the task's input as it arrived. */
  prompt(input: unknown): string;
  /** Whether the input has enough in it to be worth asking. */
  enough(input: unknown): boolean;
}

// ---------- reading input safely ----------

const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Text on one line, cut to most characters. */
export function clip(v: unknown, most: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, most);
}

/** A list, cut to most entries, each read by its own reader; what reads as nothing is left out. */
function listOf<T>(v: unknown, most: number, read: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    if (out.length >= most) break;
    const r = read(x);
    if (r !== null && r !== '') out.push(r);
  }
  return out;
}

const textList = (v: unknown, most: number, size: number) => listOf(v, most, (x) => clip(x, size) || null);

/** An item as Claude is told about it: its number on the list, title, details and location. */
export interface ItemBrief {
  n: number;
  title: string;
  description: string;
  location: string;
}

function brief(v: unknown): ItemBrief | null {
  const r = record(v);
  const title = clip(r.title, TITLE_MAX);
  if (!title) return null;
  return { n: Math.max(0, Math.floor(Number(r.n) || 0)), title, description: clip(r.description, 300), location: clip(r.location, 60) };
}

const line = (i: ItemBrief) => `#${i.n} ${i.title}${i.description ? `: ${i.description}` : ''}${i.location ? ` (in ${i.location})` : ''}`;

// ---------- Fill In From Photo ----------

const COLORS = ['red', 'yellow', 'white', 'black'] as const;
const unit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
function point(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = unit(v[0]);
  const y = unit(v[1]);
  return x === null || y === null ? null : [x, y];
}

/** A mark as the phone sent it, kept only when it has the shape of one: what describeMarks can put in words. */
export function cleanMark(v: unknown): Mark | null {
  const m = record(v);
  const color = COLORS.find((c) => c === m.color) ?? 'red';
  switch (m.tool) {
    case 'pen': {
      const points = listOf(m.points, 400, point);
      return points.length > 0 ? { tool: 'pen', color, points } : null;
    }
    case 'arrow':
    case 'circle':
    case 'box': {
      const from = point(m.from);
      const to = point(m.to);
      return from && to ? { tool: m.tool, color, from, to } : null;
    }
    case 'measure': {
      const from = point(m.from);
      const to = point(m.to);
      return from && to ? { tool: 'measure', color, from, to, text: clip(m.text, 40) } : null;
    }
    case 'number': {
      const at = point(m.at);
      const n = Math.floor(Number(m.n));
      return at && n > 0 && n < 100 ? { tool: 'number', color, at, n } : null;
    }
    case 'text': {
      const at = point(m.at);
      const to = point(m.to);
      const text = clip(m.text, 60);
      return at && text ? { tool: 'text', color, at, text, ...(to ? { to } : {}) } : null;
    }
    default:
      return null;
  }
}

/** The photo's context as the phone sent it (a SuggestContext). */
function suggestInput(v: unknown): SuggestContext {
  const c = record(v);
  return {
    room: clip(c.room, 60) || 'the job',
    titles: listOf(c.titles, 150, (t) => {
      const x = record(t);
      const title = clip(x.title, TITLE_MAX);
      return title ? { title, trade: clip(x.trade, 40) || null, hours: typeof x.hours === 'number' && x.hours > 0 && x.hours < 200 ? x.hours : null } : null;
    }),
    companies: listOf(c.companies, 60, (t) => {
      const x = record(t);
      const name = clip(x.name, 80);
      return name ? { name, trade: clip(x.trade, 40) } : null;
    }),
    trades: textList(c.trades, 60, 40),
    marks: listOf(c.marks, 30, cleanMark),
    words: clip(c.words, 400),
  };
}

// ---------- Say It ----------

export interface SayItInput {
  /** What was said or typed, as it came. */
  words: string;
  /** Where the person is standing: the location they are in now, if any. */
  here: string | null;
  locations: string[];
  /** The companies on the job and the trade each does here. */
  companies: { name: string; trade: string }[];
  /** The people on the team. */
  people: string[];
  titles: { title: string; trade: string | null }[];
}

function sayItInput(v: unknown): SayItInput {
  const r = record(v);
  return {
    words: clip(r.words, 4000),
    here: clip(r.here, 60) || null,
    locations: textList(r.locations, 300, 60),
    companies: listOf(r.companies, 80, (c) => {
      const x = record(c);
      const name = clip(x.name, 80);
      return name ? { name, trade: clip(x.trade, 40) } : null;
    }),
    people: textList(r.people, 80, 80),
    titles: listOf(r.titles, 150, (t) => {
      const x = record(t);
      const title = clip(x.title, TITLE_MAX);
      return title ? { title, trade: clip(x.trade, 40) || null } : null;
    }),
  };
}

export function sayItPrompt(input: SayItInput): string {
  return [
    "A superintendent walking a home builder's job said what is left to do. Turn it into items on the job's running list of work.",
    '',
    `What they said: "${input.words}"`,
    input.here ? `They are standing in ${input.here}.` : 'They did not say where they are standing.',
    '',
    'Rules:',
    '- Each separate thing to do is its own item. Leave out filler, repeats and anything that is not work to do.',
    '- title: a verb and the thing, as short as possible, like "Install toilet" or "Touch up paint". When one of the standard titles below fits, use it word for word. No room, no company.',
    '- description: where exactly and what is involved, in one short sentence with proper capitalization, or an empty string. Keep sizes and spots they said.',
    `- location: one of the job's locations below, written exactly as it is there. When they name no location, use ${input.here ? `"${input.here}"` : 'null'}. Never make one up.`,
    '- assignedTo: a company or a person from the lists below, written exactly as it is there, when they say who does it or the work plainly belongs to the trade one company does on this job. Otherwise null.',
    '- waitingOn: when they say it has to wait for something (other work, the owner, a part), a few words naming it; otherwise null.',
    '',
    'Locations on the job:',
    ...input.locations.map((l) => `- ${l}`),
    '',
    'Companies on the job (company, trade):',
    ...input.companies.map((c) => `- ${c.name} (${c.trade})`),
    '',
    `People on the team: ${input.people.join(', ') || 'none'}`,
    '',
    'Standard titles (title, trade):',
    ...input.titles.map((t) => `- ${t.title}${t.trade ? ` (${t.trade})` : ''}`),
    '',
    'Reply with only JSON, like {"items": [{"title": "Adjust cabinet door", "description": "Upper left of the sink rubs the frame.", "location": "Kitchen 109", "assignedTo": "SMS Carpentry", "waitingOn": null}]}.',
  ].join('\n');
}

// ---------- the same work twice ----------

export interface SameItemInput {
  item: Omit<ItemBrief, 'n'>;
  candidates: ItemBrief[];
  /** Pictures go with it: the new item's photo first, then each candidate's in the order given. */
  photos: boolean;
}

function sameItemInput(v: unknown): SameItemInput {
  const r = record(v);
  const item = brief({ ...record(r.item), n: 0 }) ?? { n: 0, title: '', description: '', location: '' };
  return { item: { title: item.title, description: item.description, location: item.location }, candidates: listOf(r.candidates, 12, brief), photos: r.photos === true };
}

export function sameItemPrompt(input: SameItemInput): string {
  return [
    "Someone is adding an item to the running list of work left to do on a home builder's job. Is it the same work as one already on the list?",
    '',
    `The new item: ${input.item.title}${input.item.description ? `: ${input.item.description}` : ''}${input.item.location ? ` (in ${input.item.location})` : ''}`,
    '',
    'Already on the list:',
    ...input.candidates.map((c) => `- ${line(c)}`),
    ...(input.photos ? ['', 'The pictures are the new item\'s photo first, then the photos of the ones on the list, in the order above.'] : []),
    '',
    'It is the same work when one visit to fix the one already on the list would fix this too: the same thing in the same spot, said another way. The same kind of work somewhere else, or a different part of the same thing, is not the same.',
    '',
    'Reply with only JSON: {"same": 12} with the number of the one it is, or {"same": null}.',
  ].join('\n');
}

export interface DuplicatesInput {
  pairs: { n: number; a: ItemBrief; b: ItemBrief }[];
}

function duplicatesInput(v: unknown): DuplicatesInput {
  const r = record(v);
  return {
    pairs: listOf(r.pairs, 60, (p) => {
      const x = record(p);
      const a = brief(x.a);
      const b = brief(x.b);
      return a && b ? { n: Math.max(0, Math.floor(Number(x.n) || 0)), a, b } : null;
    }),
  };
}

export function duplicatesPrompt(input: DuplicatesInput): string {
  return [
    "These are pairs of items on the running list of work left to do on a home builder's job that look alike. For each pair, say whether they are the same work written twice.",
    '',
    'They are the same when one visit to fix one would fix the other: the same thing in the same spot, said another way. The same kind of work somewhere else, or a different part of the same thing, is not the same.',
    '',
    ...input.pairs.map((p) => `Pair ${p.n}: ${line(p.a)} | ${line(p.b)}`),
    '',
    'Reply with only JSON: {"same": [1, 4]} with the numbers of the pairs that are the same work, or {"same": []}.',
  ].join('\n');
}

// ---------- standard wording ----------

export interface StandardTitleInput {
  title: string;
  titles: string[];
}

function standardTitleInput(v: unknown): StandardTitleInput {
  const r = record(v);
  return { title: clip(r.title, TITLE_MAX), titles: textList(r.titles, 300, TITLE_MAX) };
}

export function standardTitlePrompt(input: StandardTitleInput): string {
  return [
    'A builder keeps a list of standard titles so the same work reads the same way on every list. Someone typed a new title. Is it one of the standard titles said another way?',
    '',
    `They typed: "${input.title}"`,
    '',
    'Standard titles:',
    ...input.titles.map((t) => `- ${t}`),
    '',
    'Only count it when it is plainly the same work: "towel bar is loose" is "Tighten towel bar", not "Install towel bar".',
    'Reply with only JSON: {"title": "Tighten towel bar"} with the standard title written exactly as it is above, or {"title": null}.',
  ].join('\n');
}

// ---------- a punch list someone else wrote, read into items ----------

/** What reading a punch list goes by: the job's locations, companies, team and standard titles. */
export type ListReadInput = Omit<SayItInput, 'words' | 'here'>;

export function listReadInput(v: unknown): ListReadInput {
  const { words: _words, here: _here, ...rest } = sayItInput({ ...record(v), words: '' });
  return rest;
}

/**
 * The words for reading a punch list someone else wrote: a PDF or pictures of its pages, attached,
 * or its text below. pages: how many pictures of pages go with it.
 */
export function listReadPrompt(input: ListReadInput, options: { text?: string; pages?: number } = {}): string {
  const lines = [
    "This is a punch list for a house being built: a list of work left to do, written by someone else, like a superintendent, the owner, the designer or an inspector. Turn each thing on it into an item on the job's running list of work.",
    options.text
      ? 'The list is below, as the text on each page.'
      : options.pages
        ? `The list is attached as ${options.pages === 1 ? 'a picture of one page' : `pictures of ${options.pages} pages, in order`}.`
        : 'The list is attached.',
    '',
    'Rules:',
    '- Each separate thing to do is its own item. Leave out headings, totals, page numbers, signatures and anything that is not work to do, and anything marked done or complete.',
    '- title: a verb and the thing, as short as possible, like "Install toilet" or "Touch up paint". When one of the standard titles below fits, use it word for word. No room, no company.',
    '- description: where exactly and what is involved, in one short sentence with proper capitalization, or an empty string. Keep sizes and spots the list gives.',
    "- location: one of the job's locations below, written exactly as it is there, when the list says where (a room heading counts for everything under it). Otherwise null. Never make one up.",
    '- assignedTo: a company or a person from the lists below, written exactly as it is there, when the list says who does it or the work plainly belongs to the trade one company does on this job. Otherwise null.',
    '- waitingOn: when the list says it has to wait for something (other work, the owner, a part), a few words naming it; otherwise null.',
    '',
    'Locations on the job:',
    ...input.locations.map((l) => `- ${l}`),
    '',
    'Companies on the job (company, trade):',
    ...input.companies.map((c) => `- ${c.name} (${c.trade})`),
    '',
    `People on the team: ${input.people.join(', ') || 'none'}`,
    '',
    'Standard titles (title, trade):',
    ...input.titles.map((t) => `- ${t.title}${t.trade ? ` (${t.trade})` : ''}`),
    '',
    'Reply with only JSON, like {"items": [{"title": "Adjust cabinet door", "description": "Upper left of the sink rubs the frame.", "location": "Kitchen 109", "assignedTo": "SMS Carpentry", "waitingOn": null}]}.',
  ];
  if (options.text) lines.push('', 'The list:', options.text);
  return lines.join('\n');
}

// ---------- a company from a business card or an email signature ----------

export interface CompanyCardInput {
  /** An email signature, pasted; empty when only a card's photo goes. */
  words: string;
  /** Whether a photo of a business card goes with it. */
  card: boolean;
  trades: string[];
}

function companyCardInput(v: unknown): CompanyCardInput {
  const r = record(v);
  return { words: String(r.words ?? '').trim().slice(0, 2000), card: r.card === true, trades: textList(r.trades, 80, 40) };
}

export function companyCardPrompt(input: CompanyCardInput): string {
  const from = input.card && input.words ? 'a photo of a business card and an email signature' : input.card ? 'a photo of a business card' : 'an email signature';
  return [
    `Read a company's details for a home builder's list of the companies it works with, from ${from}.`,
    ...(input.words ? ['', 'The email signature, between the lines:', '---', input.words, '---'] : []),
    '',
    "- name: the company's name, with normal capitalization. Not a person's name.",
    `- trade: the one of these trades the company does, written exactly as it is here, or null when unsure: ${input.trades.join(', ') || 'none'}.`,
    "- phone: the company's main phone as written, or null. email: the company's main email, or null.",
    '- people: each person named, with their name, and their own phone and email as written (null for any not given).',
    '',
    'Reply with only JSON, like {"name": "Gator Plumbing", "trade": "Plumbing", "phone": "941-555-0101", "email": "office@gatorplumbing.com", "people": [{"name": "Dave Smith", "phone": "941-555-0102", "email": "dave@gatorplumbing.com"}]}.',
  ].join('\n');
}

/** What Claude read from a card or a signature. trade: one of the trades given, or null. */
export interface CompanyCard {
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  people: { name: string; phone: string | null; email: string | null }[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailOf = (v: unknown) => {
  const e = clip(v, 120).toLowerCase();
  return EMAIL.test(e) ? e : null;
};
const phoneOf = (v: unknown) => {
  const p = clip(v, 40);
  return (p.match(/\d/g) ?? []).length >= 7 ? p : null;
};

export function readCompanyCard(raw: unknown, trades: string[]): CompanyCard | null {
  const a = answer(raw);
  const name = clip(a.name, 80);
  if (!name) return null;
  const said = clip(a.trade, 40).toLowerCase();
  return {
    name,
    trade: trades.find((t) => t.toLowerCase() === said) ?? null,
    phone: phoneOf(a.phone),
    email: emailOf(a.email),
    people: listOf(a.people, 10, (p) => {
      const x = record(p);
      const who = clip(x.name, 80);
      return who ? { name: who, phone: phoneOf(x.phone), email: emailOf(x.email) } : null;
    }),
  };
}

// ---------- what a new item waits on ----------

export interface WaitsOnInput {
  item: { title: string; description: string; location: string; company: string };
  /** The other open items in the location, numbered. */
  candidates: (ItemBrief & { company: string })[];
}

function waitsOnInput(v: unknown): WaitsOnInput {
  const r = record(v);
  const it = record(r.item);
  return {
    item: { title: clip(it.title, TITLE_MAX), description: clip(it.description, 300), location: clip(it.location, 60), company: clip(it.company, 80) },
    candidates: listOf(r.candidates, 30, (c) => {
      const b = brief(c);
      return b ? { ...b, company: clip(record(c).company, 80) } : null;
    }),
  };
}

export function waitsOnPrompt(input: WaitsOnInput): string {
  return [
    "Someone is adding an item to the running list of work left to do on a home builder's job. Does it have to wait for any of the other open items in the same location to be done first?",
    '',
    `The new item: ${input.item.title}${input.item.description ? `: ${input.item.description}` : ''}${input.item.location ? ` (in ${input.item.location})` : ''}${input.item.company ? `, by ${input.item.company}` : ''}`,
    '',
    'Open in the same location:',
    ...input.candidates.map((c) => `- ${line(c)}${c.company ? `, by ${c.company}` : ''}`),
    '',
    'Only count work that plainly has to come first, the way a builder sequences a house: the tile floor before the toilet is set, the drywall before the paint, the countertop before the faucet. Not work that merely sits nearby.',
    'Reply with only JSON: {"waits": [12]} with the numbers of the items it waits on, or {"waits": []}.',
  ].join('\n');
}

/** Which of the given numbers Claude said the new item waits on. */
export function readWaitsOn(raw: unknown, numbers: number[]): number[] {
  const said = answer(raw).waits;
  if (!Array.isArray(said)) return [];
  return [...new Set(said.map((n) => Number(String(n).replace(/^#/, ''))).filter((n) => numbers.includes(n)))];
}

// ---------- which column is which, in someone else's spreadsheet ----------

export interface ColumnsInput {
  /** The first rows, as they came. */
  rows: string[][];
}

function columnsInput(v: unknown): ColumnsInput {
  const r = record(v);
  return { rows: listOf(r.rows, 8, (row) => (Array.isArray(row) ? row.slice(0, 20).map((c) => clip(c, 80)) : null)) };
}

export function columnsPrompt(input: ColumnsInput): string {
  return [
    "These are the first rows of a spreadsheet of work left to do on a home builder's job, written by someone else. Say which column holds what, counting the columns from 0.",
    '',
    ...input.rows.map((r, i) => `Row ${i + 1}: ${r.map((c, j) => `[${j}] ${c}`).join(' | ')}`),
    '',
    '- title: the work to do. description: more about it or where exactly. location: the room or area. assignedTo: the company or person who does it. waitingOn: what it waits for. done: says when a row is finished.',
    '- header: whether row 1 names the columns rather than being work.',
    'Reply with only JSON, like {"title": 1, "description": 2, "location": 0, "assignedTo": 3, "waitingOn": null, "done": null, "header": true}, with null for any column the spreadsheet does not have.',
  ].join('\n');
}

/** The columns Claude said, each a column the rows have, or null. */
export function readColumns(raw: unknown, width: number): ColumnMap | null {
  const a = answer(raw);
  const col = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < width ? v : null);
  const map: ColumnMap = { title: col(a.title), description: col(a.description), location: col(a.location), assignedTo: col(a.assignedTo), waitingOn: col(a.waitingOn), done: col(a.done), header: a.header === true };
  return map.title === null ? null : map;
}

// ---------- the done check: the photo of the problem and the photo of the finished work ----------

export interface DoneCheckInput {
  title: string;
  description: string;
  location: string;
  /** The marks on the photo of the problem. */
  marks: Mark[];
}

function doneCheckInput(v: unknown): DoneCheckInput {
  const r = record(v);
  return { title: clip(r.title, TITLE_MAX), description: clip(r.description, 300), location: clip(r.location, 60), marks: listOf(r.marks, 30, cleanMark) };
}

export function doneCheckPrompt(input: DoneCheckInput): string {
  const marks = describeMarks(input.marks);
  return [
    "Someone says one item on the running list of work left to do on a home builder's job is finished. Check the work from two photos.",
    '',
    `The item: ${input.title}${input.description ? `: ${input.description}` : ''}${input.location ? ` (in ${input.location})` : ''}`,
    `The first picture is the photo of the problem, taken before the work.${marks.length > 0 ? ' It was marked to show the problem:' : ''}`,
    ...marks.map((m) => `- ${m}`),
    'The second picture is the photo of the finished work.',
    '',
    'Does the second photo show this item done? Look only at what the item is about, in the same spot. When the second photo does not show that spot, or it is too dark or blurry to tell, say you cannot tell.',
    '',
    'Reply with only JSON: {"done": "yes"} when it looks done; {"done": "no", "left": "The left hinge still looks loose."} with one short sentence on what still looks left; or {"done": "unsure", "left": "The photo does not show the hinge."} with one short sentence on why.',
  ].join('\n');
}

// ---------- the owner's weekly update ----------

/** What the week's update to the owner is written from: the job's list, as the owner sees it. */
export interface OwnerUpdateInput {
  job: string;
  builder: string;
  /** Who it is from: the person writing it. */
  from: string;
  /** Who it is for, as the owner's link names them, or empty. */
  owner: string;
  /** What was finished in the last seven days. */
  done: { title: string; location: string }[];
  /** How many items are still open, and where most of them are. */
  open: number;
  openBy: { location: string; open: number }[];
  /** What waits on the owner. */
  waiting: { title: string; location: string }[];
  /** What the owner sent from their page, and where each stands. */
  sent: { words: string; status: 'received' | 'on_list' | 'done' }[];
  /** Which trades are coming in the next seven days, by day: "Tuesday, November 10". */
  coming: { day: string; trade: string }[];
}

const SENT_STATUS = ['received', 'on_list', 'done'] as const;
const titled = (v: unknown) => {
  const x = record(v);
  const title = clip(x.title, TITLE_MAX);
  return title ? { title, location: clip(x.location, 60) } : null;
};

export function ownerUpdateInput(v: unknown): OwnerUpdateInput {
  const r = record(v);
  return {
    job: clip(r.job, 80),
    builder: clip(r.builder, 80),
    from: clip(r.from, 80),
    owner: clip(r.owner, 80),
    done: listOf(r.done, 80, titled),
    open: Math.max(0, Math.min(100_000, Math.floor(Number(r.open) || 0))),
    openBy: listOf(r.openBy, 8, (x) => {
      const o = record(x);
      const location = clip(o.location, 60);
      const open = Math.floor(Number(o.open) || 0);
      return location && open > 0 ? { location, open } : null;
    }),
    waiting: listOf(r.waiting, 20, titled),
    sent: listOf(r.sent, 20, (x) => {
      const o = record(x);
      const words = clip(o.words, 200);
      const status = SENT_STATUS.find((st) => st === o.status);
      return words && status ? { words, status } : null;
    }),
    coming: listOf(r.coming, 20, (x) => {
      const o = record(x);
      const day = clip(o.day, 40);
      const trade = clip(o.trade, 40);
      return day && trade ? { day, trade } : null;
    }),
  };
}

const placed = (t: { title: string; location: string }) => `- ${t.title}${t.location ? ` (${t.location})` : ''}`;

export function ownerUpdatePrompt(input: OwnerUpdateInput): string {
  const sentWords = { received: 'the team has it', on_list: 'on the list', done: 'done' } as const;
  return [
    'Write this week\'s update from a home builder to the owner of the house it is building, from the job\'s running list of work.',
    '',
    `The house: ${input.job || 'the job'}. The builder: ${input.builder || 'the builder'}. It is from ${input.from || 'the builder'}${input.owner ? `, to ${input.owner}` : ''}.`,
    '',
    input.done.length > 0 ? `Finished this week (${input.done.length}):` : 'Nothing on the list was finished this week.',
    ...input.done.map(placed),
    '',
    `Still open: ${input.open === 1 ? '1 item' : `${input.open} items`}${input.openBy.length > 0 ? `, most in ${input.openBy.map((o) => `${o.location} (${o.open})`).join(', ')}` : ''}.`,
    '',
    input.waiting.length > 0 ? 'Waiting on the owner:' : 'Nothing is waiting on the owner.',
    ...input.waiting.map(placed),
    ...(input.sent.length > 0 ? ['', 'What the owner sent from their page, and where it stands:', ...input.sent.map((x) => `- "${x.words}": ${sentWords[x.status]}`)] : []),
    '',
    input.coming.length > 0 ? 'Coming in the next week:' : 'No one is scheduled for the next week yet.',
    ...input.coming.map((c) => `- ${c.day}: ${c.trade}`),
    '',
    'Rules:',
    '- Write the way a builder talks to an owner: warm, plain and short. Open with their name when it is given, then what got done, what is coming, and what is needed from them, in a few short paragraphs. Close by wishing them a good weekend, then the name of who it is from.',
    '- Keep it positive, and single no one out: never blame a trade, a company or a person for anything.',
    '- Make them feel welcome to reply with anything that was missed or does not look right.',
    '- Say what got done by room, in a sentence or two. Do not list every item, and leave out item numbers.',
    '- When something waits on the owner, ask for it plainly.',
    '- Name trades, never companies: "the painter", "the plumber".',
    '- Use only what is here. No prices, and no dates or promises beyond the days given.',
    '- Do not use dashes or hyphens. Spell out days and months.',
    '',
    'Reply with only JSON: {"subject": "This week at the house", "body": "..."} with a short subject, and the body\'s paragraphs separated by a blank line.',
  ].join('\n');
}

/** The update Claude wrote, for the person to read and change before they send it. */
export interface OwnerUpdate {
  subject: string;
  body: string;
}

const noDashes = (text: string) => text.replace(/\s+[–—]\s+/g, ', ').replace(/[–—]/g, ', ');

export function readOwnerUpdate(raw: unknown): OwnerUpdate | null {
  const a = answer(raw);
  const body = typeof a.body === 'string' ? noDashes(a.body.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()).slice(0, 4000) : '';
  if (!body) return null;
  return { subject: noDashes(clip(a.subject, 120)) || 'This week at the house', body };
}

// ---------- the companies' answers, summed up on Activity ----------

export interface CompanySummaryInput {
  /** How many days the lines cover. */
  days: number;
  /** What each company did on its page, oldest first: "Mike at Triple H Painting confirmed Patch drywall. Laundry 119." */
  lines: { company: string; text: string }[];
}

export function companySummaryInput(v: unknown): CompanySummaryInput {
  const r = record(v);
  return {
    days: Math.max(1, Math.min(31, Math.floor(Number(r.days) || 7))),
    lines: listOf(r.lines, 200, (x) => {
      const o = record(x);
      const company = clip(o.company, 80);
      const text = clip(o.text, 300);
      return company && text ? { company, text } : null;
    }),
  };
}

export function companySummaryPrompt(input: CompanySummaryInput): string {
  return [
    `This is what the companies working on a home builder's job did on their own pages in the last ${input.days === 1 ? 'day' : `${input.days} days`}: the work they confirmed or finished, the time they gave, and what they wrote. Sum it up for the superintendent, company by company.`,
    '',
    ...input.lines.map((l) => `- ${l.company}: ${l.text}`),
    '',
    'Rules:',
    '- One or two short sentences a company: what they finished or confirmed, and anything they wrote that needs an answer or holds up other work.',
    '- needsAnswer: true when they asked something, or said something the superintendent has to act on.',
    '- Use only what is here, and name rooms as they are written. Do not use dashes.',
    '',
    'Reply with only JSON, like {"companies": [{"name": "Triple H Painting", "summary": "Finished six items in the kitchen and laundry. Asked whether the dining room trim gets one coat or two.", "needsAnswer": true}]}, with each name written exactly as it is above, the companies that need an answer first.',
  ].join('\n');
}

export interface CompanySummary {
  name: string;
  summary: string;
  needsAnswer: boolean;
}

/** Claude's summary of each company, only for the companies given, each once. */
export function readCompanySummary(raw: unknown, names: string[]): CompanySummary[] {
  const list = answer(raw).companies;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.flatMap((x) => {
    const o = record(x);
    const said = clip(o.name, 80).toLowerCase();
    const name = names.find((n) => n.toLowerCase() === said);
    const summary = noDashes(clip(o.summary, 400));
    if (!name || !summary || seen.has(name)) return [];
    seen.add(name);
    return [{ name, summary: /[.!?]$/.test(summary) ? summary : `${summary}.`, needsAnswer: o.needsAnswer === true }];
  });
}

// ---------- a company's page in Spanish ----------

/** The most lines asked at once: a long list is translated over its next few openings. */
export const TRANSLATE_AT_ONCE = 150;

/**
 * The words for translating a company's list into Spanish: each line is a title, a note or what
 * an item waits on, written by a builder in English, numbered.
 */
export function translatePrompt(texts: string[]): string {
  return [
    "Translate these lines from a home builder's running list of work into Spanish, for a construction crew. Each is the title of the work to do, more about it, or a note from the builder.",
    '',
    ...texts.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, ' ').trim()}`),
    '',
    'Rules:',
    '- Use the plain Spanish a crew on a job site uses. Keep each line about as short as it is.',
    '- Keep names, room names and numbers, sizes, item numbers and brand names as they are.',
    '- Translate every line, in order, and nothing else.',
    '',
    'Reply with only JSON: {"es": ["...", "..."]} with one translation for each line, in the same order.',
  ].join('\n');
}

/** The translations Claude gave, by line, or null for a line it did not give. */
export function readTranslations(raw: unknown, count: number): (string | null)[] {
  const list = answer(raw).es;
  const out: (string | null)[] = Array.from({ length: count }, () => null);
  if (!Array.isArray(list) || list.length !== count) return out;
  for (let i = 0; i < count; i++) {
    const t = typeof list[i] === 'string' ? (list[i] as string).replace(/\s+/g, ' ').trim().slice(0, 4000) : '';
    out[i] = t || null;
  }
  return out;
}

// ---------- Ask Claude to find: what to show, said in words, as the list's filters ----------

/** What finding goes by: the job's own names, so the filters Claude picks are ones the job has. */
export interface FindInput {
  words: string;
  locations: string[];
  floors: string[];
  companies: string[];
  people: string[];
  waitingOn: string[];
}

export function findInput(v: unknown): FindInput {
  const r = record(v);
  return {
    words: clip(r.words, 400),
    locations: textList(r.locations, 300, 60),
    floors: textList(r.floors, 20, 40),
    companies: textList(r.companies, 80, 80),
    people: textList(r.people, 80, 80),
    waitingOn: textList(r.waitingOn, 60, 60),
  };
}

export function findPrompt(input: FindInput): string {
  const names = (label: string, list: string[]) => `${label}: ${list.length > 0 ? list.join('; ') : 'none'}`;
  return [
    "Someone looking at the running list of work on a home builder's job said what they want to see. Turn it into the list's filters.",
    '',
    `They said: "${input.words}"`,
    '',
    "The job's names, to pick from exactly as written:",
    names('Levels', input.floors),
    names('Locations', input.locations),
    names('Companies', input.companies),
    names('People on the team', input.people),
    names('What items wait on', input.waitingOn),
    '',
    'The filters, each a list, empty when not said:',
    '- states: any of "ready" (can be done now), "not_ready" (waiting on something), "past_due" (late), "needs_price" (extra work to be quoted).',
    '- kinds: any of "deficiency" (something wrong to fix), "completion" (work not finished), "added_scope" (extra work).',
    '- companies, people (who it is assigned to), levels, locations, waitingOn: names from the lists above only.',
    '- photo, scheduled, estimated: true or false when they said with or without a photo, on a visit or not, with a time or not; otherwise null.',
    '- groupBy: "room", "company" or "waiting" when they said how to group it; otherwise null. showCompleted: true only when they asked for finished work too.',
    '- Leave out anything they did not say. Never make a name up.',
    '',
    'Reply with only JSON, like {"states": ["ready"], "kinds": [], "companies": ["Gator Plumbing"], "people": [], "levels": ["Level 2"], "locations": [], "waitingOn": [], "photo": null, "scheduled": null, "estimated": null, "groupBy": null, "showCompleted": false}.',
  ].join('\n');
}

/** The filters Claude picked, as names the job has; what does not match is left out. */
export interface FoundFilters {
  states: ('ready' | 'not_ready' | 'past_due' | 'needs_price')[];
  kinds: ('deficiency' | 'completion' | 'added_scope')[];
  companies: string[];
  people: string[];
  floors: string[];
  locations: string[];
  waitingOn: string[];
  photo: boolean | null;
  scheduled: boolean | null;
  estimated: boolean | null;
  groupBy: 'room' | 'company' | 'waiting' | null;
  showCompleted: boolean;
}

export function readFind(raw: unknown, input: Omit<FindInput, 'words'>): FoundFilters | null {
  const a = answer(raw);
  if (Object.keys(a).length === 0) return null;
  const pick = (v: unknown, list: string[]) => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      const said = clip(x, 80).toLowerCase();
      const hit = list.find((n) => n.toLowerCase() === said);
      if (hit && !out.includes(hit)) out.push(hit);
    }
    return out;
  };
  const yesNo = (v: unknown) => (v === true ? true : v === false ? false : null);
  return {
    states: pick(a.states, ['ready', 'not_ready', 'past_due', 'needs_price']) as FoundFilters['states'],
    kinds: pick(a.kinds, ['deficiency', 'completion', 'added_scope']) as FoundFilters['kinds'],
    companies: pick(a.companies, input.companies),
    people: pick(a.people, input.people),
    floors: pick(a.levels, input.floors),
    locations: pick(a.locations, input.locations),
    waitingOn: pick(a.waitingOn, input.waitingOn),
    photo: yesNo(a.photo),
    scheduled: yesNo(a.scheduled),
    estimated: yesNo(a.estimated),
    groupBy: a.groupBy === 'room' || a.groupBy === 'company' || a.groupBy === 'waiting' ? a.groupBy : null,
    showCompleted: a.showCompleted === true,
  };
}

// ---------- the end of the day: what got done and found, for the daily log ----------

export interface DayNoteInput {
  job: string;
  /** "Monday, November 9". */
  day: string;
  done: { title: string; location: string; by: string }[];
  added: { title: string; location: string }[];
  /** The companies on site today, by name and trade. */
  onSite: { name: string; trade: string }[];
  /** What was said today in comments, by whom. */
  said: { who: string; words: string }[];
}

const dayLine = (v: unknown) => {
  const x = record(v);
  const title = clip(x.title, TITLE_MAX);
  return title ? { title, location: clip(x.location, 60), by: clip(x.by, 80) } : null;
};

export function dayNoteInput(v: unknown): DayNoteInput {
  const r = record(v);
  return {
    job: clip(r.job, 80),
    day: clip(r.day, 40),
    done: listOf(r.done, 120, dayLine),
    added: listOf(r.added, 120, (x) => {
      const d = dayLine(x);
      return d ? { title: d.title, location: d.location } : null;
    }),
    onSite: listOf(r.onSite, 30, (x) => {
      const o = record(x);
      const name = clip(o.name, 80);
      return name ? { name, trade: clip(o.trade, 40) } : null;
    }),
    said: listOf(r.said, 40, (x) => {
      const o = record(x);
      const words = clip(o.words, 300);
      return words ? { who: clip(o.who, 80), words } : null;
    }),
  };
}

export function dayNotePrompt(input: DayNoteInput): string {
  const placed = (t: { title: string; location: string }) => `${t.title}${t.location ? ` (${t.location})` : ''}`;
  return [
    `Write the end of day note for a home builder's daily log on ${input.job || 'the job'}, ${input.day || 'today'}, from what happened on the job's running list of work.`,
    '',
    input.onSite.length > 0 ? 'On site today:' : 'No company was scheduled on site today.',
    ...input.onSite.map((c) => `- ${c.name}${c.trade ? ` (${c.trade})` : ''}`),
    '',
    input.done.length > 0 ? `Finished today (${input.done.length}):` : 'Nothing on the list was finished today.',
    ...input.done.map((d) => `- ${placed(d)}${d.by ? `, by ${d.by}` : ''}`),
    '',
    input.added.length > 0 ? `Found and added today (${input.added.length}):` : 'Nothing was added to the list today.',
    ...input.added.map((d) => `- ${placed(d)}`),
    ...(input.said.length > 0 ? ['', 'Said in comments today:', ...input.said.map((c) => `- ${c.who ? `${c.who}: ` : ''}${c.words}`)] : []),
    '',
    'Rules:',
    '- Three short parts, each a heading on its own line then a few plain sentences: Work Completed, Issues Found, Notes. Under Notes, anything said that someone needs to act on, or "None."',
    '- Group the work by room and by trade in sentences; do not list every item, and leave out item numbers.',
    '- Use only what is here. Do not use dashes or hyphens. Spell out days and months.',
    '',
    'Reply with only JSON: {"note": "Work Completed\\n..."} with the parts separated by a blank line.',
  ].join('\n');
}

export function readDayNote(raw: unknown): string | null {
  const a = answer(raw);
  const note = typeof a.note === 'string' ? noDashes(a.note.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()).slice(0, 6000) : '';
  return note || null;
}

// ---------- a photo's words, for search ----------

export interface DescribePhotoInput {
  /** The item the photo is on, to say what it shows of it. */
  title: string;
  location: string;
}

export function describePhotoInput(v: unknown): DescribePhotoInput {
  const r = record(v);
  return { title: clip(r.title, TITLE_MAX), location: clip(r.location, 60) };
}

export function describePhotoPrompt(input: DescribePhotoInput): string {
  return [
    `This photo is on an item on a home builder's list of work${input.title ? `, "${input.title}"` : ''}${input.location ? `, in ${input.location}` : ''}.`,
    'Say what is in it in a few plain words someone would search for later: the things, the materials, the colors and any damage, like "water stain on the ceiling by the vent, white drywall".',
    'At most 20 words. No sentences about the item itself.',
    'Reply with only JSON: {"words": "..."}.',
  ].join('\n');
}

export function readPhotoWords(raw: unknown): string | null {
  const words = noDashes(clip(answer(raw).words, 200)).replace(/[.]+$/, '');
  return words || null;
}

// ---------- the tasks ----------

export type ClaudeTask =
  | 'fill-in'
  | 'say-it'
  | 'same-item'
  | 'duplicates'
  | 'standard-title'
  | 'done-check'
  | 'company-card'
  | 'waits-on'
  | 'columns'
  | 'owner-update'
  | 'company-summary'
  | 'find'
  | 'day-note'
  | 'describe-photo'
  | 'how';

export const CLAUDE_TASKS: Record<ClaudeTask, TaskSpec> = {
  'fill-in': { tier: 'sharp', maxTokens: 900, images: 1, minImages: 1, prompt: (v) => suggestPrompt(suggestInput(v)), enough: () => true },
  'say-it': { tier: 'sharp', maxTokens: 3000, images: 0, minImages: 0, prompt: (v) => sayItPrompt(sayItInput(v)), enough: (v) => sayItInput(v).words !== '' },
  'same-item': {
    tier: 'quick',
    maxTokens: 100,
    images: 6,
    minImages: 0,
    prompt: (v) => sameItemPrompt(sameItemInput(v)),
    enough: (v) => {
      const x = sameItemInput(v);
      return x.item.title !== '' && x.candidates.length > 0;
    },
  },
  duplicates: { tier: 'quick', maxTokens: 400, images: 0, minImages: 0, prompt: (v) => duplicatesPrompt(duplicatesInput(v)), enough: (v) => duplicatesInput(v).pairs.length > 0 },
  'standard-title': {
    tier: 'quick',
    maxTokens: 100,
    images: 0,
    minImages: 0,
    prompt: (v) => standardTitlePrompt(standardTitleInput(v)),
    enough: (v) => {
      const x = standardTitleInput(v);
      return x.title !== '' && x.titles.length > 0;
    },
  },
  'done-check': { tier: 'sharp', maxTokens: 300, images: 2, minImages: 2, prompt: (v) => doneCheckPrompt(doneCheckInput(v)), enough: (v) => doneCheckInput(v).title !== '' },
  columns: { tier: 'quick', maxTokens: 200, images: 0, minImages: 0, prompt: (v) => columnsPrompt(columnsInput(v)), enough: (v) => columnsInput(v).rows.length > 0 },
  'waits-on': {
    tier: 'quick',
    maxTokens: 100,
    images: 0,
    minImages: 0,
    prompt: (v) => waitsOnPrompt(waitsOnInput(v)),
    enough: (v) => {
      const x = waitsOnInput(v);
      return x.item.title !== '' && x.candidates.length > 0;
    },
  },
  'company-card': {
    tier: 'sharp',
    maxTokens: 600,
    images: 1,
    minImages: 0,
    prompt: (v) => companyCardPrompt(companyCardInput(v)),
    enough: (v) => {
      const x = companyCardInput(v);
      return x.words !== '' || x.card;
    },
  },
  'owner-update': {
    tier: 'sharp',
    maxTokens: 1200,
    images: 0,
    minImages: 0,
    prompt: (v) => ownerUpdatePrompt(ownerUpdateInput(v)),
    enough: (v) => {
      const x = ownerUpdateInput(v);
      return x.done.length > 0 || x.waiting.length > 0 || x.coming.length > 0 || x.sent.length > 0 || x.open > 0;
    },
  },
  'company-summary': {
    tier: 'quick',
    maxTokens: 1500,
    images: 0,
    minImages: 0,
    prompt: (v) => companySummaryPrompt(companySummaryInput(v)),
    enough: (v) => companySummaryInput(v).lines.length > 0,
  },
  find: { tier: 'quick', maxTokens: 500, images: 0, minImages: 0, prompt: (v) => findPrompt(findInput(v)), enough: (v) => findInput(v).words !== '' },
  'day-note': {
    tier: 'sharp',
    maxTokens: 1500,
    images: 0,
    minImages: 0,
    prompt: (v) => dayNotePrompt(dayNoteInput(v)),
    enough: (v) => {
      const x = dayNoteInput(v);
      return x.done.length > 0 || x.added.length > 0 || x.onSite.length > 0 || x.said.length > 0;
    },
  },
  'describe-photo': { tier: 'quick', maxTokens: 120, images: 1, minImages: 1, prompt: (v) => describePhotoPrompt(describePhotoInput(v)), enough: () => true },
  how: { tier: 'quick', maxTokens: 500, images: 0, minImages: 0, prompt: (v) => howPrompt(howInput(v)), enough: (v) => howInput(v).question !== '' },
};

export const isClaudeTask = (v: unknown): v is ClaudeTask => typeof v === 'string' && Object.hasOwn(CLAUDE_TASKS, v);

/** The words for a task, from its input as it came: what the function and the preview both ask. */
export function taskPrompt(task: ClaudeTask, input: unknown): string {
  return CLAUDE_TASKS[task].prompt(input);
}

// ---------- what it costs ----------

/** The model each tier asks. */
export const CLAUDE_MODELS: Record<ClaudeTier, string> = { quick: 'claude-haiku-5-5', sharp: 'claude-sonnet-5-5' };

/** Dollars for a million tokens in and out. Haiku costs five times as much past 100,000 tokens of prompt. */
const PRICES: { model: string; input: number; output: number; long?: { input: number; output: number } }[] = [
  { model: 'claude-haiku-5-5', input: 0.1, output: 0.5, long: { input: 0.5, output: 2.5 } },
  { model: 'claude-sonnet-5-5', input: 2, output: 10 },
  { model: 'claude-opus-5-5', input: 4, output: 20 },
];

/** The tokens one answer took, as Claude reports them. */
export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** What one answer cost, in cents, to four places. A model not on the list is counted at Opus's price, to be safe. */
export function costCents(model: string, usage: ClaudeUsage): number {
  const price = PRICES.find((p) => model.startsWith(p.model)) ?? PRICES[PRICES.length - 1]!;
  const fresh = count(usage.input_tokens);
  const written = count(usage.cache_creation_input_tokens);
  const read = count(usage.cache_read_input_tokens);
  const rate = price.long && fresh + written + read > 100_000 ? price.long : price;
  // A cache write is a quarter more than a token in; a cache read is a tenth of one.
  const dollars = ((fresh + written * 1.25 + read * 0.1) * rate.input + count(usage.output_tokens) * rate.output) / 1_000_000;
  return Math.round(dollars * 100 * 10_000) / 10_000;
}

// ---------- reading the answers ----------

const answer = (raw: unknown) => record(typeof raw === 'string' ? jsonIn(raw) : raw);

/** What Claude saw in the done photo: done, something left, or it cannot tell; with a sentence on what. */
export interface DoneCheck {
  verdict: 'done' | 'left' | 'unsure';
  /** What still looks left, or why it cannot tell: one sentence, or null. */
  note: string | null;
}

export function readDoneCheck(raw: unknown): DoneCheck | null {
  const a = answer(raw);
  const said = typeof a.done === 'string' ? a.done.trim().toLowerCase() : a.done === true ? 'yes' : a.done === false ? 'no' : '';
  const verdict = said === 'yes' ? 'done' : said === 'no' ? 'left' : said === 'unsure' ? 'unsure' : null;
  if (!verdict) return null;
  const left = clip(a.left, 200);
  const note = verdict === 'done' || left === '' ? null : /[.!?]$/.test(left) ? left : `${left}.`;
  return { verdict, note: note ? note.charAt(0).toUpperCase() + note.slice(1) : null };
}

/** Which of the given numbers Claude said the new item is, or null. */
export function readSameItem(raw: unknown, numbers: number[]): number | null {
  const same = answer(raw).same;
  const n = typeof same === 'number' ? same : typeof same === 'string' ? Number(same.replace('#', '')) : NaN;
  return Number.isInteger(n) && numbers.includes(n) ? n : null;
}

/** The pairs Claude said are the same work, by number. */
export function readDuplicates(raw: unknown, numbers: number[]): number[] {
  const same = answer(raw).same;
  if (!Array.isArray(same)) return [];
  return [...new Set(same.map((x) => Number(x)).filter((n) => numbers.includes(n)))];
}

/** The standard title Claude matched, exactly as it is on the list, or null. */
export function readStandardTitle(raw: unknown, titles: string[]): string | null {
  const t = answer(raw).title;
  if (typeof t !== 'string') return null;
  return titles.find((x) => x.toLowerCase() === t.trim().toLowerCase()) ?? null;
}

/** One item Claude heard, matched to the job: its location and assignee by name, or null when they are not on the job. */
export interface HeardItem {
  title: string;
  description: string;
  location: string | null;
  assignedTo: string | null;
  waitingOn: string | null;
}

/** The items Claude heard, with locations and assignees only when they are the job's own. */
export function readSayIt(raw: unknown, input: Pick<SayItInput, 'locations' | 'companies' | 'people'>): HeardItem[] {
  const items = answer(raw).items;
  if (!Array.isArray(items)) return [];
  const pick = (list: string[], v: unknown) => {
    const s = clip(v, 80).toLowerCase();
    return s ? (list.find((x) => x.toLowerCase() === s) ?? null) : null;
  };
  const names = [...input.companies.map((c) => c.name), ...input.people];
  return items.slice(0, 60).flatMap((x) => {
    const r = record(x);
    const title = tidyTitle(clip(r.title, TITLE_MAX));
    if (!title) return [];
    const description = clip(r.description, 400);
    return [
      {
        title,
        description: description ? description.charAt(0).toUpperCase() + description.slice(1) : '',
        location: pick(input.locations, r.location),
        assignedTo: pick(names, r.assignedTo),
        waitingOn: clip(r.waitingOn, 80) || null,
      },
    ];
  });
}
