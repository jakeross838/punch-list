// Reading the plans to set up a job. Claude reads the floor plans (a PDF, pictures of the sheets, or
// on the preview the text of each page) and answers with the job's name and address from the title
// block, each level's rooms in walk order with their numbers, and the areas outside the house. The
// answer is checked and tidied here, then shown for a look before anything is added: new
// locations, and ones typed in on a walk with no number that the plans now give a number and a
// level.

import { floorOf, properCase, roomLabel, SHARED_AREAS, SHARED_GROUP, type ParsedLocation } from './rooms';
import type { Job, Location, LocationKind } from './types';

export interface PlanRoom {
  name: string;
  /** The room number on the plans, "109" or "2A"; null when it has none. */
  number: string | null;
}

export interface PlanLevel {
  name: string;
  /** In the order to walk them. */
  rooms: PlanRoom[];
}

export interface PlanReading {
  /** The job's name from the title block, "Smith Residence". */
  name: string | null;
  /** The house's street address from the title block. */
  address: string | null;
  /** From the lowest up. */
  levels: PlanLevel[];
  /** The outside and whole house areas the job has, in order: the standard ones it has, then any others. */
  outside: string[];
  /** Anything Claude could not read or was unsure of, in a sentence. */
  notes: string | null;
}

/** The most the plans add at once: a big house, with room to spare. */
const MOST_LEVELS = 12;
const MOST_ROOMS = 300;
const MOST_OUTSIDE = 10;

/** Every house has these, whatever the plans show. */
const ALWAYS_OUTSIDE = new Set(['north elevation', 'south elevation', 'east elevation', 'west elevation', 'roof', 'site', 'whole house']);

const EXAMPLE = {
  name: 'Smith Residence',
  address: '123 Gulf Drive, Holmes Beach, Florida 34217',
  levels: [
    {
      name: 'Level 1',
      rooms: [
        { name: 'Garage', number: '101' },
        { name: 'Foyer', number: '102' },
        { name: 'Powder', number: '103' },
      ],
    },
    {
      name: 'Level 2',
      rooms: [
        { name: 'Master Bedroom', number: '201' },
        { name: 'Master Closet', number: null },
      ],
    },
  ],
  outside: ['Pool', 'Driveway', 'Dock'],
  notes: null,
};

/**
 * What Claude is asked. levels: the job's level names already, to keep using. text: the plans as
 * text with where each piece sits, when Claude cannot be given the files themselves (the preview).
 */
export function planPrompt(options: { levels?: string[]; text?: string } = {}): string {
  const levels = (options.levels ?? []).filter((l) => l.trim() !== '');
  const lines = [
    "These are the plans for a house being built. Read them to set up the job's punch list: the job's name and address, and every location to walk on each level.",
    options.text
      ? 'The plans are below as the text on each page. Each line gives where the text sits on the page, across and then down from the top left corner, from 0 to 1000, then the text.'
      : 'The plans are attached.',
    '',
    "Find the floor plans: the sheets titled like First Floor Plan, Level 2 Plan or Ground Floor Plan. Read each room's name and number from its room tag. Sheets that show a floor again for another trade (electrical, framing, lighting, finishes) can fill in a name the floor plan leaves out, but they are not more rooms.",
    '',
    'Rules:',
    '- Every room, closet, bath, hall, stair, porch, lanai and balcony on each level, and the garage.',
    '- Write each name out in full with normal capitalization, the way someone on site would say it: Master Bath, not M. BATH; Walk In Closet, not W.I.C.',
    '- Every name is different from every other room in the house. When the plans repeat a name without a number (Closet, Bath), name it for the room it opens off: Master Closet, Bedroom 2 Closet, Hall Bath.',
    '- The room number exactly as the plans give it (101, 2A, 204B), or null when the room has none.',
    "- Each level's rooms in the order you would walk them: from the front door or the top of the stair, room to room, each closet and bath right after the room it opens off. The room numbers usually give that order.",
    `- Levels from the lowest up, named the way the plans name them and written out: Ground Level, Level 1, Second Floor, Roof Deck.${
      levels.length > 0 ? ` The job already has these levels: ${levels.join(', ')}. Use those names for the same levels.` : ''
    }`,
    '- outside: Pool and Driveway, unless a site plan shows the house has none, then anything else outside the house that the plans show, like Dock, Spa or Fence. The elevations, the roof, the site and the whole house are already on every job.',
    "- name: the job's name from the title block, like Smith Residence, or null. address: the house's street address from the title block, in one line, not the architect's, or null.",
    '- notes: a short sentence on anything you could not read or are unsure of, or null.',
    '',
    'Reply with only JSON, like:',
    JSON.stringify(EXAMPLE),
  ];
  if (options.text) lines.push('', 'The plans:', options.text);
  return lines.join('\n');
}

