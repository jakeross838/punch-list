// Sample data for the preview link only. Real company names make the screens easy to judge;
// the rooms, items, photos, the second person and the history are made up and are not the real
// Fish list.

import {
  addDays,
  addWorkingDays,
  dayOfDate,
  DEFAULT_FORM,
  DEFAULT_VIEW,
  earliestStart,
  mondayOf,
  parseRoomList,
  type Activity,
  type Comment,
  type Company,
  type CustomField,
  type FormSettings,
  type Item,
  type Job,
  type JobCompany,
  type ListSend,
  type Location,
  type Person,
  type Photo,
  type StandardTitle,
  type Trade,
  type ViewSettings,
  type Visit,
} from '@punch/core';
import { RANGE_WALL, RANGE_WALL_NO_UPPERS, SAMPLE_PHOTO_SIZE } from './samplePhotos';

export interface SampleState {
  me: Person;
  /** Everyone at Ross Built, for who did what. */
  people: Person[];
  /** Who did what, the way the database logs it. */
  activity: Activity[];
  jobs: Job[];
  locations: Location[];
  trades: Trade[];
  companies: Company[];
  jobCompanies: JobCompany[];
  waitingOn: Record<string, string[]>;
  items: Item[];
  photos: Photo[];
  visits: Visit[];
  sends: ListSend[];
  /** The back and forth with the companies, and Ross Built only notes. */
  comments: Comment[];
  titles: StandardTitle[];
  customFields: CustomField[];
  formSettings: FormSettings;
  viewSettings: ViewSettings;
  counters: Record<string, number>;
}

/**
 * The standard titles by trade: a verb and the thing, the same words for the same work everywhere,
 * with how often each is used and how long the work usually takes, in hours.
 */
const STANDARD_TITLES: Record<string, [string, number, number][]> = {
  Carpentry: [
    ['Adjust cabinet door', 14, 0.5], ['Adjust closet door', 6, 0.5], ['Adjust door strike', 9, 0.5], ['Adjust pocket door', 4, 1], ['Hang door', 5, 2],
    ['Install door stop', 8, 0.25], ['Install baseboard', 7, 2], ['Install shoe molding', 6, 1.5], ['Install door casing', 5, 1], ['Install cabinet hardware', 11, 2],
    ['Install closet system', 3, 6], ['Set upper cabinets', 4, 4], ['Install crown molding', 3, 4], ['Replace damaged trim', 6, 1],
  ],
  Painting: [['Touch up paint', 40, 0.5], ['Patch drywall', 25, 1], ['Paint door', 8, 1.5], ['Caulk trim', 12, 1], ['Paint pocket doors', 3, 3], ['Paint ceiling', 4, 4], ['Repaint wall', 5, 2]],
  Electrical: [
    ['Install outlet cover', 9, 0.25], ['Replace outlet cover', 5, 0.25], ['Install switch plate', 7, 0.25], ['Install pendant lights', 3, 3], ['Install light fixture', 10, 1],
    ['Replace light bulb', 4, 0.25], ['Install smoke detector', 2, 0.5],
  ],
  Plumbing: [['Install toilet', 6, 2], ['Install faucet', 8, 1.5], ['Install shower head', 5, 0.5], ['Fix leak', 4, 1], ['Install hose bib', 2, 1], ['Adjust shower valve', 3, 1]],
  Tile: [['Grout shower floor', 4, 3], ['Caulk tub surround', 5, 1], ['Replace cracked tile', 6, 2], ['Seal grout', 3, 2], ['Caulk shower corner', 4, 0.5]],
  Stone: [['Set vanity tops', 3, 4], ['Polish countertop edge', 2, 1], ['Seal countertop', 3, 1], ['Install backsplash', 2, 6]],
  'Air Conditioning': [['Mount thermostats', 3, 2], ['Adjust thermostat', 2, 0.5], ['Install dryer vent cover', 2, 0.5], ['Install return grille', 3, 0.5], ['Install supply register', 4, 0.25]],
  'Ross Built Crew': [
    ['Clean windows', 5, 8], ['Final clean', 3, 8], ['Install towel bar', 6, 0.5], ['Install toilet paper holder', 4, 0.25], ['Install mirror', 3, 1],
    ['Install refrigerator drawers', 1, 2],
  ],
};

