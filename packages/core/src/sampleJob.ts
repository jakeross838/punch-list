// The Sample Job: a whole job to try everything on, added from the Jobs screen. Two levels of
// locations and the areas outside, sample companies, items in every state (ready, waiting on the
// owner or on other work, a priority, a draft, one done, some with times), photos with marks,
// comments, and the first floor's plan with items pinned on it.
//
// Its companies are named Sample Plumbing and so on, with no email or phone, so nothing from the
// Sample Job can reach a real company. The photos and the plan are drawn, not photographed, so
// nobody mistakes them for a real job.

import type { ItemKind, Mark } from './types';

/** The drawn photos the app carries for the Sample Job. */
export const SAMPLE_PHOTOS = ['range-wall', 'range-open', 'tub-corner', 'outlet', 'closet-door', 'laundry', 'tv-wall', 'vanity', 'shower-valve', 'plan-level-1'] as const;
export type SamplePhotoName = (typeof SAMPLE_PHOTOS)[number];

export interface SampleCompany {
  name: string;
  /** One of the trades every company starts with. */
  trade: string;
}

export interface SampleItem {
  /** Ties one item's wait to another's. */
  key: string;
  location: string;
  title: string;
  description: string;
  /** A sample company's name, or null when it is for the person adding the job. */
  company: string | null;
  kind?: ItemKind;
  poOrCo?: string;
  /** Not ready: waiting on the owner, or on the builder itself. */
  waitingOn?: ('owner' | 'builder')[];
  /** Not ready: waiting on another item, by its key. */
  waitsOn?: string;
  /** Ready by, this many days from today. */
  readyInDays?: number;
  hours?: number;
  priority?: boolean;
  /** Completed already. */
  done?: boolean;
  /** A photo saved on a walk and not filled in yet. */
  draft?: boolean;
  photo?: { name: SamplePhotoName; marks: Mark[] };
  comments?: { body: string; internal: boolean }[];
  /** Where it is on the first floor's plan, from 0 to 1 across and down. */
  pin?: [number, number];
}