/** The first JSON object in a reply, read tolerantly: the whole reply, a fenced block, or from the first { to the last }. */
export function jsonIn(text: string): unknown {
  const tries = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? '', text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const t of tries) {
    if (t.trim() === '') continue;
    try {
      return JSON.parse(t);
    } catch {
      // Try the next way of reading it.
    }
  }
  return null;
}

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Text from the answer, on one line, cut to a sensible length; null when there is none. */
function line(v: unknown, most: number): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (s === '' || /^(null|none|n\/a|unknown)$/i.test(s)) return null;
  return s.slice(0, most).trim();
}

/** A name in capitals from a title block reads in proper capitalization; short ones like ODK stay. */
function named(s: string): string {
  const shouting = s === s.toUpperCase() && /[A-Z]{4,}/.test(s);
  return properCase(shouting ? s.toLowerCase() : s);
}

const NUMBER = /^[0-9A-Z][0-9A-Z.-]{0,7}$/;
const NUMBER_AT_END = /^(.*[A-Za-z].*?)[\s,-]+(\d{1,4}[A-Za-z]?)$/;

function room(v: unknown): PlanRoom | null {
  const r = record(v);
  let name = line(typeof v === 'string' ? v : r?.name ?? r?.room ?? r?.label, 60);
  let number = line(r?.number ?? r?.no ?? r?.roomNumber, 8)?.toUpperCase() ?? null;
  if (!name) return null;
  if (number && !NUMBER.test(number)) number = null;
  // "Kitchen 109" given as the name alone.
  const end = number ? null : name.match(NUMBER_AT_END);
  if (end) {
    name = end[1]!.trim();
    number = end[2]!.toUpperCase();
  }
  if (!/[A-Za-z]/.test(name)) return null;
  return { name: named(name), number };
}

/** Claude's answer, checked and tidied; null when it holds nothing to use. */
export function readPlanAnswer(raw: unknown): PlanReading | null {
  const o = record(typeof raw === 'string' ? jsonIn(raw) : raw);
  if (!o) return null;
  const levelsIn = Array.isArray(o.levels) ? o.levels : Array.isArray(o.floors) ? o.floors : [];
  const levels: PlanLevel[] = [];
  let count = 0;
  for (const [i, v] of levelsIn.entries()) {
    const l = record(v);
    if (!l) continue;
    const roomsIn = Array.isArray(l.rooms) ? l.rooms : Array.isArray(l.locations) ? l.locations : [];
    const title = named(line(l.name ?? l.level ?? l.floor, 40) ?? `Level ${i + 1}`);
    const rooms = roomsIn.map(room).filter((r): r is PlanRoom => r !== null);
    if (rooms.length === 0) continue;
    const kept = rooms.slice(0, Math.max(0, MOST_ROOMS - count));
    count += kept.length;
    // The same level twice is one level.
    const same = levels.find((x) => x.name.toLowerCase() === title.toLowerCase());
    if (same) same.rooms.push(...kept);
    else if (levels.length < MOST_LEVELS && kept.length > 0) levels.push({ name: title, rooms: kept });
  }
  const name = line(o.name ?? o.job ?? o.project, 80);
  const address = line(o.address, 120);
  const notes = line(o.notes, 240);
  const outside = outsideAreas(Array.isArray(o.outside) ? o.outside : null);
  if (levels.length === 0 && !name && !address) return null;
  return { name: name ? named(name) : null, address, levels, outside, notes };
}

/**
 * The outside and whole house areas for the job: the standard ones (Pool and Driveway only when the
 * answer has them, or says nothing about outside), then any others it names.
 */
