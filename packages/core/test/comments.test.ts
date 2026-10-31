import { describe, expect, it } from 'vitest';
import {
  activityLines,
  activityLookups,
  commentAuthor,
  commentCounts,
  commentCountText,
  companyList,
  companyPrintout,
  customPrintout,
  DEFAULT_LIST_DESIGN,
  filteredLines,
  isShared,
  itemComments,
  listComments,
  NO_FILTERS,
  tidyComment,
  tidyName,
  type Activity,
  type Comment,
  type Item,
  type Location,
} from '../src/index';

const rooms: Location[] = [{ id: 'k', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true }];
const lookups = {
  locations: rooms,
  trades: [{ id: 't-carp', name: 'Carpentry', sortOrder: 1 }],
  companies: [{ id: 'c-sms', name: 'SMS Carpentry', defaultTradeId: 't-carp', phone: null, email: null, active: true }],
};
const look = { people: new Map([['jake', 'Jake Ross']]), companies: new Map([['c-sms', 'SMS Carpentry']]) };

const door: Item = {
  id: 'door', jobId: 'j', locationId: 'k', number: 16, title: 'Adjust cabinet door', description: 'The right door rubs the hood.', tradeId: 't-carp',
  companyId: 'c-sms', kind: 'deficiency', ready: true, waitingOn: [], readyBy: null, boughtOut: true, poOrCo: null, status: 'open',
  completedBy: null, completedAt: null, source: 'walk', extra: {}, unfinished: false, visitId: null, hours: 0.5, btExternalId: null,
  createdBy: 'jake', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z',
};

let n = 0;
function comment(over: Partial<Comment>): Comment {
  n += 1;
  return {
    id: `m${n}`, jobId: 'j', itemId: 'door', companyId: 'c-sms', body: `Comment ${n}`, personId: 'jake', fromCompany: false,
    authorName: null, internal: false, removed: false, createdAt: `2026-10-30T1${n}:00:00Z`, ...over,
  };
}

const comments = [
  comment({ body: 'The left one drags too.' }),
  comment({ body: 'Coming Tuesday with a new hinge.', personId: null, fromCompany: true, authorName: 'Mike' }),
  comment({ body: 'Owner wants the pantry door checked too.', internal: true }),
  comment({ body: 'Never mind.', removed: true }),
  comment({ itemId: null, body: 'We can do all the trim Monday and Tuesday.', personId: null, fromCompany: true, authorName: null }),
];