export const SAMPLE_JOB = {
  name: 'Sample Job',
  address: 'A job to try things on. Delete it any time.',
  rooms: [
    'Level 1:',
    'Living 107',
    'Kitchen 109',
    'Guest Bedroom 114',
    'Foyer 115',
    'Bathroom 116',
    'Laundry 119',
    'Level 2:',
    'Master Bedroom 206',
    'Master Bathroom 207',
  ].join('\n'),
  companies: [
    { name: 'Sample Plumbing', trade: 'Plumbing' },
    { name: 'Sample Electric', trade: 'Electrical' },
    { name: 'Sample Air Conditioning', trade: 'HVAC' },
    { name: 'Sample Carpentry', trade: 'Trim Carpentry' },
    { name: 'Sample Cabinets', trade: 'Cabinets' },
    { name: 'Sample Stone', trade: 'Countertops' },
    { name: 'Sample Tile', trade: 'Tile' },
    { name: 'Sample Painting', trade: 'Painting' },
    { name: 'Sample Cleaning', trade: 'Cleaning' },
  ] satisfies SampleCompany[],
  plan: { floor: 'Level 1', name: 'Level 1 Floor Plan', photo: 'plan-level-1' as SamplePhotoName },
  items: [
    // The work other work waits on comes first, so the waits point at items already there.
    { key: 'backsplash', location: 'Kitchen 109', title: 'Install range backsplash', description: 'Full height slab behind the range.', company: 'Sample Stone', hours: 4, priority: true, pin: [0.5, 0.16] },
    {
      key: 'uppers',
      location: 'Kitchen 109',
      title: 'Set upper cabinets',
      description: 'Range wall, both sides of the hood.',
      company: 'Sample Cabinets',
      waitsOn: 'backsplash',
      hours: 4,
      photo: {
        name: 'range-open',
        marks: [
          { tool: 'number', color: 'red', at: [0.19, 0.28], n: 1 },
          { tool: 'number', color: 'red', at: [0.81, 0.28], n: 2 },
        ],
      },
    },
    { key: 'pendants', location: 'Kitchen 109', title: 'Install pendant lights', description: 'Over the island, three fixtures.', company: 'Sample Electric', waitingOn: ['owner'], hours: 3, pin: [0.52, 0.32] },
    { key: 'paint-hood', location: 'Kitchen 109', title: 'Touch up paint', description: 'Ceiling at the hood soffit.', company: 'Sample Painting', kind: 'deficiency', hours: 0.5 },
    {
      key: 'cabinet-door',
      location: 'Kitchen 109',
      title: 'Adjust cabinet door',
      description: 'Upper cabinet left of the hood. The right door rubs the hood.',
      company: 'Sample Cabinets',
      kind: 'deficiency',
      hours: 0.5,
      photo: {
        name: 'range-wall',
        marks: [
          { tool: 'circle', color: 'red', from: [0.24, 0.11], to: [0.37, 0.46] },
          { tool: 'text', color: 'red', at: [0.52, 0.6], text: 'Rubs the hood', to: [0.34, 0.3] },
        ],
      },
      comments: [
        { body: 'Bring two soft close hinges for this door.', internal: false },
        { body: 'The owner pointed this one out on the walk.', internal: true },
      ],
      pin: [0.6, 0.12],
    },
    { key: 'hardware', location: 'Kitchen 109', title: 'Install cabinet hardware', description: 'Island and the pantry wall.', company: 'Sample Cabinets', hours: 2 },
    { key: 'kitchen-draft', location: 'Kitchen 109', title: '', description: '', company: null, draft: true, photo: { name: 'range-wall', marks: [] } },
    {
      key: 'drywall',
      location: 'Living 107',
      title: 'Patch drywall',
      description: 'Behind the television mount, two screw holes, numbered on the photo.',
      company: 'Sample Painting',
      kind: 'deficiency',
      hours: 1,
      photo: {
        name: 'tv-wall',
        marks: [
          { tool: 'number', color: 'red', at: [0.826, 0.41], n: 1 },
          { tool: 'number', color: 'red', at: [0.867, 0.473], n: 2 },
        ],
      },
      pin: [0.22, 0.24],
    },
    { key: 'shoe', location: 'Living 107', title: 'Install shoe molding', description: 'Along the stone hearth.', company: 'Sample Carpentry', hours: 1.5 },
    { key: 'fridge', location: 'Living 107', title: 'Install refrigerator drawers', description: 'Bar under the stair.', company: null, kind: 'added_scope', hours: 2 },
    {
      key: 'outlet',
      location: 'Guest Bedroom 114',
      title: 'Replace outlet cover',
      description: 'North wall, right of the window.',
      company: 'Sample Electric',
      kind: 'deficiency',
      hours: 0.25,
      photo: { name: 'outlet', marks: [{ tool: 'text', color: 'red', at: [0.74, 0.56], text: 'No cover', to: [0.62, 0.76] }] },
      pin: [0.8, 0.2],
    },
    { key: 'door-stop', location: 'Guest Bedroom 114', title: 'Install door stop', description: 'Behind the bedroom door.', company: 'Sample Carpentry', hours: 0.25 },
    { key: 'front-door', location: 'Foyer 115', title: 'Hang front door', description: 'Pivot door at the entry. Set the hardware after paint.', company: 'Sample Carpentry', waitingOn: ['owner'], readyInDays: 3, hours: 2 },
    { key: 'trim', location: 'Foyer 115', title: 'Replace damaged trim', description: 'Door casing dented at the closet.', company: 'Sample Carpentry', kind: 'deficiency', hours: 1 },
    { key: 'toilet', location: 'Bathroom 116', title: 'Install toilet', description: 'Toilet room, left of the vanity.', company: 'Sample Plumbing', hours: 2 },
    {
      key: 'caulk',
      location: 'Bathroom 116',
      title: 'Caulk tub surround',
      description: 'Corner at the shower valve wall.',
      company: 'Sample Tile',
      kind: 'deficiency',
      hours: 1,
      photo: { name: 'tub-corner', marks: [{ tool: 'circle', color: 'red', from: [0.6, 0.58], to: [0.9, 0.7] }] },
      pin: [0.16, 0.8],
    },
    { key: 'grout', location: 'Bathroom 116', title: 'Grout shower floor', description: '', company: 'Sample Tile', hours: 3, done: true },
    { key: 'towel-bar', location: 'Bathroom 116', title: 'Order towel bar', description: 'The one picked for this bath never came.', company: null },
    {
      key: 'baseboard',
      location: 'Laundry 119',
      title: 'Install baseboard',
      description: 'Both long walls.',
      company: 'Sample Carpentry',
      hours: 2,
      photo: { name: 'laundry', marks: [{ tool: 'box', color: 'red', from: [0.01, 0.865], to: [0.99, 0.915] }] },
      pin: [0.8, 0.82],
    },
    {
      key: 'vent',
      location: 'Laundry 119',
      title: 'Install dryer vent cover',
      description: 'Exterior wall above the dryer.',
      company: 'Sample Air Conditioning',
      hours: 0.5,
      photo: { name: 'laundry', marks: [{ tool: 'circle', color: 'red', from: [0.67, 0.23], to: [0.83, 0.35] }] },
    },
    {
      key: 'closet-door',
      location: 'Master Bedroom 206',
      title: 'Adjust closet door',
      description: 'Left door drags on the carpet.',
      company: 'Sample Carpentry',
      kind: 'deficiency',
      hours: 0.5,
      photo: { name: 'closet-door', marks: [{ tool: 'text', color: 'red', at: [0.56, 0.78], text: 'Drags on the carpet', to: [0.3, 0.875] }] },
    },
    { key: 'closet-system', location: 'Master Bedroom 206', title: 'Install closet system', description: 'Walk in closet, both long walls.', company: 'Sample Carpentry', kind: 'added_scope', poOrCo: 'CO 14', hours: 6 },
    { key: 'pocket-hardware', location: 'Master Bathroom 207', title: 'Install pocket door hardware', description: 'Both pocket doors.', company: 'Sample Carpentry', hours: 1 },
    { key: 'pocket-paint', location: 'Master Bathroom 207', title: 'Paint pocket doors', description: 'Both doors, after the hardware.', company: 'Sample Painting', waitsOn: 'pocket-hardware', hours: 3 },
    {
      key: 'vanity',
      location: 'Master Bathroom 207',
      title: 'Set vanity tops',
      description: 'Double vanity, east wall.',
      company: 'Sample Stone',
      waitingOn: ['owner'],
      readyInDays: 2,
      hours: 4,
      photo: { name: 'vanity', marks: [{ tool: 'measure', color: 'red', from: [0.1, 0.5], to: [0.9, 0.5], text: '60 inches' }] },
    },
    {
      key: 'shower-trim',
      location: 'Master Bathroom 207',
      title: 'Install shower trim',
      description: 'Valve trim and the hand shower.',
      company: 'Sample Plumbing',
      hours: 1.5,
      photo: { name: 'shower-valve', marks: [{ tool: 'circle', color: 'red', from: [0.36, 0.38], to: [0.64, 0.6] }] },
    },
    { key: 'thermostats', location: 'Whole House', title: 'Mount thermostats', description: 'All zones, at the end of the job.', company: 'Sample Air Conditioning', waitingOn: ['builder'], hours: 2 },
    { key: 'final-clean', location: 'Whole House', title: 'Final clean', description: 'Every room, windows inside and out.', company: 'Sample Cleaning', hours: 8 },
  ] satisfies SampleItem[] as SampleItem[],
};

/** The sample companies' trades, each once, in the order they first come up. */
export function sampleTrades(): string[] {
  return [...new Set(SAMPLE_JOB.companies.map((c) => c.trade))];
}

/** A name for the new Sample Job not taken by another job: Sample Job, then Sample Job 2, and so on. */
export function sampleJobName(taken: string[]): string {
  const names = new Set(taken.map((n) => n.trim().toLowerCase()));
  if (!names.has(SAMPLE_JOB.name.toLowerCase())) return SAMPLE_JOB.name;
  for (let n = 2; ; n += 1) if (!names.has(`${SAMPLE_JOB.name} ${n}`.toLowerCase())) return `${SAMPLE_JOB.name} ${n}`;
}