export function outsideAreas(answer: unknown[] | null): string[] {
  const given = (answer ?? []).map((v) => line(typeof v === 'string' ? v : record(v)?.name, 40)).filter((v): v is string => v !== null);
  const has = new Set(given.map((g) => g.toLowerCase()));
  const standard = SHARED_AREAS.filter((a) => answer === null || ALWAYS_OUTSIDE.has(a.toLowerCase()) || has.has(a.toLowerCase()));
  const known = new Set<string>(SHARED_AREAS.map((a) => a.toLowerCase()));
  const others: string[] = [];
  for (const g of given) {
    const tidy = named(g);
    const key = tidy.toLowerCase();
    if (known.has(key) || key === SHARED_GROUP.toLowerCase() || !/[A-Za-z]/.test(tidy)) continue;
    known.add(key);
    if (others.length < MOST_OUTSIDE) others.push(tidy);
  }
  return [...standard, ...others];
}

/** One location the plans would add, or the one on the job it is. */
export interface PlanLocation extends ParsedLocation {
  /** The location on the job this one is: the same name and number, or the same name typed in with no number. */
  existing: { id: string; label: string; floor: string | null; kind: LocationKind } | null;
}

export type PlanChange = 'new' | 'update' | 'same';

/** What adding a read location does: a new location, one on the job filled in, or nothing because it is there as it is. */
export function planChange(p: PlanLocation): PlanChange {
  if (!p.existing) return 'new';
  return p.existing.label === p.label && floorOf(p.existing) === floorOf(p) ? 'same' : 'update';
}

type OnJob = Pick<Location, 'id' | 'label' | 'name' | 'number' | 'floor' | 'kind' | 'active'>;

/**
 * Everything the reading would put on the job, in walk order: each level's rooms, then the outside
 * and whole house areas. A name the plans repeat is told apart by its level (Level 2 Closet). Each
 * is matched to the location on the job it is.
 */
export function planLocations(reading: PlanReading, onJob: OnJob[]): PlanLocation[] {
  const live = onJob.filter((l) => l.active);
  const byLabel = new Map(live.map((l) => [l.label.toLowerCase(), l]));
  // Typed in on a walk with no number: the plans' room of that name is the same room.
  const byName = new Map<string, OnJob>();
  for (const l of live) if (!l.number && !byName.has(l.name.toLowerCase())) byName.set(l.name.toLowerCase(), l);
  // A name removed from the job before comes back as itself, so nothing else may take it.
  const removed = new Set(onJob.filter((l) => !l.active).map((l) => l.label.toLowerCase()));
  const seen = new Set<string>();
  const out: PlanLocation[] = [];

  const taken = (name: string, number: string | null) => seen.has(roomLabel(name, number).toLowerCase());
  const add = (given: string, number: string | null, floor: string | null, kind: LocationKind) => {
    // An area outside that is also a room on a level is that room.
    if (kind === 'shared' && taken(given, number)) return;
    const base = taken(given, number) && floor ? `${floor} ${given}` : given;
    let name = base;
    for (let n = 2; taken(name, number); n += 1) name = `${base} ${n}`;
    const label = roomLabel(name, number);
    seen.add(label.toLowerCase());
    out.push({ name, number, label, floor: kind === 'shared' ? null : floor, kind, sortOrder: out.length + 1, existing: null });
  };
  for (const level of reading.levels) for (const r of level.rooms) add(r.name, r.number, level.name, 'room');
  for (const area of reading.outside) add(area, null, null, 'shared');

  // The same name and number first, then a name typed in with no number.
  const used = new Set<string>();
  const match = (p: PlanLocation, l: OnJob | undefined) => {
    if (!l || used.has(l.id) || p.existing) return;
    used.add(l.id);
    p.existing = { id: l.id, label: l.label, floor: l.floor, kind: l.kind };
  };
  for (const p of out) match(p, byLabel.get(p.label.toLowerCase()));
  for (const p of out) {
    const l = byName.get(p.name.toLowerCase());
    if (l && l.kind === p.kind && !removed.has(p.label.toLowerCase())) match(p, l);
  }
  return out;
}

/** The job's name and address from the title block, where they say something the job does not. */
export function planJobFields(reading: Pick<PlanReading, 'name' | 'address'>, job: Pick<Job, 'name' | 'address'>): { name: string | null; address: string | null } {
  const differs = (a: string | null, b: string) => (a && a.toLowerCase().replace(/\W/g, '') !== b.toLowerCase().replace(/\W/g, '') ? a : null);
  return { name: differs(reading.name, job.name), address: differs(reading.address, job.address) };
}

