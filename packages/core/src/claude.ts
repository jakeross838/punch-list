// Claude's work in the app, by name: what each task is asked, which model does it and how long its
// answer may be. The iPhone sends a task's name and its input to the ai function, which builds the
// words here (they are bundled into the function), so nothing else can be asked on the app's key.
// The preview page asks the viewer's own Claude with the same words. Every answer is read back and
// checked by the task's reader, and a person checks it before anything is saved.
//
// Input reaches the function from a phone, so every prompt takes only what it expects, cut to a
// sensible size: text a person could not have typed in the app does not reach Claude.

import { jsonIn } from './planReading';
import { TITLE_MAX } from './rules';
import { suggestPrompt, type SuggestContext } from './suggest';
import { tidyTitle } from './titles';
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

// ---------- the tasks ----------

export type ClaudeTask = 'fill-in' | 'say-it' | 'same-item' | 'duplicates' | 'standard-title';

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
