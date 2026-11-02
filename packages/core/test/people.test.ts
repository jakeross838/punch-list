import { describe, expect, it } from 'vitest';
import { activityLines, activityLookups, assignedTo, isAdmin, isEmail, matchesFilters, NO_FILTERS, seesJob, teamText, tidyEmail, type Item, type Person } from '../src/index';

const person = (over: Partial<Person>): Person => ({ id: 'p', email: 'p@rossbuilt.com', name: 'P', active: true, role: 'team', sees: 'all', phone: null, ...over });
const jake = person({ id: 'jake', name: 'Jake Ross', role: 'admin' });
const sam = person({ id: 'sam', name: 'Sam Rivera', sees: 'assigned' });
const team = [
  { id: 't1', jobId: 'fish', personId: 'sam', part: 'field' as const },
  { id: 't2', jobId: 'fish', personId: 'jake', part: 'project_manager' as const },
];

describe('people at Ross Built', () => {
  it('lets admins change the setup, and shows each person the jobs they may see', () => {
    expect(isAdmin(jake)).toBe(true);
    expect(isAdmin(sam)).toBe(false);
    expect(isAdmin({ ...jake, active: false })).toBe(false);
    expect(seesJob(sam, 'fish', team)).toBe(true);
    expect(seesJob(sam, 'gavin', team)).toBe(false);
    expect(seesJob({ ...sam, sees: 'all' }, 'gavin', team)).toBe(true);
    expect(seesJob(jake, 'gavin', [])).toBe(true);
    expect(seesJob({ ...sam, active: false }, 'fish', team)).toBe(false);
  });

  it("says a job's team project manager first", () => {
    expect(teamText(team, [jake, sam])).toBe('Jake Ross, Project Manager, and 1 more');
    expect(teamText([], [jake])).toBe('');
  });

  it('keeps emails tidy', () => {
    expect(tidyEmail('  Sam@RossBuilt.com ')).toBe('sam@rossbuilt.com');
    expect(isEmail('sam@rossbuilt.com')).toBe(true);
    expect(isEmail('sam at rossbuilt')).toBe(false);
  });

  it('lists the work assigned to a person, and filters by who it is assigned to', () => {
    const base: Omit<Item, 'id' | 'assignedTo'> = { jobId: 'fish', locationId: 'k', number: 1, title: 'Install faucet', description: '', tradeId: null, companyId: 'c', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, source: 'typed', extra: {}, unfinished: false, visitId: null, hours: null, btExternalId: null, createdBy: 'jake', createdAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z' };
    const items: Item[] = [
      { ...base, id: 'a', assignedTo: 'sam' },
      { ...base, id: 'b', assignedTo: 'sam', status: 'complete' },
      { ...base, id: 'c', assignedTo: 'sam', unfinished: true },
      { ...base, id: 'd', assignedTo: null },
    ];
    expect(assignedTo(items, 'sam').map((i) => i.id)).toEqual(['a']);
    expect(items.filter((i) => matchesFilters(i, { ...NO_FILTERS, assignedTo: ['sam'] })).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('says assignments and team changes in Activity', () => {
    const base: Omit<Item, 'id' | 'assignedTo'> = { jobId: 'fish', locationId: 'k', number: 4, title: 'Install faucet', description: '', tradeId: null, companyId: 'c', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, source: 'typed', extra: {}, unfinished: false, visitId: null, hours: null, btExternalId: null, createdBy: 'jake', createdAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z' };
    const look = activityLookups({ people: [jake, sam], items: [{ ...base, id: 'i1', assignedTo: 'sam' }], locations: [], companies: [], trades: [], visits: [], customFields: [], today: new Date(2026, 10, 2) });
    const lines = activityLines(
      [
        { id: 'a1', jobId: 'fish', itemId: 'i1', personId: 'jake', at: '2026-11-02T13:00:00.000Z', kind: 'item_changed', field: 'assigned_to', before: null, after: 'sam' },
        { id: 'a2', jobId: 'fish', itemId: null, personId: 'jake', at: '2026-11-02T13:01:00.000Z', kind: 'team_added', detail: { person_id: 'sam', part: 'field' } },
        { id: 'a3', jobId: 'fish', itemId: null, personId: 'jake', at: '2026-11-02T13:02:00.000Z', kind: 'team_changed', detail: { person_id: 'sam', part: 'superintendent', was_part: 'field' } },
        { id: 'a4', jobId: 'fish', itemId: null, personId: 'jake', at: '2026-11-02T13:03:00.000Z', kind: 'job_closed', detail: {} },
      ],
      look,
    );
    expect(lines.map((l) => `${l.who} ${l.action}`)).toEqual([
      'Jake Ross closed the job',
      "Jake Ross made Sam Rivera the job's Superintendent",
      'Jake Ross put Sam Rivera on the team',
      'Jake Ross assigned Install faucet to Sam Rivera',
    ]);
  });
});