/**
 * What is new to a list placed among what was there: each right after the one before it in the
 * plans, or ahead of the first that was there already; the rest kept as they were. When nothing
 * read was there already, the plans' order comes first.
 */
function merged(had: string[], read: string[]): string[] {
  const anchor = read.find((r) => had.includes(r));
  if (anchor === undefined) return [...read, ...had.filter((h) => !read.includes(h))];
  const out = [...had];
  let last = -1;
  for (const x of read) {
    const at = out.indexOf(x);
    if (at >= 0) {
      last = at;
      continue;
    }
    const next = last >= 0 ? last + 1 : out.indexOf(anchor);
    out.splice(next, 0, x);
    last = next;
  }
  return out;
}

type Ordered = Pick<Location, 'id' | 'kind' | 'floor' | 'sortOrder'>;

/**
 * The walk order once the plans are read. before: the job's locations as they were; after: the same
 * with the plans' changes and new ones; read: the plans' locations in their walk order. The levels
 * and the locations on each keep the order they had, with the plans' new ones placed among them by
 * the plans' order (all in the plans' order on a level that is new), and the outside and whole
 * house areas last.
 */
export function readingOrder<T extends Ordered>(before: Ordered[], after: T[], read: string[]): T[] {
  const groupOf = (l: Pick<Location, 'kind' | 'floor'>) => `${l.kind === 'shared' ? 's' : 'r'}:${floorOf(l).toLowerCase()}`;
  const now = new Map(after.map((l) => [l.id, l]));
  const add = (m: Map<string, string[]>, key: string, id: string) => m.set(key, [...(m.get(key) ?? []), id]);
  // Each level as it was, with only what is still on it, and what the plans put on it.
  const had = new Map<string, string[]>();
  for (const l of [...before].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const n = now.get(l.id);
    if (n && groupOf(n) === groupOf(l)) add(had, groupOf(l), l.id);
  }
  const fromPlans = new Map<string, string[]>();
  for (const id of read) {
    const n = now.get(id);
    if (n && !fromPlans.get(groupOf(n))?.includes(id)) add(fromPlans, groupOf(n), id);
  }
  const levelsHad = [...new Set([...before].sort((a, b) => a.sortOrder - b.sortOrder).map(groupOf))].filter((g) => had.has(g));
  const levelsRead = [...new Set(read.flatMap((id) => (now.has(id) ? [groupOf(now.get(id)!)] : [])))];
  const levels = merged(levelsHad, levelsRead);
  for (const l of [...after].sort((a, b) => a.sortOrder - b.sortOrder)) if (!levels.includes(groupOf(l))) levels.push(groupOf(l));
  const out: T[] = [];
  for (const g of [...levels.filter((k) => k.startsWith('r:')), ...levels.filter((k) => k.startsWith('s:'))]) {
    const ids = merged(had.get(g) ?? [], fromPlans.get(g) ?? []);
    const rest = after.filter((l) => groupOf(l) === g && !ids.includes(l.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    out.push(...ids.map((id) => now.get(id)!), ...rest);
  }
  return out;
}

// ---------- the plans as text, for the preview ----------

/** One page of a PDF as its pieces of text, where each sits (from the top left) and how big. */
export interface PageText {
  width: number;
  height: number;
  items: { text: string; x: number; y: number; width: number; size: number }[];
}

/** Dimensions, scales and other text that is never a room's name or number. */
const NOISE = [/^\d+'(-?\s*\d+(\s*\d+\/\d+)?")?$/, /^\d+(\s*\d+\/\d+)?"$/, /^\d+\/\d+"?\s*=/, /^\d+\s*x\s*\d+$/i, /^\d{5,}$/, /^[^A-Za-z0-9]+$/];
const FLOOR_PLAN = /\b(floor|level|ground|first|second|third)\b.*\bplan\b|\bplan\b.*\b(level|floor)\b/i;
const OTHER_PLAN = /\b(electrical|framing|foundation|roof plan|reflected|ceiling|lighting|plumbing|mechanical|structural|site plan|landscape|details?|sections?|elevations?|schedule)\b/i;
const ROOM_WORD = /\b(kitchen|bath|bedroom|closet|laundry|garage|foyer|living|dining|pantry|office|study|den|powder|hall|stair|porch|lanai|balcony|master|primary|guest|bunk|media|great room|family|loggia|terrace|mud|utility|storage|entry|deck|elevator)\b/i;

interface Line {
  x: number;
  y: number;
  text: string;
}

/** A page's text as lines: pieces on one baseline joined in reading order, from the top. */
function pageLines(page: PageText): Line[] {
  const items = page.items
    .map((i) => ({ ...i, text: i.text.replace(/\s+/g, ' ').trim() }))
    .filter((i) => i.text !== '')
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: (Line & { end: number; size: number })[] = [];
  for (const i of items) {
    const near = lines.find((l) => Math.abs(l.y - i.y) < Math.max(1, i.size) * 0.4 && i.x >= l.end - i.size * 0.2 && i.x - l.end < i.size * 1.2);
    if (near) {
      near.text = `${near.text}${i.x - near.end > i.size * 0.15 ? ' ' : ''}${i.text}`;
      near.end = i.x + i.width;
    } else lines.push({ x: i.x, y: i.y, text: i.text, end: i.x + i.width, size: i.size });
  }
  return lines.filter((l) => l.text.length <= 80 && !NOISE.some((n) => n.test(l.text)));
}

/**
 * The plans' pages as text for Claude: each line with where it sits, across and down from 0 to
 * 1000. The floor plan pages go first when there is not room for all of them; most is the size in
 * characters.
 */
export function plansAsText(pages: PageText[], most = 200_000): string {
  const read = pages.map((page, i) => {
    const lines = pageLines(page);
    const all = lines.map((l) => l.text).join(' ');
    const rooms = lines.filter((l) => ROOM_WORD.test(l.text)).length;
    const score = rooms + (FLOOR_PLAN.test(all) ? 20 : 0) - (OTHER_PLAN.test(all) && !FLOOR_PLAN.test(all) ? 10 : 0);
    const at = (v: number, of: number) => Math.round((v / Math.max(1, of)) * 1000);
    const inches = (v: number) => Math.round(v / 72);
    const text = [`Page ${i + 1} of ${pages.length} (${inches(page.width)} by ${inches(page.height)} inches)`, ...lines.map((l) => `${at(l.x, page.width)},${at(l.y, page.height)} ${l.text}`)].join('\n');
    return { i, score, text };
  });
  const kept = new Set<number>();
  let size = 0;
  for (const p of [...read].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (size + p.text.length > most) continue;
    kept.add(p.i);
    size += p.text.length + 2;
  }
  return read
    .filter((p) => kept.has(p.i))
    .map((p) => p.text)
    .join('\n\n');
}

// ---------- pictures of the sheets ----------

/** The most Claude reads at full detail in one picture, a side, and how much the pieces overlap. */
export const PLAN_PIECE = 1092;
const OVERLAP = 0.08;

export interface Piece {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A side a little over the size stays one piece: Claude makes it a touch smaller, which loses nothing. */
const WHOLE = 1.2;

/** How long the pieces are along one side, and where they start: evenly from the start to the far end. */
function along(length: number, size: number): { size: number; starts: number[] } {
  if (length <= size * WHOLE) return { size: length, starts: [0] };
  const count = Math.ceil((length - size) / (size * (1 - OVERLAP))) + 1;
  return { size, starts: Array.from({ length: count }, (_, i) => Math.round(((length - size) * i) / (count - 1))) };
}

/**
 * A picture of a plan sheet cut into pieces Claude reads at full detail, in reading order, each
 * overlapping the next a little so no room tag is cut in two. A small picture is one piece.
 */
export function planPieces(width: number, height: number, size = PLAN_PIECE): Piece[] {
  const across = along(width, size);
  const down = along(height, size);
  return down.starts.flatMap((y) => across.starts.map((x) => ({ x, y, width: across.size, height: down.size })));
}

/** What Claude is told about the pictures: each sheet whole, then its pieces. */
export function picturesNote(pieces: number[]): string {
  const sheets = pieces.map((n, i) => (n > 1 ? `Sheet ${i + 1}: the whole sheet, then ${n} pieces of it at full size, left to right and top to bottom, overlapping a little.` : `Sheet ${i + 1}: the whole sheet.`));
  return `The plans are attached as pictures of ${pieces.length === 1 ? 'one sheet' : `${pieces.length} sheets`}, in this order. ${sheets.join(' ')}`;
}
