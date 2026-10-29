// Job setup: a room list pasted from the plans, in floor order, becomes the job's locations.
//
//   Level 1:            a line ending in a colon names the floor for the rooms below it
//   Garage 101
//   109 Kitchen         the number can come first or last
//   - Screened Patio    bullets and list numbering are ignored; no number is fine
//
// The shared areas are added after the rooms on every job.

import type { LocationKind } from './types.js';

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
        floor = tidyName(line.slice(0, -1));
        return;
      }
      const last = line.match(NUMBER_LAST);
      const first = last ? null : line.match(NUMBER_FIRST);
      const rawName = last ? last[1]! : first ? first[2]! : line;
      const number = last ? last[2]!.toUpperCase() : first ? first[1]!.toUpperCase() : null;
      if (!/[A-Za-z]/.test(rawName)) {
        problems.push(`Line ${lineNo}: "${raw.trim()}" has no room name`);
        return;
      }
      const name = tidyName(rawName);
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

function cleanLine(raw: string): string {
  return raw
    .trim()
    .replace(/^[•*–—-]\s*/, '')
    .replace(/^\d{1,3}[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Proper capitalization: each word capitalized except small joining words; words in capitals stay. */
function tidyName(name: string): string {
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