/** How long a standard title usually takes, for the sample items. */
const usualHours = (title: string) => Object.values(STANDARD_TITLES).flat().find(([t]) => t === title)?.[2] ?? null;

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
      kind: 'completion',
      ready: true,
      waitingOn: [],
      waitingOnItems: [],
      readyBy: null,
      boughtOut: true,
      poOrCo: null,
      status: 'open',
      completedBy: null,
      completedAt: null,
      source: 'typed',
      extra: {},
      unfinished: false,
      visitId: null,
      hours: usualHours(title),
      btExternalId: null,
      createdBy: me.id,
      createdAt: at,
      updatedAt: at,
      ...over,
    };
  };

  const items: Item[] = [
    // Waits on the range backsplash going in first (the last item), and comes free when its visit is done.
    item('Kitchen 109', 'Set upper cabinets', 'Range wall, both sides of the hood.', 'SMS Carpentry', { ready: false, waitingOnItems: ['item-25'] }),
    item('Kitchen 109', 'Install pendant lights', 'Over the island, three fixtures.', 'Metro Electric', { ready: false, waitingOn: ['Owner'] }),
    item('Kitchen 109', 'Touch up paint', 'Ceiling at the hood soffit.', 'Triple H Painting', { kind: 'deficiency' }),
    item('Living 107', 'Install refrigerator drawers', 'Bar under the stair.', 'Ross Built', { kind: 'added_scope', boughtOut: false }),
    item('Guest Bedroom 114', 'Replace outlet cover', 'North wall, left of the window.', 'Metro Electric', { kind: 'deficiency' }),
    item('Bathroom 116', 'Install toilet', 'Toilet room, left of the vanity.', 'Gator Plumbing'),
    item('Bathroom 116', 'Grout shower floor', '', 'Rangel Custom Tile', { status: 'complete', completedBy: me.id, completedAt: at }),
    item('Bathroom 116', 'Caulk tub surround', 'Corner at the shower valve wall.', 'Rangel Custom Tile', { kind: 'deficiency' }),
    item('Laundry 119', 'Install dryer vent cover', 'Exterior wall above the washer.', 'Climatic'),
    // Waits on SMS Carpentry's pocket door hardware (the very last item).
    item('Master Bathroom 207', 'Paint pocket doors', 'Both doors, after the hardware.', 'Triple H Painting', { ready: false, waitingOnItems: ['item-26'] }),
    item('Master Bathroom 207', 'Set vanity tops', 'Double vanity, east wall.', 'Volcano Stone', { ready: false, waitingOn: ['Owner'], readyBy: '2026-11-09' }),
    item('Whole House', 'Mount thermostats', 'All zones, at the end of the job.', 'Climatic', { ready: false, waitingOn: ['Ross Built'] }),
    item('Foyer 115', 'Hang front door', 'Pivot door at the entry. Set the hardware after paint.', 'SMS Carpentry', { ready: false, waitingOn: ['Owner'], readyBy: '2026-10-26' }),
    item('Master Bedroom 206', 'Install closet system', 'Walk in closet, both long walls.', 'SMS Carpentry', { kind: 'added_scope', boughtOut: true, poOrCo: 'CO 14' }),
    item('Living 107', 'Patch drywall', 'Behind the television mount, two screw holes.', 'Triple H Painting', { kind: 'deficiency' }),
    item('Kitchen 109', 'Adjust cabinet door', 'Upper cabinet left of the hood. The right door rubs the hood.', 'SMS Carpentry', { kind: 'deficiency', source: 'walk' }),
    // Snapped on a walk as a draft, waiting to be filled in.
    item('Kitchen 109', '', '', 'SMS Carpentry', { source: 'walk', unfinished: true, tradeId: null, companyId: null }),
    item('Master Bathroom 207', 'Install shower trim', 'Valve trim and the hand shower.', 'Gator Plumbing'),
    // SMS Carpentry's smaller work around the house, ready now: about two days with the closet system.
    item('Guest Bedroom 114', 'Install door stop', 'Behind the bedroom door.', 'SMS Carpentry'),
    item('Master Bedroom 206', 'Adjust closet door', 'Left door drags on the carpet.', 'SMS Carpentry', { kind: 'deficiency' }),
    item('Laundry 119', 'Install baseboard', 'Both long walls.', 'SMS Carpentry'),
    item('Living 107', 'Install shoe molding', 'Along the stone hearth.', 'SMS Carpentry'),
    item('Foyer 115', 'Replace damaged trim', 'Door casing dented at the closet.', 'SMS Carpentry', { kind: 'deficiency' }),
    item('Kitchen 109', 'Install cabinet hardware', 'Island and the pantry wall.', 'SMS Carpentry'),
    // What other work waits on: the stone behind the range, on a visit, and the pocket door hardware.
    item('Kitchen 109', 'Install range backsplash', 'Full height slab behind the range.', 'Volcano Stone', { hours: 4 }),
    item('Master Bathroom 207', 'Install pocket door hardware', 'Both pocket doors.', 'SMS Carpentry', { hours: 1 }),
  ];

  // The schedule: a confirmed visit next, and one that ended with work still open.
  const today = dayOfDate(new Date());
  const visit = (id: string, company: string, start: string, days: number, confirmed: boolean, itemNumbers: number[]): Visit => {
    for (const no of itemNumbers) {
      const it = items.find((x) => x.number === no);
      if (it) it.visitId = id;
    }
    return { id, jobId: job.id, companyId: c(company), start, days, confirmed, note: '', removed: false, createdBy: me.id, createdAt: at, updatedAt: at };
  };
  const visits: Visit[] = [
    visit('visit-paint', 'Triple H Painting', earliestStart(today), 2, true, [3, 15]),
    visit('visit-tile', 'Rangel Custom Tile', addDays(mondayOf(today), -7), 1, true, [8]),
    visit('visit-stone', 'Volcano Stone', addWorkingDays(earliestStart(today), 2), 1, false, [25]),
  ];
  // SMS Carpentry's list went out last week, before the cabinet door was found.
  const sends: ListSend[] = [
    {
      id: 'send-sms',
      jobId: job.id,
      list: `company:${c('SMS Carpentry')}`,
      itemIds: ['item-1', 'item-13', 'item-14'],
      sentAt: `${addDays(mondayOf(today), -3)}T16:00:00.000Z`,
      sentBy: me.id,
      removed: false,
    },
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
    photo('item-17', RANGE_WALL, []),
    photo('item-16', RANGE_WALL, [
      { tool: 'circle', color: 'red', from: [0.174, 0.092], to: [0.4, 0.469] },
      { tool: 'arrow', color: 'red', from: [0.538, 0.588], to: [0.395, 0.415] },
      { tool: 'text', color: 'red', at: [0.41, 0.642], text: 'Rubs the hood' },
    ]),
  ];

  let titleNo = 0;
  const titles: StandardTitle[] = Object.entries(STANDARD_TITLES).flatMap(([trade, list]) =>
    list.map(([title, uses, hours]) => ({ id: `title-${++titleNo}`, title, tradeId: t(trade), uses, approved: true, hours })),
  );

  const customFields: CustomField[] = [
    { id: 'field-found-by', label: 'Found By', kind: 'list', options: ['Owner', 'Architect', 'Designer', 'Ross Built'], sortOrder: 1, active: true },
  ];

  // Who did what so far, over the last two weeks, for Activity and each item's History.
  const sam: Person = { id: 'person-sam', email: 'sam@rossbuilt.com', name: 'Sam Rivera', active: true };
  const ago = (days: number, hour: number, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, minute, 0, 0);
    // Never later than now, when the preview is opened early in the day.
    return new Date(Math.min(d.getTime(), Date.now() - 60_000)).toISOString();
  };
  let seq = 0;
  const activity: Activity[] = [];
  const log = (personId: string, at: string, entry: Omit<Activity, 'id' | 'jobId' | 'personId' | 'at'>) =>
    activity.push({ id: `activity-${String(++seq).padStart(4, '0')}`, jobId: job.id, personId, at, ...entry });

  for (const l of locations) log(me.id, ago(13, 8, 10), { kind: 'location_added', itemId: null, detail: { location_id: l.id, label: l.label } });
  const added: Record<number, [string, number, number, number]> = {
    1: [me.id, 9, 9, 0], 2: [me.id, 9, 9, 12], 3: [me.id, 9, 9, 25], 4: [me.id, 9, 9, 40], 5: [me.id, 9, 10, 5], 6: [me.id, 9, 10, 20],
    7: [sam.id, 6, 10, 0], 8: [sam.id, 6, 10, 14], 9: [sam.id, 6, 10, 31], 10: [sam.id, 6, 10, 45], 11: [sam.id, 6, 11, 2], 12: [sam.id, 6, 11, 20],
    13: [me.id, 4, 14, 0], 14: [me.id, 4, 14, 18], 15: [me.id, 4, 14, 35], 16: [me.id, 1, 15, 20], 17: [sam.id, 0, 8, 5], 18: [sam.id, 2, 9, 30],
    19: [sam.id, 3, 9, 10], 20: [sam.id, 3, 9, 22], 21: [sam.id, 3, 9, 40], 22: [sam.id, 3, 10, 2], 23: [sam.id, 3, 10, 15], 24: [sam.id, 3, 10, 31],
  };
  for (const it of items) {
    const [who, days, hour, minute] = added[it.number ?? 0] ?? [me.id, 9, 9, 0];
    const when = ago(days, hour, minute);
    Object.assign(it, { createdBy: who, createdAt: when, updatedAt: when });
    log(who, when, { kind: 'item_created', itemId: it.id, field: 'created', before: null, after: it.title });
    const p = photos.find((x) => x.itemId === it.id);
    if (p) {
      Object.assign(p, { createdBy: who, createdAt: when });
      log(who, ago(days, hour, minute + 1), { kind: 'photo_added', itemId: it.id, detail: { photo_id: p.id } });
      if (p.marks.length > 0) log(who, ago(days, hour, minute + 2), { kind: 'photo_marked', itemId: it.id, detail: { photo_id: p.id } });
    }
  }
  const change = (who: string, at: string, it: Item | undefined, fields: [string, string | null, string | null][]) => {
    if (it) for (const [field, before, after] of fields) log(who, at, { kind: 'item_changed', itemId: it.id, field, before, after });
  };
  const byNumber = (no: number) => items.find((x) => x.number === no);
  const vanity = byNumber(11);
  change(sam.id, ago(5, 11, 0), vanity, [
    ['ready', 'true', 'false'],
    ['waiting_on', null, JSON.stringify(vanity?.waitingOn ?? [])],
    ['ready_by', null, vanity?.readyBy ?? null],
  ]);
  change(me.id, ago(3, 13, 15), byNumber(13), [['ready_by', null, byNumber(13)?.readyBy ?? null]]);
  const grout = byNumber(7);
  if (grout) {
    const when = ago(2, 16, 0);
    Object.assign(grout, { completedBy: sam.id, completedAt: when, updatedAt: when });
    change(sam.id, when, grout, [
      ['status', 'open', 'complete'],
      ['completed_by', null, sam.id],
      ['completed_at', null, when],
    ]);
  }
  const scheduled = (who: string, at: string, v: Visit, confirmed: boolean) => {
    Object.assign(v, { createdBy: who, createdAt: at, updatedAt: at });
    log(who, at, { kind: 'visit_added', itemId: null, detail: { visit_id: v.id, company_id: v.companyId, start: v.start, days: v.days, confirmed } });
    for (const it of items.filter((x) => x.visitId === v.id)) log(who, at, { kind: 'item_changed', itemId: it.id, field: 'visit_id', before: null, after: v.id });
  };
  const [paint, tile] = visits;
  if (tile) scheduled(me.id, ago(9, 16, 0), tile, true);
  if (paint) {
    scheduled(me.id, ago(2, 11, 0), paint, false);
    const d = { visit_id: paint.id, company_id: paint.companyId, start: paint.start, days: paint.days };
    log(me.id, ago(1, 9, 10), { kind: 'visit_changed', itemId: null, detail: { ...d, confirmed: true, was_start: paint.start, was_days: paint.days, was_confirmed: false } });
  }
  for (const s of sends) log(s.sentBy, s.sentAt, { kind: 'list_sent', itemId: null, detail: { list: s.list, items: s.itemIds.length } });

  // A back and forth with SMS Carpentry about the cabinet door and its week, a note only Ross Built
  // sees, and Triple H Painting asking about the hood.
  const comments: Comment[] = [];
  let commentNo = 0;
  const say = (at: string, itemNo: number | null, company: string, body: string, by: { person?: string; name?: string | null; internal?: boolean }) => {
    const it = itemNo === null ? undefined : byNumber(itemNo);
    const c: Comment = {
      id: `comment-${++commentNo}`,
      jobId: job.id,
      itemId: it?.id ?? null,
      companyId: companies.find((x) => x.name === company)!.id,
      body,
      personId: by.person ?? null,
      fromCompany: !by.person,
      authorName: by.person ? null : (by.name ?? null),
      internal: by.internal ?? false,
      removed: false,
      createdAt: at,
    };
    comments.push(c);
    activity.push({
      id: `activity-${String(++seq).padStart(4, '0')}`,
      jobId: job.id,
      personId: c.personId,
      at,
      kind: 'comment_added',
      itemId: c.itemId,
      detail: { comment_id: c.id, company_id: c.companyId, from_company: c.fromCompany, author_name: c.authorName, internal: c.internal, body: c.body },
    });
  };
  say(ago(1, 15, 40), 16, 'SMS Carpentry', 'Can you look at the left door while you are there? It drags a little too.', { person: me.id });
  say(ago(1, 17, 5), 16, 'SMS Carpentry', 'Will do. We are bringing new hinges for both.', { name: 'Mike' });
  say(ago(0, 8, 20), 16, 'SMS Carpentry', 'The owner asked us to check the pantry doors too. Add it if they say so.', { person: sam.id, internal: true });
  say(ago(1, 17, 10), null, 'SMS Carpentry', 'We can do all the trim work Monday and Tuesday next week if that works.', { name: 'Mike' });
  say(ago(2, 10, 30), 3, 'Triple H Painting', 'Is the hood going in before we paint the soffit?', { name: null });
  say(ago(2, 11, 15), 3, 'Triple H Painting', 'Yes, it is in now. The soffit is ready for you.', { person: me.id });

  return {
    me,
    people: [me, sam],
    activity,
    jobs: [job],
    locations,
    trades,
    companies,
    jobCompanies,
    waitingOn: { [job.id]: ['Ross Built', 'Owner', 'Cortney Bishop Design'] },
    items,
    photos,
    visits,
    sends,
    comments,
    titles,
    customFields,
    formSettings: DEFAULT_FORM,
    viewSettings: DEFAULT_VIEW,
    counters: { [job.id]: n },
  };
}
