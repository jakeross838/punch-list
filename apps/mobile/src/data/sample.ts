// Sample data for the preview link only. Real company names make the screens easy to judge;
// the rooms, items and photos are made up and are not the real Fish list.

import {
  DEFAULT_FORM,
  DEFAULT_VIEW,
  parseRoomList,
  type Company,
  type CustomField,
  type FormSettings,
  type Item,
  type Job,
  type JobCompany,
  type Location,
  type Person,
  type Photo,
  type StandardTitle,
  type Trade,
  type ViewSettings,
} from '@punch/core';
import { RANGE_WALL, RANGE_WALL_NO_UPPERS, SAMPLE_PHOTO_SIZE } from './samplePhotos';

export interface SampleState {
  me: Person;
  jobs: Job[];
  locations: Location[];
  trades: Trade[];
  companies: Company[];
  jobCompanies: JobCompany[];
  waitingOn: Record<string, string[]>;
  items: Item[];
  photos: Photo[];
  titles: StandardTitle[];
  customFields: CustomField[];
  formSettings: FormSettings;
  viewSettings: ViewSettings;
  counters: Record<string, number>;
}

/** The standard titles by trade: a verb and the thing, the same words for the same work everywhere. */
const STANDARD_TITLES: Record<string, [string, number][]> = {
  Carpentry: [
    ['Adjust cabinet door', 14], ['Adjust closet door', 6], ['Adjust door strike', 9], ['Adjust pocket door', 4], ['Hang door', 5],
    ['Install door stop', 8], ['Install baseboard', 7], ['Install shoe molding', 6], ['Install door casing', 5], ['Install cabinet hardware', 11],
    ['Install closet system', 3], ['Set upper cabinets', 4], ['Install crown molding', 3], ['Replace damaged trim', 6],
  ],
  Painting: [['Touch up paint', 40], ['Patch drywall', 25], ['Paint door', 8], ['Caulk trim', 12], ['Paint pocket doors', 3], ['Paint ceiling', 4], ['Repaint wall', 5]],
  Electrical: [
    ['Install outlet cover', 9], ['Replace outlet cover', 5], ['Install switch plate', 7], ['Install pendant lights', 3], ['Install light fixture', 10],
    ['Replace light bulb', 4], ['Install smoke detector', 2],
  ],
  Plumbing: [['Install toilet', 6], ['Install faucet', 8], ['Install shower head', 5], ['Fix leak', 4], ['Install hose bib', 2], ['Adjust shower valve', 3]],
  Tile: [['Grout shower floor', 4], ['Caulk tub surround', 5], ['Replace cracked tile', 6], ['Seal grout', 3], ['Caulk shower corner', 4]],
  Stone: [['Set vanity tops', 3], ['Polish countertop edge', 2], ['Seal countertop', 3], ['Install backsplash', 2]],
  'Air Conditioning': [['Mount thermostats', 3], ['Adjust thermostat', 2], ['Install dryer vent cover', 2], ['Install return grille', 3], ['Install supply register', 4]],
  'Ross Built Crew': [['Clean windows', 5], ['Final clean', 3], ['Install towel bar', 6], ['Install toilet paper holder', 4], ['Install mirror', 3], ['Install refrigerator drawers', 1]],
};

