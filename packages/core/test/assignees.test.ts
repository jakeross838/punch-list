// Assigned To: one field for a company or someone on the team.

import { describe, expect, it } from 'vitest';
import {
  assigneeFields,
  assigneeKey,
  assigneeName,
  checkItem,
  pastePlan,
  groupItems,
  holdLookups,
  holdNames,
  jobList,
  matchesFilters,
  NO_FILTERS,
  personKey,
  type Company,
  type Item,
  type Location,
} from '../src/index';

let n = 0;
function item(over: Partial<Item> = {}): Item {
  n += 1;
  return {
    id: `i${n}`, jobId: 'j', locationId: 'l1', number: n, assignedTo: null, title: `Item ${n}`, description: '',
    tradeId: 't1', companyId: 'sms', kind: 'deficiency', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null,
    boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, source: 'typed',
    extra: {}, unfinished: false, visitId: null, hours: null, btExternalId: null, createdBy: 'p1', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z',
    ...over,
  };
}

const companies: Company[] = [
  { id: 'sms', name: 'SMS Carpentry', defaultTradeId: 't1', phone: null, email: null, active: true },
  { id: 'triple', name: 'Triple H Painting', defaultTradeId: 't2', phone: null, email: null, active: true },
];
const people = [
  { id: 'taylor', name: 'Taylor Brooks' },
  { id: 'jake', name: 'Jake Ross' },
];
const locations: Location[] = [{ id: 'l1', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null }];
const names = { companies: new Map(companies.map((c) => [c.id, c.name])), people: new Map(people.map((p) => [p.id, p.name])) };

describe('Assigned To', () => {
  it('is a company or someone on the team, and picking one clears the other', () => {
    expect(assigneeFields('sms')).toEqual({ companyId: 'sms', assignedTo: null });
    expect(assigneeFields(personKey('taylor'))).toEqual({ companyId: null, assignedTo: 'taylor' });
    expect(assigneeFields(null)).toEqual({ companyId: null, assignedTo: null });
    expect(assigneeKey(item({ companyId: null, assignedTo: 'taylor' }))).toBe('person:taylor');
    expect(assigneeName(item({ companyId: null, assignedTo: 'taylor' }), names)).toBe('Taylor Brooks');
    // From before the two were one field: the company, which does the work.
    expect(assigneeName(item({ assignedTo: 'taylor' }), names)).toBe('SMS Carpentry');
  });

  it('is needed on an open item, a company or a person either way', () => {
    expect(checkItem(item({ companyId: null })).map((p) => p.message)).toEqual(['Pick who it is assigned to']);
    expect(checkItem(item({ companyId: null, assignedTo: 'taylor' }))).toEqual([]);
    expect(checkItem(item({ companyId: null, unfinished: true }))).toEqual([]);
  });

  it('groups each company, then each person, then work assigned to no one', () => {
    const items = [item(), item({ companyId: null, assignedTo: 'taylor' }), item({ companyId: 'triple' }), item({ companyId: null, assignedTo: 'jake' })];
    const groups = groupItems(items, 'company', { locations, companies, people });
    expect(groups.map((g) => g.label)).toEqual(['SMS Carpentry', 'Triple H Painting', 'Jake Ross', 'Taylor Brooks']);
    expect(groups.find((g) => g.label === 'Taylor Brooks')?.key).toBe('person:taylor');
  });

  it('filters by companies and people together: assigned to any of them', () => {
    const toSms = item();
    const toTaylor = item({ companyId: null, assignedTo: 'taylor' });
    const toTriple = item({ companyId: 'triple' });
    const f = { ...NO_FILTERS, companyIds: ['sms'], assignedTo: ['taylor'] };
    expect([toSms, toTaylor, toTriple].filter((i) => matchesFilters(i, f)).map((i) => i.id)).toEqual([toSms.id, toTaylor.id]);
  });

  it('names a person on the team where work waits on their task', () => {
    const task = item({ title: 'Install blocking', companyId: null, assignedTo: 'taylor' });
    const waits = item({ ready: false, waitingOnItems: [task.id] });
    const look = holdLookups({ items: [task, waits], companies, people, locations });
    expect(holdNames(waits, look)).toEqual(['Taylor Brooks']);
  });

  it('says who on the whole job list', () => {
    const lines = jobList([item({ companyId: null, assignedTo: 'jake' })], { locations, companies, people });
    expect(lines[0]?.company).toBe('Jake Ross');
  });

  it('sends a copy assigned to a person on another job to Drafts, to be assigned there', () => {
    const ours = item({ companyId: null, assignedTo: 'taylor' });
    const plan = pastePlan([ours], { jobId: 'other', locationId: 'm1' }, [], () => 'new');
    expect(plan.items[0]).toMatchObject({ assignedTo: null, companyId: null, unfinished: true });
    const here = pastePlan([ours], { jobId: 'j', locationId: 'l2' }, [], () => 'new2');
    expect(here.items[0]).toMatchObject({ assignedTo: 'taylor', unfinished: false });
  });
});
