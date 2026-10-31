import { describe, expect, it } from 'vitest';
import { activityLines, activityLookups, itemChanges, type Activity, type Item } from '../src/index';

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1',
  jobId: 'j',
  locationId: 'laundry',
  number: 21,
  title: 'Patch drywall',
  description: '',
  tradeId: 'painting',
  companyId: 'triple-h',
  kind: 'deficiency',
  ready: true,
  waitingOn: [],
  readyBy: null,
  boughtOut: true,
  poOrCo: null,
  status: 'open',
  completedBy: null,
  completedAt: null,
  extra: {},
  unfinished: false,
  visitId: null,
  source: 'typed',
  btExternalId: null,
  createdBy: 'jake',
  createdAt: '2026-10-30T13:00:00.000Z',
  updatedAt: '2026-10-30T13:00:00.000Z',
  ...over,
});

const look = activityLookups({
  people: [
    { id: 'jake', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true },
    { id: 'sam', email: 'sam@rossbuilt.com', name: 'Sam Rivera', active: true },
  ],
  items: [item(), item({ id: 'i2', title: 'Install towel bar', locationId: 'bath' })],
  locations: [
    { id: 'laundry', jobId: 'j', name: 'Laundry', number: '119', label: 'Laundry 119', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true },
    { id: 'kitchen', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true },
    { id: 'bath', jobId: 'j', name: 'Bathroom', number: '116', label: 'Bathroom 116', floor: 'Level 1', kind: 'room', sortOrder: 3, active: true },
  ],
  companies: [
    { id: 'triple-h', name: 'Triple H Painting', defaultTradeId: 'painting', phone: null, email: null, active: true },
    { id: 'sms', name: 'SMS Carpentry', defaultTradeId: 'carpentry', phone: null, email: null, active: true },
  ],
  trades: [
    { id: 'painting', name: 'Painting', sortOrder: 1 },
    { id: 'carpentry', name: 'Carpentry', sortOrder: 2 },
  ],
  visits: [],
  customFields: [{ id: 'found-by', label: 'Found By', kind: 'list', options: ['Owner'], sortOrder: 1, active: true }],
  today: new Date(2026, 9, 31),
});

let n = 0;
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 30, 13, minutes)).toISOString();
const entry = (over: Partial<Activity> & Pick<Activity, 'kind'>): Activity => ({ id: `a${String(++n).padStart(3, '0')}`, jobId: 'j', itemId: 'i1', personId: 'jake', at: at(0), ...over });
const change = (minutes: number, field: string, before: string | null, after: string | null, personId = 'jake'): Activity =>
  entry({ kind: 'item_changed', at: at(minutes), field, before, after, personId });

