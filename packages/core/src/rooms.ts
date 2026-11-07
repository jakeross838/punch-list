// Job setup: a room list pasted from the plans, in floor order, becomes the job's locations.
//
//   Level 1:            a line ending in a colon names the floor for the rooms below it
//   Garage 101
//   109 Kitchen         the number can come first or last
//   - Screened Patio    bullets and list numbering are ignored; no number is fine
//
// The shared areas are added after the rooms on every job.

import type { Location, LocationKind } from './types';

export const SHARED_AREAS = [
  'North Elevation',
  'South Elevation',
  'East Elevation',
  'West Elevation',
  'Roof',
  'Pool',
  'Driveway',
  'Site',
  'Whole House',
] as const;

/** One of the areas every job has besides its rooms. */
export type SharedArea = (typeof SHARED_AREAS)[number];

export interface ParsedLocation {
  name: string;
  number: string | null;
  label: string;
  floor: string | null;
  kind: LocationKind;
  sortOrder: number;
}

export interface RoomListResult {
  locations: ParsedLocation[];
  /** Lines that need a look, by line number, in plain words. */
  problems: string[];
}

const NUMBER_LAST = /^(.*[A-Za-z].*?)[\s,-]+(\d{1,4}[A-Za-z]?)$/;
const NUMBER_FIRST = /^(\d{2,4}[A-Za-z]?)[\s,-]+(.*[A-Za-z].*)$/;
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

export function roomLabel(name: string, number: string | null): string {
  return number ? `${name} ${number}` : name;
}

export function parseRoomList(text: string, options: { includeShared?: boolean } = {}): RoomListResult {
  const includeShared = options.includeShared ?? true;
  const locations: ParsedLocation[] = [];
  const problems: string[] = [];
  const seen = new Map<string, number>();
  let floor: string | null = null;

  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((raw, index) => {
      const lineNo = index + 1;
      const line = cleanLine(raw);
      if (line === '') return;
      if (line.endsWith(':')) {
        floor = properCase(line.slice(0, -1));
        return;
      }
      const last = line.match(NUMBER_LAST);
      const first = last ? null : line.match(NUMBER_FIRST);
      const rawName = last ? last[1]! : first ? first[2]! : line;
      const number = last ? last[2]!.toUpperCase() : first ? first[1]!.toUpperCase() : null;
      if (!/[A-Za-z]/.test(rawName)) {
        problems.push(`Line ${lineNo}: "${raw.trim()}" has no name`);
        return;
      }
      const name = properCase(rawName);
      const label = roomLabel(name, number);
      const key = label.toLowerCase();
      const firstSeen = seen.get(key);
      if (firstSeen !== undefined) {
        problems.push(`Line ${lineNo}: "${label}" is already on line ${firstSeen}`);
        return;
      }
      seen.set(key, lineNo);
      locations.push({ name, number, label, floor, kind: 'room', sortOrder: locations.length + 1 });
    });

  if (includeShared) {
    for (const name of SHARED_AREAS) {
      if (seen.has(name.toLowerCase())) continue;
      locations.push({ name, number: null, label: name, floor: null, kind: 'shared', sortOrder: locations.length + 1 });
    }
  }
  return { locations, problems };
}

/**
 * A location's new name, typed like a line of the pasted list ("Kitchen 109" or "109 Kitchen"), or
 * why it cannot be used. The level and the order stay as they are.
 */
export function renameLocation(
  text: string,
  id: string,
  locations: Pick<Location, 'id' | 'label' | 'active'>[],
): { name: string; number: string | null; label: string } | { problem: string } {
  const line = text.replace(/\s+/g, ' ').trim().replace(/:$/, '');
  const parsed = parseRoomList(line, { includeShared: false }).locations[0];
  if (!parsed) return { problem: 'Type a name, like Kitchen 109.' };
  const taken = locations.find((l) => l.id !== id && l.label.toLowerCase() === parsed.label.toLowerCase());
  if (taken?.active) return { problem: `${parsed.label} is already a location on this job.` };
  if (taken) return { problem: `${parsed.label} was removed from this job. Add it again at the end of a level to bring it back.` };
  return { name: parsed.name, number: parsed.number, label: parsed.label };
}

