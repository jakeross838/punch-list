import { describe, expect, it } from 'vitest';
import { activityLines, activityLookups, checkItem, missingText, roomKind, roomTasks, tidyItem, tidyRooms, type ItemFields, type StandardTitle } from '../src/index';

const title = (t: string, rooms: StandardTitle['rooms'], uses = 1): StandardTitle => ({ id: t, title: t, tradeId: 't', uses, approved: true, hours: 1, rooms });

describe('the walk', () => {
  it('works out the kind of room from the location name', () => {
    expect(roomKind('Master Bathroom 207')).toBe('bathroom');
    expect(roomKind('Pool Bath 101')).toBe('bathroom');
    expect(roomKind('Powder 112')).toBe('bathroom');
    expect(roomKind('Primary Closet 208')).toBe('closet');
    expect(roomKind('Butler Pantry 110')).toBe('closet');
    expect(roomKind('Kitchen 109')).toBe('kitchen');
    expect(roomKind('Laundry 119')).toBe('laundry');
    expect(roomKind('Guest Bedroom 114')).toBe('bedroom');
    expect(roomKind('Covered Lanai')).toBe('outside');
    expect(roomKind('Foyer 115')).toBe('living');
    expect(roomKind('Whole House')).toBeNull();
  });

  it("offers each kind of room's common tasks, the most used first", () => {
    const titles = [title('Install faucet', ['bathroom', 'kitchen'], 8), title('Trim out toilet', ['bathroom'], 9), title('Install backsplash', ['kitchen']), { ...title('Old task', ['bathroom']), approved: false }];
    expect(roomTasks('bathroom', titles).map((t) => t.title)).toEqual(['Trim out toilet', 'Install faucet']);
    expect(roomTasks('kitchen', titles).map((t) => t.title)).toEqual(['Install faucet', 'Install backsplash']);
    expect(tidyRooms(['kitchen', 'attic', 'bathroom', 'kitchen'])).toEqual(['bathroom', 'kitchen']);
  });

  it('saves a photo before a location is picked, and a finished item needs one', () => {
    const draft: ItemFields & { locationId: string } = {
      locationId: '', title: '', description: '', tradeId: null, companyId: null, kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null,
      boughtOut: true, poOrCo: null, status: 'open', completedBy: null, completedAt: null, extra: {}, unfinished: true, visitId: null, hours: null,
    };
    expect(checkItem(draft)).toEqual([]);
    expect(missingText(draft)).toBe('Needs a title, location and company');
    const named = { ...draft, title: 'Install mirror', companyId: 'c' };
    expect(tidyItem(named).unfinished).toBe(true);
    expect(tidyItem({ ...named, locationId: 'k' }).unfinished).toBe(false);
    expect(checkItem({ ...named, unfinished: false }).map((p) => p.field)).toEqual(['locationId']);
  });

  it("says the company's answer on its dates under the name it typed", () => {
    const look = activityLookups({
      people: [],
      items: [],
      locations: [],
      companies: [{ id: 'sms', name: 'SMS Carpentry', defaultTradeId: null, phone: null, email: null, active: true }],
      trades: [],
      visits: [],
      customFields: [],
      today: new Date(2026, 9, 31),
    });
    const lines = activityLines(
      [
        { id: 'a1', jobId: 'j', itemId: null, personId: null, at: '2026-10-31T13:00:00.000Z', kind: 'visit_confirmed_by_company', detail: { visit_id: 'v1', company_id: 'sms', start: '2026-11-04', days: 1, from_company: true, author_name: 'Mike' } },
        { id: 'a2', jobId: 'j', itemId: null, personId: null, at: '2026-10-31T13:05:00.000Z', kind: 'visit_change_asked', detail: { visit_id: 'v2', company_id: 'sms', start: '2026-11-13', days: 1, was_start: '2026-11-11', was_days: 2, from_company: true, author_name: null } },
      ],
      look,
    );
    expect(lines.map((l) => [l.who, l.action])).toEqual([
      ['SMS Carpentry', 'asked to move its visit'],
      ['Mike at SMS Carpentry', 'confirmed its visit'],
    ]);
    expect(lines[0]!.detail).toMatch(/^To Friday, November.13, 1 day\. Booked for Wednesday, November.11, 2 days\.$/);
  });
});
