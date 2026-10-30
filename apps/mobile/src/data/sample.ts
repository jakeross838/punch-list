// Sample data for the preview link only. Real company names make the screens easy to judge;
// the rooms and items are made up and are not the real Fish list.

import { parseRoomList, type Company, type Item, type Job, type JobCompany, type Location, type Person, type Trade } from '@punch/core';

export interface SampleState {
  me: Person;
  jobs: Job[];
  locations: Location[];
  trades: Trade[];
  companies: Company[];
  jobCompanies: JobCompany[];
  waitingOn: Record<string, string[]>;
  items: Item[];
  counters: Record<string, number>;
}

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
      waitingOn: null,
      readyBy: null,
      boughtOut: true,
      poOrCo: null,
      status: 'open',
      completedBy: null,
      completedAt: null,
      source: 'typed',
      btExternalId: null,
      createdBy: me.id,
      createdAt: at,
      updatedAt: at,
      ...over,
    };
  };

  const items: Item[] = [
    item('Kitchen 109', 'Set upper cabinets', 'Range wall, both sides of the hood.', 'SMS Carpentry', { ready: false, waitingOn: 'Volcano Stone', readyBy: '2026-11-02' }),
    item('Kitchen 109', 'Install pendant lights', 'Over the island, three fixtures.', 'Metro Electric', { ready: false, waitingOn: 'Owner' }),
    item('Kitchen 109', 'Touch up paint', 'Ceiling at the hood soffit.', 'Triple H Painting'),
    item('Living 107', 'Install refrigerator drawers', 'Bar under the stair.', 'Ross Built', { kind: 'added_scope', boughtOut: false }),
    item('Guest Bedroom 114', 'Replace outlet cover', 'North wall, left of the window.', 'Metro Electric'),
    item('Bathroom 116', 'Install toilet', 'Toilet room, left of the vanity.', 'Gator Plumbing'),
    item('Bathroom 116', 'Grout shower floor', '', 'Rangel Custom Tile', { status: 'complete', completedBy: me.id, completedAt: at }),
    item('Bathroom 116', 'Caulk tub surround', 'Corner at the shower valve wall.', 'Rangel Custom Tile'),
    item('Laundry 119', 'Install dryer vent cover', 'Exterior wall above the washer.', 'Climatic'),
    item('Master Bathroom 207', 'Paint pocket doors', 'Both doors, after the hardware.', 'Triple H Painting', { ready: false, waitingOn: 'SMS Carpentry' }),
    item('Master Bathroom 207', 'Set vanity tops', 'Double vanity, east wall.', 'Volcano Stone', { ready: false, waitingOn: 'Owner', readyBy: '2026-11-09' }),
    item('Whole House', 'Mount thermostats', 'All zones, at the end of the job.', 'Climatic', { ready: false, waitingOn: 'Ross Built' }),
    item('Foyer 115', 'Hang front door', 'Pivot door at the entry. Set the hardware after paint.', 'SMS Carpentry', { ready: false, waitingOn: 'Owner', readyBy: '2026-10-26' }),
    item('Master Bedroom 206', 'Install closet system', 'Walk in closet, both long walls.', 'SMS Carpentry', { kind: 'added_scope', boughtOut: true, poOrCo: 'CO-14' }),
    item('Living 107', 'Patch drywall', 'Behind the television mount, two screw holes.', 'Triple H Painting'),
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
    counters: { [job.id]: n },
  };
}