describe('comments', () => {
  it('tidies what is typed', () => {
    expect(tidyComment('  Coming Tuesday.  \n\n\n\nWith the hinge.  ')).toBe('Coming Tuesday.\n\nWith the hinge.');
    expect(tidyComment('x'.repeat(2500))).toHaveLength(2000);
    expect(tidyName('  Mike   Rivera ')).toBe('Mike Rivera');
    expect(tidyName('   ')).toBeNull();
  });

  it("keeps each item's thread and the list's own, oldest first, the company's view without Ross Built only notes", () => {
    expect(itemComments(comments, 'door').map((c) => c.body)).toEqual([
      'The left one drags too.',
      'Coming Tuesday with a new hinge.',
      'Owner wants the pantry door checked too.',
    ]);
    expect(itemComments(comments, 'door', { shared: true }).map((c) => c.body)).toEqual(['The left one drags too.', 'Coming Tuesday with a new hinge.']);
    expect(listComments(comments, 'c-sms').map((c) => c.body)).toEqual(['We can do all the trim Monday and Tuesday.']);
    expect(commentCounts(comments).get('door')).toBe(3);
    expect([commentCountText(1), commentCountText(3)]).toEqual(['1 comment', '3 comments']);
    expect(comments.filter(isShared)).toHaveLength(3);
  });

  it('says who wrote it: the person, or the company with the name it typed', () => {
    expect(comments.map((c) => commentAuthor(c, look))).toEqual(['Jake Ross', 'Mike at SMS Carpentry', 'Jake Ross', 'Jake Ross', 'SMS Carpentry']);
  });

  it('reads in Activity under whoever wrote it, and stays out of the item History', () => {
    const at = '2026-10-31T13:00:00.000Z';
    const entries: Activity[] = [
      { id: 'a1', jobId: 'j', itemId: 'door', personId: null, at, kind: 'comment_added', detail: { company_id: 'c-sms', from_company: true, author_name: 'Mike', internal: false, body: 'Coming Tuesday with a new hinge.' } },
      { id: 'a2', jobId: 'j', itemId: null, personId: 'jake', at, kind: 'comment_added', detail: { company_id: 'c-sms', from_company: false, author_name: null, internal: false, body: 'Can you come Tuesday?' } },
      { id: 'a3', jobId: 'j', itemId: 'door', personId: 'jake', at, kind: 'comment_added', detail: { company_id: 'c-sms', from_company: false, internal: true, body: 'Check the pantry door' } },
    ];
    const lookups2 = activityLookups({ people: [{ id: 'jake', email: '', name: 'Jake Ross', active: true }], items: [door], locations: rooms, companies: lookups.companies, trades: [], visits: [], customFields: [] });
    const lines = activityLines(entries, lookups2);
    expect(lines.map((l) => `${l.who} ${l.action}`).sort()).toEqual([
      'Jake Ross added a Ross Built only note on Adjust cabinet door',
      'Jake Ross commented on the SMS Carpentry list',
      'Mike at SMS Carpentry commented on Adjust cabinet door',
    ]);
    expect(lines.find((l) => l.who.startsWith('Mike'))?.detail).toBe('Kitchen 109. Coming Tuesday with a new hinge.');
    expect(activityLines(entries, lookups2, { forItem: true })).toEqual([]);
  });

  it('leaves a comment its writer took back out of Activity', () => {
    const at = '2026-10-31T13:00:00.000Z';
    const said = (id: string, body: string): Activity => ({
      id: `a-${id}`,
      jobId: 'j',
      itemId: 'door',
      personId: 'jake',
      at,
      kind: 'comment_added',
      detail: { comment_id: id, company_id: 'c-sms', from_company: false, internal: false, body },
    });
    const kept = { ...comments[0]!, id: 'kept' };
    const gone = { ...comments[0]!, id: 'gone', body: 'Wrong item.', removed: true };
    const people = [{ id: 'jake', email: '', name: 'Jake Ross', active: true }];
    const look2 = activityLookups({ people, items: [door], locations: rooms, companies: lookups.companies, trades: [], visits: [], customFields: [], comments: [kept, gone] });
    expect(activityLines([said('kept', 'The left one drags too.'), said('gone', 'Wrong item.')], look2).map((l) => l.detail)).toEqual(['Kitchen 109. The left one drags too.']);
  });

  it("prints under each item and on the company's list, never the Ross Built only ones", () => {
    const settings = {
      job: { name: 'Fish', address: '' },
      date: new Date(2026, 9, 31),
      comments: (id: string) => itemComments(comments, id, { shared: true }).map((c) => ({ who: commentAuthor(c, look), at: c.createdAt, body: c.body })),
      listComments: listComments(comments, 'c-sms', { shared: true }).map((c) => ({ who: commentAuthor(c, look), at: c.createdAt, body: c.body })),
    };
    const page = companyPrintout(companyList('c-sms', [door], lookups), settings).body;
    expect(page).toContain('<b>Mike at SMS Carpentry</b>, October 30: Coming Tuesday with a new hinge.');
    expect(page).toContain('<b>Jake Ross</b>, October 30: The left one drags too.');
    expect(page).toContain('<h2 class="rb-section">Comments</h2>');
    expect(page).toContain('We can do all the trim Monday and Tuesday.');
    expect(page).not.toContain('pantry');
    const made = customPrintout(filteredLines([door], NO_FILTERS, lookups), DEFAULT_LIST_DESIGN, settings).body;
    expect(made).toContain('Coming Tuesday with a new hinge.');
    const without = customPrintout(filteredLines([door], NO_FILTERS, lookups), { ...DEFAULT_LIST_DESIGN, details: ['status'] }, settings).body;
    expect(without).not.toContain('Coming Tuesday');
  });
});
