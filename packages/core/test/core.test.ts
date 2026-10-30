import { describe, expect, it } from 'vitest';
import {
  checkItem,
  complete,
  kindDefaults,
  parseRoomList,
  remove,
  reopen,
  restore,
  RuleError,
  SHARED_AREAS,
  tidyItem,
  waitingOnChoices,
  type ItemFields,
  type Person,
} from '../src/index';

const jake: Person = { id: 'p1', email: 'jake@rossbuilt.com', name: 'Jake Ross', active: true };
const former: Person = { id: 'p2', email: 'former@rossbuilt.com', name: 'Former', active: false };

function item(over: Partial<ItemFields> = {}): ItemFields {
  return {
    title: 'Install toilet',
    description: 'Toilet room, left of the vanity.',
    tradeId: 't-plumbing',
    companyId: 'c-gator',
    kind: 'deficiency',
    ready: true,
    waitingOn: null,
    readyBy: null,
    boughtOut: true,
    poOrCo: null,
    status: 'open',
    completedBy: null,
    completedAt: null,
    extra: {},
    ...over,
  };
}

describe('room list from the plans', () => {
  it('keeps floor order, reads the number first or last, and adds the shared areas', () => {
    const { locations, problems } = parseRoomList(
      ['Level 1:', 'Garage 101', '109 kitchen', '- Screened Patio', '', 'Level 2:', '2. Master Bathroom 207'].join('\n'),
    );
    expect(problems).toEqual([]);
    expect(locations.slice(0, 4).map((l) => [l.label, l.floor, l.sortOrder])).toEqual([
      ['Garage 101', 'Level 1', 1],
      ['Kitchen 109', 'Level 1', 2],
      ['Screened Patio', 'Level 1', 3],
      ['Master Bathroom 207', 'Level 2', 4],
    ]);
    expect(locations.slice(4).map((l) => l.label)).toEqual([...SHARED_AREAS]);
    expect(locations.slice(4).every((l) => l.kind === 'shared')).toBe(true);
  });

  it('uses proper capitalization and leaves capitals alone', () => {
    const { locations } = parseRoomList('powder and laundry 119\nODK 130', { includeShared: false });
    expect(locations.map((l) => l.label)).toEqual(['Powder and Laundry 119', 'ODK 130']);
  });

  it('flags a room listed twice and a line with no name', () => {
    const { locations, problems } = parseRoomList('Kitchen 109\nKitchen 109\n117', { includeShared: false });
    expect(locations).toHaveLength(1);
    expect(problems).toEqual(['Line 2: "Kitchen 109" is already on line 1', 'Line 3: "117" has no room name']);
  });

  it('does not add a shared area twice when the plans already list it', () => {
    const { locations } = parseRoomList('Pool\nKitchen 109');
    expect(locations.filter((l) => l.label === 'Pool')).toHaveLength(1);
  });
});

describe('item rules', () => {
  it('saves a complete, standard item', () => {
    expect(checkItem(item())).toEqual([]);
  });

  it('needs a company and a trade, one each', () => {
    expect(checkItem(item({ companyId: null, tradeId: null })).map((p) => p.field)).toEqual(['companyId', 'tradeId']);
  });

  it('needs Waiting On when the item is not ready', () => {
    expect(checkItem(item({ ready: false })).map((p) => p.field)).toEqual(['waitingOn']);
    expect(checkItem(item({ ready: false, waitingOn: 'Volcano Stone' }))).toEqual([]);
  });

  it('keeps added scope from being Bought Out without a PO or CO', () => {
    expect(checkItem(item({ kind: 'added_scope', boughtOut: true })).map((p) => p.field)).toEqual(['poOrCo']);
    expect(checkItem(item({ kind: 'added_scope', boughtOut: true, poOrCo: 'PO-0090' }))).toEqual([]);
  });

  it('drops Waiting On and Ready By once an item is ready', () => {
    const tidied = tidyItem(item({ ready: true, waitingOn: 'Owner', readyBy: '2026-11-02', title: '  Install   toilet ' }));
    expect(tidied).toMatchObject({ waitingOn: null, readyBy: null, title: 'Install toilet' });
  });

  it('pre-fills from Deficiency or Added Scope', () => {
    expect(kindDefaults('deficiency', { poOrCo: 'CO-2' })).toEqual({ kind: 'deficiency', boughtOut: true, poOrCo: null });
    expect(kindDefaults('added_scope', { poOrCo: null })).toEqual({ kind: 'added_scope', boughtOut: false, poOrCo: null });
    expect(kindDefaults('added_scope', { poOrCo: 'CO-2' })).toEqual({ kind: 'added_scope', boughtOut: true, poOrCo: 'CO-2' });
  });
});

describe('completing and removing', () => {
  it('lets only an active Ross Built person complete, and records who and when', () => {
    const done = complete(item(), jake, new Date('2026-11-02T15:00:00Z'));
    expect(done).toMatchObject({ status: 'complete', completedBy: 'p1', completedAt: '2026-11-02T15:00:00.000Z' });
    expect(checkItem(done)).toEqual([]);
    expect(() => complete(item(), former)).toThrow(RuleError);
  });

  it('reopens by clearing who completed it', () => {
    expect(reopen(complete(item(), jake))).toMatchObject({ status: 'open', completedBy: null, completedAt: null });
  });

  it('never deletes: removing marks the item Removed, and it can be restored', () => {
    const removed = remove(item());
    expect(removed.status).toBe('removed');
    expect(() => complete(removed, jake)).toThrow(RuleError);
    expect(restore(removed).status).toBe('open');
  });
});

describe('Waiting On choices', () => {
  it('lists the extras first, then the job companies, each once', () => {
    const companies = [
      { id: 'c1', name: 'Volcano Stone', defaultTradeId: null, phone: null, email: null, active: true },
      { id: 'c2', name: 'Campbell Cabinetry Designs', defaultTradeId: null, phone: null, email: null, active: true },
      { id: 'c3', name: 'Ross Built', defaultTradeId: null, phone: null, email: null, active: true },
    ];
    const jobCompanies = companies.map((c) => ({ jobId: 'j1', companyId: c.id, tradeId: 't1' }));
    expect(waitingOnChoices(jobCompanies, companies, ['Ross Built', 'Owner', 'Cortney Bishop Design'])).toEqual([
      'Ross Built',
      'Owner',
      'Cortney Bishop Design',
      'Campbell Cabinetry Designs',
      'Volcano Stone',
    ]);
  });
});
