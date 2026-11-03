import { describe, expect, it } from 'vitest';
import { dropAt, groupItems, jobList, keepTogether, sortItems, tradeRanks, type Company, type Item, type Location, type Trade } from '../src/index';

let n = 0;
const item = (over: Partial<Item>): Item => {
  n += 1;
  return {
    id: `i${n}`, jobId: 'fish', locationId: 'kitchen', number: n, assignedTo: null, title: `Task ${n}`, description: '', tradeId: 'plumbing',
    companyId: 'gator', kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null,
    status: 'open', completedBy: null, completedAt: null, source: 'typed', extra: {}, unfinished: false, visitId: null, hours: null,
    btExternalId: null, createdBy: 'jake', createdAt: '2026-11-03T10:00:00Z', updatedAt: '2026-11-03T10:00:00Z', ...over,
  };
};
const location = (id: string, label: string, sortOrder: number): Location => ({ id, jobId: 'fish', name: label, number: null, label, floor: 'Level 1', kind: 'room', sortOrder, active: true, walkedAt: null });
const company = (id: string, name: string): Company => ({ id, name, defaultTradeId: null, phone: null, email: null, active: true });
const trades: Trade[] = [
  { id: 'painting', name: 'Painting', sortOrder: 3 },
  { id: 'electrical', name: 'Electrical', sortOrder: 1 },
  { id: 'plumbing', name: 'Plumbing', sortOrder: 2 },
];

describe('each trade stays together as things are added', () => {
  // Added in the order they were found: electrical, plumbing, painting, then electrical again.
  const lights = item({ id: 'lights', title: 'Install pendant lights', tradeId: 'electrical', companyId: 'metro' });
  const faucet = item({ id: 'faucet', title: 'Install faucet', tradeId: 'plumbing' });
  const paint = item({ id: 'paint', title: 'Touch up paint', tradeId: 'painting', companyId: 'hhh' });
  const outlet = item({ id: 'outlet', title: 'Install outlet cover', tradeId: 'electrical', companyId: 'metro' });
  const draft = item({ id: 'draft', title: '', tradeId: null, companyId: null, unfinished: true });

  it('ranks the trades in their order, then by name, with no trade last', () => {
    const rank = tradeRanks([...trades, { id: 'tile', name: 'Tile', sortOrder: 2 }]);
    expect(['electrical', 'plumbing', 'tile', 'painting', null].map(rank)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps a location from jumping between trades: a new item lands with its own', () => {
    const rank = tradeRanks(trades);
    expect(sortItems([lights, faucet, paint, outlet, draft], rank).map((i) => i.id)).toEqual(['lights', 'outlet', 'faucet', 'paint', 'draft']);
    // Without the trades, number order as before.
    expect(sortItems([outlet, lights, faucet]).map((i) => i.id)).toEqual(['lights', 'faucet', 'outlet']);
    // Dragged into order inside its trade, that order holds.
    const moved = { ...outlet, position: 0.5 };
    expect(sortItems([lights, faucet, paint, moved], rank).map((i) => i.id)).toEqual(['outlet', 'lights', 'faucet', 'paint']);
  });

  it('does the same on screen and on the printed whole job list', () => {
    const locations = [location('kitchen', 'Kitchen 109', 1), location('bath', 'Bathroom 116', 2)];
    const companies = [company('gator', 'Gator Plumbing'), company('metro', 'Metro Electric'), company('hhh', 'Triple H Painting')];
    const bathFaucet = item({ id: 'bath-faucet', locationId: 'bath', tradeId: 'plumbing' });
    const all = [lights, faucet, paint, outlet, bathFaucet];
    const kitchen = groupItems(all, 'room', { locations, companies, trades }).find((g) => g.key === 'kitchen')!;
    expect(kitchen.items.map((i) => i.id)).toEqual(['lights', 'outlet', 'faucet', 'paint']);
    expect(jobList(all, { locations, companies, trades }).map((l) => l.item.id)).toEqual(['lights', 'outlet', 'faucet', 'paint', 'bath-faucet']);
  });

  it('keeps a dragged item inside its trade: let go among another trade, it goes to the nearer end of its own', () => {
    const list = sortItems([lights, faucet, paint, outlet, item({ id: 'trap', tradeId: 'plumbing' })], tradeRanks(trades));
    expect(list.map((i) => i.id)).toEqual(['lights', 'outlet', 'faucet', 'trap', 'paint']);
    const trade = (i: Item) => i.tradeId ?? '';
    // Inside its own trade: as dropped.
    expect(keepTogether(list, 'trap', 'faucet', trade)).toBe('faucet');
    // To the top of the list: the top of the plumbing.
    expect(keepTogether(list, 'trap', 'lights', trade)).toBe('faucet');
    // To the end: the end of the plumbing, before the painting.
    expect(keepTogether(list, 'trap', null, trade)).toBe('paint');
    expect(keepTogether(list, 'paint', 'lights', trade)).toBe('paint');
    // And the positions it gets put it there.
    const changes = dropAt(list, [list.find((i) => i.id === 'trap')!], keepTogether(list, 'trap', 'lights', trade));
    const after = list.map((i) => ({ ...i, position: changes.find((c) => c.id === i.id)?.position ?? i.position }));
    expect(sortItems(after, tradeRanks(trades)).map((i) => i.id)).toEqual(['lights', 'outlet', 'trap', 'faucet', 'paint']);
  });
});