describe('activity', () => {
  it('logs an item change the way the database does: a column for each field, the values as text', () => {
    const changes = itemChanges(item(), item({ companyId: 'sms', ready: false, waitingOn: ['Owner'], updatedAt: 'later' }));
    expect(changes).toEqual([
      { field: 'company_id', before: 'triple-h', after: 'sms' },
      { field: 'ready', before: 'true', after: 'false' },
      { field: 'waiting_on', before: '[]', after: '["Owner"]' },
    ]);
  });

  it('reads adding an item and its photo, done together, as one line', () => {
    const lines = activityLines(
      [entry({ kind: 'item_created', at: at(0), field: 'created', after: 'Patch drywall' }), entry({ kind: 'photo_added', at: at(1) }), entry({ kind: 'photo_marked', at: at(2) })],
      look,
    );
    expect(lines).toEqual([
      { key: 'a001', at: at(2), personId: 'jake', who: 'Jake Ross', itemId: 'i1', action: 'added Patch drywall', detail: 'Laundry 119. With a photo, marked up.' },
    ]);
  });

  it('puts several changes close together in one line, each field from where it started to where it ended', () => {
    const lines = activityLines(
      [
        change(30, 'company_id', 'triple-h', 'sms'),
        change(31, 'ready', 'true', 'false'),
        change(31, 'waiting_on', null, '["Owner", "Volcano Stone"]'),
        change(32, 'description', '', 'Two screw holes.'),
        change(33, 'description', 'Two screw holes.', ''),
        change(34, 'bought_out', 'true', 'false'),
        change(35, 'extra', '{}', '{"found-by": "Owner"}'),
      ],
      look,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      action: 'changed Patch drywall',
      detail: 'Laundry 119. Company: SMS Carpentry. Not ready. Waiting on Owner and Volcano Stone. Found By: Owner.',
    });
  });

  it('keeps completing its own line, and starts a new line after a while or for someone else', () => {
    const lines = activityLines(
      [
        change(0, 'title', 'Patch wall', 'Patch drywall'),
        change(20, 'title', 'Patch drywall', 'Patch drywall and paint'),
        change(21, 'description', '', 'Behind the door.', 'sam'),
        change(22, 'status', 'open', 'complete', 'sam'),
        change(22, 'completed_by', null, 'sam', 'sam'),
      ],
      look,
    );
    expect(lines.map((l) => `${l.who} ${l.action}`)).toEqual([
      'Sam Rivera completed Patch drywall',
      'Sam Rivera changed Patch drywall',
      'Jake Ross changed Patch drywall',
      'Jake Ross changed Patch drywall',
    ]);
    expect(lines[3]?.detail).toBe('Laundry 119. Renamed from Patch wall.');
  });

  it('says it plainly for drafts put on the lists, moves, readiness, and a change made and undone', () => {
    const lines = activityLines(
      [
        change(0, 'unfinished', 'true', 'false'),
        change(30, 'location_id', 'laundry', 'kitchen'),
        change(60, 'ready', 'false', 'true'),
        change(60, 'waiting_on', '["Owner"]', null),
        change(90, 'company_id', 'triple-h', 'sms'),
        change(91, 'company_id', 'sms', 'triple-h'),
      ],
      look,
    );
    expect(lines.map((l) => l.action)).toEqual(['marked Patch drywall ready', 'moved Patch drywall to Kitchen 109', 'put Patch drywall on the lists']);
  });

  it('reads visits, lists sent and setup', () => {
    const job = (kind: Activity['kind'], minutes: number, detail: Activity['detail']): Activity => entry({ kind, at: at(minutes), itemId: null, detail });
    const lines = activityLines(
      [
        job('location_added', 0, { label: 'Roof Deck 301' }),
        job('location_added', 0, { label: 'Office 302' }),
        job('location_renamed', 1, { from: 'Office 302', to: 'Home Office 302' }),
        job('company_added', 2, { company_id: 'sms', trade_id: 'carpentry' }),
        job('visit_added', 3, { company_id: 'sms', start: '2026-11-03', days: 2, confirmed: false }),
        job('visit_changed', 4, { company_id: 'sms', start: '2026-11-03', days: 2, confirmed: true, was_start: '2026-11-03', was_days: 2, was_confirmed: false }),
        job('list_sent', 5, { list: 'company:sms', items: 5 }),
        job('list_sent', 6, { list: 'party:design team', items: 1 }),
      ],
      look,
    );
    expect(lines.map((l) => [l.action, l.detail])).toEqual([
      ['sent the Design Team list', '1 item.'],
      ['sent the SMS Carpentry list', '5 items.'],
      ['confirmed the visit for SMS Carpentry', 'Tuesday, November 3, 2 days, confirmed.'],
      ['scheduled SMS Carpentry', 'Tuesday, November 3, 2 days, our best guess.'],
      ['added SMS Carpentry to the job', 'Carpentry.'],
      ['renamed Office 302 to Home Office 302', ''],
      ['added 2 locations', 'Roof Deck 301, Office 302.'],
    ]);
  });

  it('counts the items put on a visit in the visit\'s line, and keeps them in each item\'s History', () => {
    const entries = [
      entry({ kind: 'visit_added', at: at(10), itemId: null, detail: { visit_id: 'v1', company_id: 'sms', start: '2026-11-03', days: 1, confirmed: true } }),
      { ...change(10, 'visit_id', null, 'v1'), itemId: 'i1' },
      { ...change(10, 'visit_id', null, 'v1'), itemId: 'i2' },
    ];
    expect(activityLines(entries, look).map((l) => [l.action, l.detail])).toEqual([['scheduled SMS Carpentry', 'Tuesday, November\u00a03, 1 day, confirmed. 2 items.']]);
    expect(activityLines(entries.filter((e) => e.itemId === 'i2'), look, { forItem: true }).map((l) => l.action)).toEqual(['scheduled it']);
  });

  it('leaves out a draft\'s first title in the job\'s Activity, which names the item already, and keeps it in the History', () => {
    const entries = [change(0, 'title', '', 'Patch drywall'), change(0, 'unfinished', 'true', 'false')];
    expect(activityLines(entries, look)[0]).toMatchObject({ action: 'put Patch drywall on the lists', detail: 'Laundry 119.' });
    expect(activityLines(entries, look, { forItem: true })[0]).toMatchObject({ action: 'put it on the lists', detail: 'Title: Patch drywall.' });
  });

  it('calls the item it in its own History, and names Buildertrend for an import', () => {
    const lines = activityLines(
      [
        entry({ kind: 'item_created', at: at(0), field: 'created', after: 'Patch drywall', personId: null, imported: true }),
        change(40, 'status', 'open', 'complete'),
      ],
      look,
      { forItem: true },
    );
    expect(lines.map((l) => `${l.who} ${l.action}`)).toEqual(['Jake Ross completed it', 'Buildertrend added it']);
    expect(lines[0]?.detail).toBe('');
  });
});