function cleanLine(raw: string): string {
  return raw
    .trim()
    .replace(/^[•*–—-]\s*/, '')
    .replace(/^\d{1,3}[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Proper capitalization: each word capitalized except small joining words; words in capitals stay. */
export function properCase(name: string): string {
  return name
    .trim()
    .split(' ')
    .map((word, i) => {
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** The group for the elevations, roof, pool, driveway, site and Whole House on every job. */
export const SHARED_GROUP = 'Outside and Whole House';
/** The group for locations pasted without a level. */
export const NO_FLOOR = 'Locations';

/** What a location is listed under on the job: its level, Outside and Whole House, or Locations when it has no level. */
export function floorOf(location: Pick<Location, 'kind' | 'floor'>): string {
  return location.kind === 'shared' ? SHARED_GROUP : (location.floor ?? NO_FLOOR);
}

/** A level of the job as Job Setup and the walk show it: its locations in walk order. */
export interface LocationGroup<T> {
  /** The level's name, Outside and Whole House, or Locations for those with no level. */
  name: string;
  /** The outside and whole house areas: always last. */
  shared: boolean;
  locations: T[];
}

type Placed = Pick<Location, 'kind' | 'floor' | 'sortOrder'>;

/**
 * The job's locations by level, in walk order: the levels in the order they first come, each with
 * its locations in order, and the outside and whole house areas last.
 */
export function locationGroups<T extends Placed>(locations: T[]): LocationGroup<T>[] {
  const groups = new Map<string, LocationGroup<T>>();
  for (const l of [...locations].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const shared = l.kind === 'shared';
    // A level that happens to be called Outside and Whole House is still a level.
    const key = `${shared ? 's' : 'r'}:${floorOf(l).toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.locations.push(l);
    else groups.set(key, { name: floorOf(l), shared, locations: [l] });
  }
  const all = [...groups.values()];
  return [...all.filter((g) => !g.shared), ...all.filter((g) => g.shared)];
}

/** The locations in walk order: each one's place, from the first. */
export function inWalkOrder<T extends Placed>(locations: T[]): T[] {
  return locationGroups(locations).flatMap((g) => g.locations);
}

/** The level names on the job, in walk order (Locations for those with no level). */
export function levelNames(locations: Placed[]): string[] {
  return locationGroups(locations)
    .filter((g) => !g.shared)
    .map((g) => g.name);
}

/**
 * The walk order with one level moved up (-1) or down (1) past the level next to it; the outside
 * and whole house areas stay last. Null when it cannot move that way.
 */
export function moveLevel<T extends Placed>(locations: T[], level: string, by: -1 | 1): T[] | null {
  const groups = locationGroups(locations);
  const levels = groups.filter((g) => !g.shared);
  const at = levels.findIndex((g) => g.name.toLowerCase() === level.toLowerCase());
  const to = at + by;
  if (at < 0 || to < 0 || to >= levels.length) return null;
  [levels[at], levels[to]] = [levels[to]!, levels[at]!];
  return [...levels, ...groups.filter((g) => g.shared)].flatMap((g) => g.locations);
}

/**
 * The walk order with one location moved to the end of another level (floor null and kind room
 * for Locations, kind shared for Outside and Whole House). The moved location comes back with its
 * new level.
 */
export function moveToLevel<T extends Placed & { id: string }>(
  locations: T[],
  id: string,
  to: { floor: string | null; kind: LocationKind },
): T[] {
  const last = locations.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 1;
  const floor = to.kind === 'shared' ? null : to.floor;
  return inWalkOrder(locations.map((l) => (l.id === id ? { ...l, floor, kind: to.kind, sortOrder: last } : l)));
}

/** A level's name typed in Job Setup, with proper capitalization, or why it cannot be used. */
export function levelName(text: string, levels: string[], current: string | null = null): { name: string } | { problem: string } {
  const line = text.replace(/\s+/g, ' ').trim().replace(/:$/, '').trim();
  if (!/[A-Za-z0-9]/.test(line)) return { problem: 'Type a name, like Level 2.' };
  const name = properCase(line);
  if (name.toLowerCase() === SHARED_GROUP.toLowerCase()) return { problem: `${SHARED_GROUP} is for the areas outside, not a level.` };
  const taken = levels.find((l) => l.toLowerCase() === name.toLowerCase() && l.toLowerCase() !== (current ?? '').toLowerCase());
  if (taken) return { problem: `${taken} is already a level on this job.` };
  return { name };
}

/**
 * A location typed in at the end of a level in Job Setup: read like a line of the pasted list, or
 * why it cannot be added. One removed from the job before comes back.
 */
export function newLocation(
  text: string,
  locations: Pick<Location, 'id' | 'label' | 'active'>[],
): { name: string; number: string | null; label: string; restore: string | null } | { problem: string } {
  const line = text.replace(/\s+/g, ' ').trim().replace(/:$/, '');
  const parsed = parseRoomList(line, { includeShared: false }).locations[0];
  if (!parsed) return { problem: 'Type a name, like Kitchen 109.' };
  const taken = locations.find((l) => l.label.toLowerCase() === parsed.label.toLowerCase());
  if (taken?.active) return { problem: `${parsed.label} is already a location on this job.` };
  return { name: parsed.name, number: parsed.number, label: parsed.label, restore: taken ? taken.id : null };
}
