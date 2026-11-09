// A big job, for checking the app stays quick: a thousand items in sixty-two locations, three
// thousand photos, fifteen hundred comments, visits and the history, the way a big house looks near
// the end. Only the speed check asks for it; nobody sees it in the preview.

import type { Activity, Comment, Item, Location, Photo, Visit } from '@punch/core';
import type { SampleState } from './sample';
import { RANGE_WALL, RANGE_WALL_NO_UPPERS, SAMPLE_PHOTO_SIZE } from './samplePhotos';

export const BIG_JOB_ID = 'job-big';

const ROOMS = ['Bedroom', 'Bathroom', 'Closet', 'Office', 'Den', 'Hall', 'Kitchen', 'Living', 'Laundry', 'Media'];
const TITLES = [
  'Touch up paint',
  'Caulk tub surround',
  'Replace outlet cover',
  'Adjust cabinet door',
  'Install door stop',
  'Patch drywall',
  'Install baseboard',
  'Install shoe molding',
  'Replace damaged trim',
  'Install cabinet hardware',
  'Grout shower floor',
  'Set vanity tops',
  'Install shower trim',
  'Mount thermostats',
  'Install pendant lights',
  'Clean windows',
  'Adjust closet door',
  'Fill nail holes',
  'Seal stone counter',
  'Replace cracked tile',
];

/** The sample company with the big job added: the first job on the list, Jake its project manager. */
export function withBigJob(state: SampleState): SampleState {
  const jobId = BIG_JOB_ID;
  const at = '2026-10-20T14:00:00.000Z';
  const me = state.me.id;
  const companies = state.companies.filter((c) => c.active);

  const locations: Location[] = [];
  for (let floor = 1; floor <= 3; floor += 1) {
    for (let n = 1; n <= 20; n += 1) {
      const name = ROOMS[(n - 1) % ROOMS.length]!;
      const number = `${floor}${String(n).padStart(2, '0')}`;
      locations.push({ id: `big-room-${number}`, jobId, name, number, label: `${name} ${number}`, floor: `Level ${floor}`, kind: 'room', sortOrder: locations.length + 1, active: true, walkedAt: null });
    }
  }
  for (const name of ['Whole House', 'Exterior']) {
    locations.push({ id: `big-${name.toLowerCase().replace(' ', '-')}`, jobId, name, number: null, label: name, floor: null, kind: 'shared', sortOrder: locations.length + 1, active: true, walkedAt: null });
  }

  const items: Item[] = [];
  for (let n = 1; n <= 1000; n += 1) {
    const location = locations[(n * 7) % locations.length]!;
    const company = companies[n % companies.length]!;
    const done = n % 3 === 0;
    // Some wait on an earlier item in the same location, some on the owner.
    const earlier = items.find((i) => i.locationId === location.id && i.status === 'open');
    const waits = !done && n % 10 === 1 && earlier ? [earlier.id] : [];
    const owner = !done && n % 20 === 7;
    items.push({
      id: `big-item-${n}`,
      jobId,
      locationId: location.id,
      number: n,
      assignedTo: null,
      title: TITLES[n % TITLES.length]!,
      description: `Big job item ${n}, by the ${n % 2 ? 'window' : 'door'}.`,
      tradeId: company.defaultTradeId,
      companyId: company.id,
      kind: n % 5 === 0 ? 'deficiency' : 'completion',
      ready: waits.length === 0 && !owner,
      waitingOn: owner ? ['Owner'] : [],
      waitingOnItems: waits,
      readyBy: null,
      boughtOut: true,
      poOrCo: null,
      status: done ? 'complete' : 'open',
      completedBy: done ? me : null,
      completedAt: done ? at : null,
      source: 'walk',
      extra: {},
      unfinished: n % 97 === 0 && !done,
      visitId: null,
      hours: n % 4 === 0 ? 1 : null,
      btExternalId: null,
      priority: n % 50 === 0,
      createdBy: me,
      createdAt: at,
      updatedAt: at,
    });
  }

  const photos: Photo[] = items.flatMap((item, i) =>
    [0, 1, 2].map((k) => ({
      id: `big-photo-${i + 1}-${k}`,
      jobId,
      itemId: item.id,
      uri: (i + k) % 2 ? RANGE_WALL : RANGE_WALL_NO_UPPERS,
      storagePath: null,
      ...SAMPLE_PHOTO_SIZE,
      marks: [],
      sortOrder: k + 1,
      removed: false,
      done: k === 2 && item.status === 'complete',
      createdBy: me,
      createdAt: at,
    })),
  );

  const comments: Comment[] = [];
  for (let n = 1; n <= 1500; n += 1) {
    const item = items[(n * 13) % items.length]!;
    const fromCompany = n % 3 === 0;
    comments.push({
      id: `big-comment-${n}`,
      jobId,
      itemId: item.id,
      companyId: item.companyId,
      body: fromCompany ? 'Done, take a look when you can.' : 'Please check this one before Friday.',
      personId: fromCompany ? null : me,
      fromCompany,
      authorName: fromCompany ? 'Office' : null,
      internal: n % 7 === 0,
      removed: false,
      createdAt: at,
    });
  }

  const visits: Visit[] = companies.flatMap((company, i) =>
    [0, 1, 2, 3, 4].map((k) => ({
      id: `big-visit-${i}-${k}`,
      jobId,
      companyId: company.id,
      start: `2026-11-${String(2 + k * 5).padStart(2, '0')}`,
      days: 1 + (k % 2),
      confirmed: k % 2 === 0,
      note: '',
      removed: false,
      askedStart: null,
      askedDays: null,
      askedName: null,
      askedAt: null,
      createdBy: me,
      createdAt: at,
      updatedAt: at,
    })),
  );

  const activity: Activity[] = items.flatMap((item, i) => {
    const added: Activity = { id: `big-activity-${i + 1}-a`, jobId, itemId: item.id, personId: me, at, kind: 'item_created', field: 'created', before: null, after: item.title };
    const done: Activity = { id: `big-activity-${i + 1}-c`, jobId, itemId: item.id, personId: me, at, kind: 'item_changed', field: 'status', before: 'open', after: 'complete' };
    return item.status === 'complete' ? [added, done] : [added];
  });

  return {
    ...state,
    jobs: [{ id: jobId, name: 'Big Job', address: 'For the speed check', closed: false }, ...state.jobs],
    team: [...state.team, { id: 'big-team-1', jobId, personId: me, part: 'project_manager' }],
    locations: [...state.locations, ...locations],
    jobCompanies: [...state.jobCompanies, ...companies.map((c) => ({ jobId, companyId: c.id, tradeId: c.defaultTradeId! }))],
    items: [...state.items, ...items],
    photos: [...state.photos, ...photos],
    comments: [...state.comments, ...comments],
    visits: [...state.visits, ...visits],
    activity: [...state.activity, ...activity],
  };
}
