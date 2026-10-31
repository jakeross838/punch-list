// Common tasks by room: the usual work for each kind of room, to add with a tap on a walk. The kind
// of room comes from the location's name ("Master Bathroom 207" is a bathroom); each standard title
// says which kinds of room it is common in, set in Item Form. In a bathroom that is Trim out
// toilet, Install faucet, Install shower trim and so on, each filling in its company and usual
// time. The ones already on the list in that location show as added.

import type { RoomKind, StandardTitle } from './types';

export const ROOM_KINDS: RoomKind[] = ['bathroom', 'kitchen', 'laundry', 'bedroom', 'closet', 'living', 'garage', 'outside'];

/** Each kind of room as it reads in a heading: "Common in Bathrooms". */
export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  bathroom: 'Bathrooms',
  kitchen: 'Kitchens',
  laundry: 'Laundry Rooms',
  bedroom: 'Bedrooms',
  closet: 'Closets and Pantries',
  living: 'Living Areas and Halls',
  garage: 'Garages',
  outside: 'Outside',
};

/** The words in a location's name that say its kind, the most telling first: a pool bath is a bathroom. */
const WORDS: [RoomKind, RegExp][] = [
  ['bathroom', /\b(bath|baths|bathroom|bathrooms|powder|restroom|wc)\b/],
  ['closet', /\b(closet|closets|wic|pantry|storage|linen)\b/],
  ['laundry', /\b(laundry|utility|mudroom|mud room)\b/],
  ['kitchen', /\b(kitchen|kitchenette|scullery)\b/],
  ['bedroom', /\b(bed|bedroom|bedrooms|bunk|bunkroom|nursery|suite)\b/],
  ['garage', /\b(garage|carport)\b/],
  ['outside', /\b(exterior|outside|porch|deck|patio|lanai|balcony|pool|yard|driveway|roof|dock|courtyard|entry stair|front steps)\b/],
  ['living', /\b(living|family|great|den|office|study|dining|foyer|entry|hall|hallway|stair|stairs|loft|media|gym|bonus|game|bar|library|sitting|breakfast|room)\b/],
];

/** The kind of room a location is, from its name, or null when the name does not say. */
export function roomKind(label: string): RoomKind | null {
  const name = label.toLowerCase();
  for (const [kind, words] of WORDS) if (words.test(name)) return kind;
  return null;
}

/** The common tasks for a kind of room: the standard titles marked for it, the most used first. */
export function roomTasks(kind: RoomKind, titles: StandardTitle[]): StandardTitle[] {
  return titles
    .filter((t) => t.approved && t.rooms.includes(kind))
    .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title));
}

/**
 * Where the usual work is common, by title, to start a title library with (the database marks the
 * same titles when they are already in it).
 */
export const DEFAULT_ROOM_TASKS: Record<string, RoomKind[]> = {
  'trim out toilet': ['bathroom'],
  'install toilet': ['bathroom'],
  'install faucet': ['bathroom', 'kitchen', 'laundry'],
  'install shower trim': ['bathroom'],
  'install shower head': ['bathroom'],
  'install shower glass': ['bathroom'],
  'install towel bar': ['bathroom'],
  'install toilet paper holder': ['bathroom'],
  'install mirror': ['bathroom'],
  'caulk tub surround': ['bathroom'],
  'caulk shower corner': ['bathroom'],
  'set vanity tops': ['bathroom'],
  'install cabinet hardware': ['bathroom', 'kitchen', 'laundry'],
  'adjust cabinet door': ['kitchen', 'bathroom'],
  'install backsplash': ['kitchen'],
  'seal countertop': ['kitchen'],
  'install pendant lights': ['kitchen'],
  'install appliances': ['kitchen'],
  'install dryer vent cover': ['laundry'],
  'install shelving': ['laundry', 'closet', 'garage'],
  'install closet system': ['closet'],
  'adjust closet door': ['closet', 'bedroom'],
  'install door stop': ['bedroom', 'closet', 'living'],
  'install light fixture': ['bedroom', 'closet', 'living', 'garage', 'outside', 'laundry'],
  'install outlet cover': ['bedroom', 'living', 'kitchen', 'garage', 'outside'],
  'install switch plate': ['bedroom', 'living', 'kitchen'],
  'install smoke detector': ['bedroom', 'living'],
  'install baseboard': ['bedroom', 'living'],
  'touch up paint': ['bedroom', 'living', 'outside'],
  'install garage door opener': ['garage'],
  'install hose bib': ['outside'],
  'clean windows': ['outside'],
};

/** The kinds of room a title is common in, tidied: each once, in the usual order. */
export function tidyRooms(rooms: unknown): RoomKind[] {
  const list = Array.isArray(rooms) ? rooms : [];
  return ROOM_KINDS.filter((k) => list.includes(k));
}