export function sampleState(): SampleState {
  const me: Person = { id: 'person-jake', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true };
  const job: Job = { id: 'job-preview', name: 'Sample Job', address: 'Sample data, not the real Fish list' };

  const tradeNames = ['Plumbing', 'Electrical', 'Painting', 'Tile', 'Carpentry', 'Stone', 'Air Conditioning', 'Ross Built Crew'];
  const trades: Trade[] = tradeNames.map((name, i) => ({ id: `trade-${i}`, name, sortOrder: i + 1 }));
  const t = (name: string) => trades.find((x) => x.name === name)!.id;

  const companyList: [string, string][] = [
    ['Gator Plumbing', 'Plumbing'],
    ['Metro Electric', 'Electrical'],
    ['Triple H Painting', 'Painting'],
    ['Rangel Custom Tile', 'Tile'],
    ['SMS Carpentry', 'Carpentry'],
    ['Volcano Stone', 'Stone'],
    ['Climatic', 'Air Conditioning'],
    ['Ross Built', 'Ross Built Crew'],
  ];
  const companies: Company[] = companyList.map(([name, trade], i) => ({
    id: `company-${i}`,
    name,
    defaultTradeId: t(trade),
    phone: null,
    email: null,
    active: true,
  }));
  const c = (name: string) => companies.find((x) => x.name === name)!.id;
  const jobCompanies: JobCompany[] = companies.map((co) => ({ jobId: job.id, companyId: co.id, tradeId: co.defaultTradeId! }));

  const parsed = parseRoomList(
    [
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
  );
  const locations: Location[] = parsed.locations.map((l, i) => ({ ...l, id: `room-${i}`, jobId: job.id, active: true }));
  const room = (label: string) => locations.find((x) => x.label === label)!.id;

  const at = '2026-10-29T14:00:00.000Z';
  let n = 0;
  const item = (label: string, title: string, description: string, company: string, over: Partial<Item> = {}): Item => {
    n += 1;
    const co = companies.find((x) => x.id === c(company))!;
    return {
      id: `item-${n}`,
      jobId: job.id,
      locationId: room(label),
      number: n,
      title,
      description,
      tradeId: co.defaultTradeId,
      companyId: co.id,
      kind: 'deficiency',
      ready: true,
      waitingOn: [],
      readyBy: null,
      boughtOut: true,
      poOrCo: null,
      status: 'open',
      completedBy: null,
      completedAt: null,
      source: 'typed',
      extra: {},
      btExternalId: null,
      createdBy: me.id,
      createdAt: at,
      updatedAt: at,
      ...over,
    };
  };

  const items: Item[] = [
    item('Kitchen 109', 'Set upper cabinets', 'Range wall, both sides of the hood.', 'SMS Carpentry', { ready: false, waitingOn: ['Volcano Stone'], readyBy: '2026-11-02' }),
    item('Kitchen 109', 'Install pendant lights', 'Over the island, three fixtures.', 'Metro Electric', { ready: false, waitingOn: ['Owner'] }),
    item('Kitchen 109', 'Touch up paint', 'Ceiling at the hood soffit.', 'Triple H Painting'),
    item('Living 107', 'Install refrigerator drawers', 'Bar under the stair.', 'Ross Built', { kind: 'added_scope', boughtOut: false }),
    item('Guest Bedroom 114', 'Replace outlet cover', 'North wall, left of the window.', 'Metro Electric'),
    item('Bathroom 116', 'Install toilet', 'Toilet room, left of the vanity.', 'Gator Plumbing'),
    item('Bathroom 116', 'Grout shower floor', '', 'Rangel Custom Tile', { status: 'complete', completedBy: me.id, completedAt: at }),
    item('Bathroom 116', 'Caulk tub surround', 'Corner at the shower valve wall.', 'Rangel Custom Tile'),
    item('Laundry 119', 'Install dryer vent cover', 'Exterior wall above the washer.', 'Climatic'),
    item('Master Bathroom 207', 'Paint pocket doors', 'Both doors, after the hardware.', 'Triple H Painting', { ready: false, waitingOn: ['SMS Carpentry'] }),
    item('Master Bathroom 207', 'Set vanity tops', 'Double vanity, east wall.', 'Volcano Stone', { ready: false, waitingOn: ['Owner', 'Gator Plumbing'], readyBy: '2026-11-09' }),
    item('Whole House', 'Mount thermostats', 'All zones, at the end of the job.', 'Climatic', { ready: false, waitingOn: ['Ross Built'] }),
    item('Foyer 115', 'Hang front door', 'Pivot door at the entry. Set the hardware after paint.', 'SMS Carpentry', { ready: false, waitingOn: ['Owner'], readyBy: '2026-10-26' }),
    item('Master Bedroom 206', 'Install closet system', 'Walk in closet, both long walls.', 'SMS Carpentry', { kind: 'added_scope', boughtOut: true, poOrCo: 'CO-14' }),
    item('Living 107', 'Patch drywall', 'Behind the television mount, two screw holes.', 'Triple H Painting'),
    item('Kitchen 109', 'Adjust cabinet door', 'Upper cabinet left of the hood. The right door rubs the hood.', 'SMS Carpentry', { source: 'walk' }),
  ];

  const photo = (itemId: string, uri: string, marks: Photo['marks']): Photo => ({
    id: `photo-${itemId}`,
    jobId: job.id,
    itemId,
    uri,
    storagePath: null,
    ...SAMPLE_PHOTO_SIZE,
    marks,
    sortOrder: 1,
    removed: false,
    createdBy: me.id,
    createdAt: at,
  });
  const photos: Photo[] = [
    photo('item-1', RANGE_WALL_NO_UPPERS, []),
    photo('item-16', RANGE_WALL, [
      { tool: 'circle', color: 'red', from: [0.174, 0.092], to: [0.4, 0.469] },
      { tool: 'arrow', color: 'red', from: [0.538, 0.588], to: [0.395, 0.415] },
      { tool: 'text', color: 'red', at: [0.41, 0.642], text: 'Rubs the hood' },
    ]),
  ];

  let titleNo = 0;
  const titles: StandardTitle[] = Object.entries(STANDARD_TITLES).flatMap(([trade, list]) =>
    list.map(([title, uses]) => ({ id: `title-${++titleNo}`, title, tradeId: t(trade), uses, approved: true })),
  );

  const customFields: CustomField[] = [
    { id: 'field-found-by', label: 'Found By', kind: 'list', options: ['Owner', 'Architect', 'Designer', 'Ross Built'], sortOrder: 1, active: true },
  ];

  return {
    me,
    jobs: [job],
    locations,
    trades,
    companies,
    jobCompanies,
    waitingOn: { [job.id]: ['Ross Built', 'Owner', 'Cortney Bishop Design'] },
    items,
    photos,
    titles,
    customFields,
    formSettings: DEFAULT_FORM,
    viewSettings: DEFAULT_VIEW,
    counters: { [job.id]: n },
  };
}
