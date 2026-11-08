// Sample data for the preview link only. Real company names make the screens easy to judge;
// the rooms, items, photos, the second person and the history are made up and are not the real
// Fish list.

import {
  addDays,
  addWorkingDays,
  buildTimeline,
  dayOfDate,
  DEFAULT_ROOM_TASKS,
  DEFAULT_FORM,
  DEFAULT_VIEW,
  earliestStart,
  STARTING_TRADES,
  mondayOf,
  parseRoomList,
  ROOM_KINDS,
  scheduleSnapshot,
  type Activity,
  type Comment,
  type Company,
  type CompanyLink,
  type Contact,
  type CustomField,
  type FormSettings,
  type Item,
  type Job,
  type JobCompany,
  type ListSend,
  type Location,
  type Org,
  type Person,
  type Photo,
  type PlanSheet,
  type StandardTitle,
  type TeamMember,
  type Template,
  type TemplateItem,
  type TemplatePlace,
  type Trade,
  type ViewSettings,
  type Visit,
} from '@punch/core';
import { RANGE_WALL, RANGE_WALL_NO_UPPERS, SAMPLE_PHOTO_SIZE, SAMPLE_PLAN, SAMPLE_PLAN_SIZE } from './samplePhotos';

export interface SampleState {
  me: Person;
  /** Signed in as me; out after Sign Out, until a code is entered. */
  signedIn: boolean;
  /** Who asked for a sign in code, to enter it next. */
  codeFor: string | null;
  /** Signed in with an email that is not with a company yet: they start one next. */
  newAccount: string | null;
  /** The company: its name goes on every list. */
  org: Org;
  /** Everyone at the company, for who did what. */
  people: Person[];
  /** Who did what, the way the database logs it. */
  activity: Activity[];
  jobs: Job[];
  /** Who is on each job, and as what. */
  team: TeamMember[];
  locations: Location[];
  trades: Trade[];
  companies: Company[];
  /** The people at each company: who gets its lists. */
  contacts: Contact[];
  /** Each company's private link on a job. */
  links: CompanyLink[];
  jobCompanies: JobCompany[];
  waitingOn: Record<string, string[]>;
  items: Item[];
  photos: Photo[];
  /** The plan sheets on each job, to pin items on. */
  plans: PlanSheet[];
  visits: Visit[];
  sends: ListSend[];
  /** The back and forth with the companies, and internal notes. */
  comments: Comment[];
  titles: StandardTitle[];
  customFields: CustomField[];
  /** What always needs doing in a house, to add to a job in one go. */
  templates: Template[];
  templateItems: TemplateItem[];
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
    ['Install shelving', 4, 2],
    ['Adjust cabinet door', 14, 0.5], ['Adjust closet door', 6, 0.5], ['Adjust door strike', 9, 0.5], ['Adjust pocket door', 4, 1], ['Hang door', 5, 2],
    ['Install door stop', 8, 0.25], ['Install baseboard', 7, 2], ['Install shoe molding', 6, 1.5], ['Install door casing', 5, 1], ['Install cabinet hardware', 11, 2],
    ['Install closet system', 3, 6], ['Set upper cabinets', 4, 4], ['Install crown molding', 3, 4], ['Replace damaged trim', 6, 1],
  ],
  Painting: [['Touch up paint', 40, 0.5], ['Patch drywall', 25, 1], ['Paint door', 8, 1.5], ['Caulk trim', 12, 1], ['Paint pocket doors', 3, 3], ['Paint ceiling', 4, 4], ['Repaint wall', 5, 2]],
  Electrical: [
    ['Install outlet cover', 9, 0.25], ['Replace outlet cover', 5, 0.25], ['Install switch plate', 7, 0.25], ['Install pendant lights', 3, 3], ['Install light fixture', 10, 1],
    ['Replace light bulb', 4, 0.25], ['Install smoke detector', 2, 0.5],
  ],
  Plumbing: [['Trim out toilet', 9, 1], ['Install shower trim', 7, 1.5], ['Install toilet', 6, 2], ['Install faucet', 8, 1.5], ['Install shower head', 5, 0.5], ['Fix leak', 4, 1], ['Install hose bib', 2, 1], ['Adjust shower valve', 3, 1]],
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
  const me: Person = { id: 'person-jake', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true, role: 'admin', sees: 'all', phone: null };
  // Made up, like the second person below: someone who sees only the jobs they are on, and someone who sees every job.
  const sam: Person = { id: 'person-sam', email: 'sam@rossbuilt.com', name: 'Sam Rivera', active: true, role: 'team', sees: 'assigned', phone: '(941) 555-0142' };
  const taylor: Person = { id: 'person-taylor', email: 'taylor@rossbuilt.com', name: 'Taylor Brooks', active: true, role: 'team', sees: 'all', phone: null };
  const job: Job = { id: 'job-preview', name: 'Sample Job', address: 'Sample data, not the real Fish list', closed: false };
  // A second job Sam is not on, and one that is done and put away.
  const bay: Job = { id: 'job-bay', name: 'Bay Drive House', address: 'Sample data, a second job', closed: false };
  const palm: Job = { id: 'job-palm', name: 'Palm Avenue House', address: 'Sample data, a finished job', closed: true };
  const team: TeamMember[] = [
    { id: 'team-1', jobId: job.id, personId: me.id, part: 'project_manager' },
    { id: 'team-2', jobId: job.id, personId: sam.id, part: 'superintendent' },
    { id: 'team-3', jobId: job.id, personId: taylor.id, part: 'field' },
    { id: 'team-4', jobId: bay.id, personId: me.id, part: 'project_manager' },
    { id: 'team-5', jobId: palm.id, personId: me.id, part: 'project_manager' },
    { id: 'team-6', jobId: palm.id, personId: sam.id, part: 'superintendent' },
  ];

  const tradeNames = ['Plumbing', 'Electrical', 'Painting', 'Tile', 'Carpentry', 'Stone', 'Air Conditioning', 'Ross Built Crew'];
  // The order the finish work goes, which every list follows: the electrical and plumbing trim
  // first, the paint and the clean last.
  const workOrder = ['Electrical', 'Plumbing', 'Air Conditioning', 'Carpentry', 'Tile', 'Stone', 'Painting', 'Ross Built Crew'];
  const trades: Trade[] = tradeNames.map((name, i) => ({ id: `trade-${i}`, name, sortOrder: workOrder.indexOf(name) + 1 }));
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
  // Made up people at the companies, with addresses that go nowhere. Volcano Stone and Climatic have
  // nobody yet; Gator Plumbing's has only a phone, so its list goes by text.
  let contactNo = 0;
  const person = (company: string, name: string, email: string | null, phone: string | null, getsLists = true): Contact => ({
    id: `contact-${++contactNo}`,
    companyId: c(company),
    name,
    email,
    phone,
    getsLists,
    sortOrder: contactNo,
    active: true,
  });
  const contacts: Contact[] = [
    person('SMS Carpentry', 'Mike Sample', 'mike@smscarpentry.example', '(941) 555-0131'),
    person('SMS Carpentry', 'Office', 'office@smscarpentry.example', null, false),
    person('Triple H Painting', 'Hector Sample', 'hector@triplehpainting.example', null),
    person('Gator Plumbing', 'Dave Sample', null, '(941) 555-0187'),
    person('Rangel Custom Tile', 'Luis Sample', 'luis@rangeltile.example', null),
    person('Metro Electric', 'Sarah Sample', 'sarah@metroelectric.example', '(941) 555-0164'),
  ];
  // SMS Carpentry's page went out with its list last week.
  const links: CompanyLink[] = [
    { token: '5f3a9c1e7b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a', jobId: job.id, companyId: c('SMS Carpentry'), createdAt: '2026-10-30T16:00:00.000Z', revoked: false },
  ];

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
  const locations: Location[] = parsed.locations.map((l, i) => ({ ...l, id: `room-${i}`, jobId: job.id, active: true, walkedAt: null }));
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
      assignedTo: null,
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
    // Your own team's work: assigned to someone on the team, not to a company.
    item('Living 107', 'Install refrigerator drawers', 'Bar under the stair.', 'Ross Built', { kind: 'added_scope', boughtOut: false, companyId: null, assignedTo: taylor.id }),
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
    // The company confirmed this one from its page, with its time.
    item('Kitchen 109', 'Install cabinet hardware', 'Island and the pantry wall.', 'SMS Carpentry', { confirmedAt: '2026-11-05T14:10:00.000Z', hours: 2 }),
    // What other work waits on: the stone behind the range, on a visit, and the pocket door hardware.
    item('Kitchen 109', 'Install range backsplash', 'Full height slab behind the range.', 'Volcano Stone', { hours: 4 }),
    item('Master Bathroom 207', 'Install pocket door hardware', 'Both pocket doors.', 'SMS Carpentry', { hours: 1 }),
    // Work for you: it shows on My Items.
    item('Bathroom 116', 'Order towel bar', 'The one picked for this bath never came.', 'Ross Built', { companyId: null, assignedTo: me.id, hours: null }),
    item('Foyer 115', 'Hang house numbers', 'Beside the front door, from the owner’s pick.', 'Ross Built', { companyId: null, assignedTo: me.id }),
  ];

  // The schedule: a confirmed visit next, and one that ended with work still open.
  const today = dayOfDate(new Date());
  const visit = (id: string, company: string, start: string, days: number, confirmed: boolean, itemNumbers: number[]): Visit => {
    for (const no of itemNumbers) {
      const it = items.find((x) => x.number === no);
      if (it) it.visitId = id;
    }
    return {
      id,
      jobId: job.id,
      companyId: c(company),
      start,
      days,
      confirmed,
      note: '',
      removed: false,
      askedStart: null,
      askedDays: null,
      askedName: null,
      askedAt: null,
      createdBy: me.id,
      createdAt: at,
      updatedAt: at,
    };
  };
  const visits: Visit[] = [
    visit('visit-paint', 'Triple H Painting', earliestStart(today), 2, true, [3, 15]),
    visit('visit-tile', 'Rangel Custom Tile', addDays(mondayOf(today), -7), 1, true, [8]),
    visit('visit-stone', 'Volcano Stone', addWorkingDays(earliestStart(today), 2), 1, false, [25]),
  ];
  // Last Friday's schedule, to track against: Volcano Stone was two working days sooner, Triple H
  // Painting had not confirmed yet, and Climatic was not on it.
  const now = scheduleSnapshot(buildTimeline(items, visits, locations, today));
  const kept = now.bars.flatMap((b) =>
    b.companyId === c('Climatic')
      ? []
      : b.companyId === c('Volcano Stone')
        ? [{ ...b, start: addWorkingDays(b.start, -2), end: addWorkingDays(b.end, -2) }]
        : b.companyId === c('Triple H Painting')
          ? [{ ...b, confirmed: false }]
          : [b],
  );
  const lastFriday = addDays(mondayOf(today), -3);
  // SMS Carpentry's list went out last week, before the cabinet door was found.
  const sends: ListSend[] = [
    {
      id: 'send-schedule',
      jobId: job.id,
      list: 'schedule',
      itemIds: [],
      sentAt: `${lastFriday}T15:30:00.000Z`,
      sentBy: me.id,
      removed: false,
      snapshot: { finish: kept.reduce<string | null>((m, b) => (m === null || b.end > m ? b.end : m), null), bars: kept },
    },
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
    done: false,
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

  // Level 1's plan, with a few items pinned where they are.
  const plans: PlanSheet[] = [
    { id: 'plan-level-1', jobId: job.id, floor: 'Level 1', name: 'Level 1 Floor Plan', uri: SAMPLE_PLAN, ...SAMPLE_PLAN_SIZE, sortOrder: 1, removed: false },
  ];
  const pins: [number, number, number][] = [
    [16, 0.5, 0.2],
    [1, 0.45, 0.14],
    [3, 0.58, 0.33],
    [22, 0.2, 0.4],
    [5, 0.8, 0.2],
    [6, 0.15, 0.7],
  ];
  for (const [num, x, y] of pins) {
    const i = items.findIndex((it) => it.number === num);
    if (i >= 0) items[i] = { ...items[i]!, planId: 'plan-level-1', pinX: x, pinY: y };
  }

  let titleNo = 0;
  const titles: StandardTitle[] = Object.entries(STANDARD_TITLES).flatMap(([trade, list]) =>
    list.map(([title, uses, hours]) => ({ id: `title-${++titleNo}`, title, tradeId: t(trade), uses, approved: true, hours, rooms: DEFAULT_ROOM_TASKS[title.toLowerCase()] ?? [] })),
  );

  // The starter templates, as the database seeds them once the trades are in, and a small one for
  // the outside. Common Tasks on a walk come from them.
  const templates: Template[] = [
    { id: 'template-house', name: 'End of the House', active: true, sortOrder: 1 },
    { id: 'template-rooms', name: 'Common Tasks by Room', active: true, sortOrder: 2 },
    { id: 'template-outside', name: 'Pool and Outside', active: true, sortOrder: 3 },
  ];
  let taskNo = 0;
  const task = (templateId: string, title: string, trade: string, hours: number, place: TemplatePlace, waitsOn: string[] = []): TemplateItem => ({
    id: `task-${++taskNo}`,
    templateId,
    title,
    description: '',
    kind: 'completion',
    tradeId: t(trade),
    hours,
    place,
    waitsOn,
    sortOrder: taskNo,
    active: true,
  });
  const templateItems: TemplateItem[] = [
    task('template-house', 'Install mirror', 'Carpentry', 1, 'bathroom'),
    task('template-house', 'Install towel bar', 'Carpentry', 0.5, 'bathroom'),
    task('template-house', 'Install toilet paper holder', 'Carpentry', 0.25, 'bathroom'),
    task('template-house', 'Trim out toilet', 'Plumbing', 1, 'bathroom'),
    task('template-house', 'Caulk shower corner', 'Tile', 0.5, 'bathroom'),
    task('template-house', 'Install shower glass', 'Carpentry', 2, 'bathroom', ['task-5']),
    task('template-house', 'Install cabinet hardware', 'Carpentry', 2, 'kitchen'),
    task('template-house', 'Install appliances', 'Ross Built Crew', 4, 'kitchen'),
    task('template-house', 'Install dryer vent cover', 'Air Conditioning', 0.5, 'laundry'),
    task('template-house', 'Install door stop', 'Carpentry', 0.25, 'bedroom'),
    task('template-house', 'Touch up paint', 'Painting', 2, 'Whole House'),
    task('template-house', 'Final clean', 'Ross Built Crew', 8, 'Whole House', ['task-11']),
    task('template-house', 'Clean windows', 'Ross Built Crew', 8, 'Whole House'),
    task('template-house', 'Pressure wash driveway', 'Ross Built Crew', 3, 'Driveway'),
    task('template-outside', 'Clean pool tile line', 'Ross Built Crew', 2, 'Pool'),
    task('template-outside', 'Clean gutters', 'Ross Built Crew', 3, 'Roof'),
    task('template-outside', 'Touch up exterior paint', 'Painting', 4, 'outside'),
  ];
  // The common tasks in each kind of room, each with its standard title's trade and usual time,
  // leaving out what End of the House has there already.
  const inHouse = new Set(templateItems.filter((x) => x.templateId === 'template-house').map((x) => `${x.title.toLowerCase()}|${x.place}`));
  for (const kind of ROOM_KINDS) {
    for (const [title, kinds] of Object.entries(DEFAULT_ROOM_TASKS)) {
      if (!kinds.includes(kind) || inHouse.has(`${title}|${kind}`)) continue;
      const standard = titles.find((x) => x.title.toLowerCase() === title);
      templateItems.push({
        id: `task-${++taskNo}`,
        templateId: 'template-rooms',
        title: standard?.title ?? title.charAt(0).toUpperCase() + title.slice(1),
        description: '',
        kind: 'completion',
        tradeId: standard?.tradeId ?? null,
        hours: standard?.hours ?? null,
        place: kind,
        waitsOn: [],
        sortOrder: taskNo,
        active: true,
      });
    }
  }

  const customFields: CustomField[] = [
    { id: 'field-found-by', label: 'Found By', kind: 'list', options: ['Owner', 'Architect', 'Designer', 'Ross Built'], sortOrder: 1, active: true },
  ];

  // Who did what so far, over the last two weeks, for Activity and each item's History.
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

  // SMS Carpentry marked two of its items done from its page this morning: To Check. The touch up
  // at the hood is wanted first.
  const markDone = (num: number, when: string) => {
    const i = items.findIndex((it) => it.number === num);
    if (i < 0) return;
    items[i] = { ...items[i]!, markedDoneAt: when };
    activity.push({
      id: `activity-${String(++seq).padStart(4, '0')}`,
      jobId: job.id,
      personId: null,
      at: when,
      kind: 'item_marked_done',
      itemId: items[i]!.id,
      detail: { company_id: items[i]!.companyId, from_company: true, author_name: 'Mike' },
    });
  };
  markDone(19, ago(0, 7, 40));
  markDone(22, ago(0, 7, 44));
  {
    const i = items.findIndex((it) => it.number === 3);
    if (i >= 0) items[i] = { ...items[i]!, priority: true };
  }

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
    signedIn: true,
    codeFor: null,
    newAccount: null,
    org: { id: 'ross_built', name: 'Ross Built' },
    people: [me, sam, taylor],
    activity,
    jobs: [job, bay, palm],
    team,
    locations,
    trades,
    companies,
    contacts,
    links,
    jobCompanies,
    waitingOn: { [job.id]: ['Ross Built', 'Owner', 'Cortney Bishop Design'] },
    items,
    photos,
    plans,
    visits,
    sends,
    comments,
    titles,
    customFields,
    templates,
    templateItems,
    formSettings: DEFAULT_FORM,
    viewSettings: DEFAULT_VIEW,
    counters: { [job.id]: n, [bay.id]: 0, [palm.id]: 0 },
  };
}

/** A company just started on the preview page: its admin, the usual trades and nothing else yet. */
export function newCompanyState(org: Org, me: Person): SampleState {
  return {
    me,
    signedIn: true,
    codeFor: null,
    newAccount: null,
    org,
    people: [me],
    activity: [],
    jobs: [],
    team: [],
    locations: [],
    trades: STARTING_TRADES.map((name, i) => ({ id: `trade-new-${i + 1}`, name, sortOrder: i + 1 })),
    companies: [],
    contacts: [],
    links: [],
    jobCompanies: [],
    waitingOn: {},
    items: [],
    photos: [],
    plans: [],
    visits: [],
    sends: [],
    comments: [],
    titles: [],
    customFields: [],
    templates: [],
    templateItems: [],
    formSettings: DEFAULT_FORM,
    viewSettings: DEFAULT_VIEW,
    counters: {},
  };
}
