import { describe, expect, it } from 'vitest';
import {
  activityLines,
  CLAUDE_MODELS,
  CLAUDE_TASKS,
  cleanMark,
  costCents,
  closeMatches,
  closePairs,
  isClaudeTask,
  keeperOf,
  likeness,
  mergedWaits,
  pairKey,
  readDuplicates,
  readSameItem,
  readSayIt,
  readStandardTitle,
  readSuggestions,
  recentAssignees,
  repeatedTitles,
  standardFor,
  suggestContext,
  taskPrompt,
  thingWords,
  vagueTitle,
  worthMatching,
  type Activity,
  type Item,
  type SuggestContext,
} from '../src/index';

let n = 0;
function item(over: Partial<Item> = {}): Item {
  n += 1;
  return {
    id: `i${n}`,
    jobId: 'j1',
    locationId: 'kitchen',
    number: n,
    assignedTo: null,
    title: 'Install towel bar',
    description: '',
    tradeId: null,
    companyId: null,
    kind: 'completion',
    ready: true,
    waitingOn: [],
    waitingOnItems: [],
    readyBy: null,
    boughtOut: false,
    poOrCo: null,
    status: 'open',
    completedBy: null,
    completedAt: null,
    source: 'typed',
    extra: {},
    unfinished: false,
    visitId: null,
    hours: null,
    btExternalId: null,
    createdBy: 'jake',
    createdAt: `2026-11-0${Math.min(9, n)}T12:00:00.000Z`,
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...over,
  };
}

const ctx: SuggestContext = {
  room: 'Kitchen 109',
  titles: [{ title: 'Adjust cabinet door', trade: 'Carpentry', hours: 0.5 }],
  companies: [
    { name: 'SMS Carpentry', trade: 'Carpentry' },
    { name: 'Triple H Painting', trade: 'Painting' },
  ],
  trades: ['Carpentry', 'Painting'],
  marks: [],
};

describe("Claude's tasks", () => {
  it('knows only its own tasks, and asks each in its own words', () => {
    expect(isClaudeTask('fill-in')).toBe(true);
    expect(isClaudeTask('write-me-a-poem')).toBe(false);
    expect(isClaudeTask('toString')).toBe(false);
    expect(CLAUDE_TASKS['same-item'].tier).toBe('quick');
    expect(CLAUDE_TASKS['fill-in'].tier).toBe('sharp');
    expect(taskPrompt('standard-title', { title: 'towel bar loose', titles: ['Tighten towel bar'] })).toContain('They typed: "towel bar loose"');
  });

  it('asks only when there is something to ask about', () => {
    expect(CLAUDE_TASKS['say-it'].enough({ words: '   ' })).toBe(false);
    expect(CLAUDE_TASKS['say-it'].enough({ words: 'touch up the paint in the hall' })).toBe(true);
    expect(CLAUDE_TASKS['same-item'].enough({ item: { title: 'Install towel bar' }, candidates: [] })).toBe(false);
    expect(CLAUDE_TASKS['same-item'].enough({ item: { title: 'Install towel bar' }, candidates: [{ n: 4, title: 'Towel bar install' }] })).toBe(true);
    expect(CLAUDE_TASKS.duplicates.enough({ pairs: [{ n: 1, a: { title: 'A' } }] })).toBe(false);
    expect(CLAUDE_TASKS['standard-title'].enough({ title: 'towel bar loose', titles: [] })).toBe(false);
    expect(CLAUDE_TASKS['fill-in'].minImages).toBe(1);
    expect(CLAUDE_TASKS['say-it'].images).toBe(0);
  });

  it('takes only what a phone could have sent: text cut short, odd marks left out', () => {
    const long = 'x'.repeat(5000);
    const prompt = taskPrompt('fill-in', { ...ctx, room: long, words: `cabinet door rubs ${long}`, marks: [{ tool: 'circle', from: [0.1, 0.2], to: [0.3, 0.4] }, { tool: 'circle' }, 'junk', { tool: 'text', at: [2, -1], text: long }] });
    expect(prompt).toContain('The photo was taken in ' + 'x'.repeat(60) + '.');
    expect(prompt).toContain('They also said or typed: "cabinet door rubs');
    expect(prompt).not.toContain('x'.repeat(401));
    expect(prompt).toContain('A red circle around the area from 10% to 30% across');
    // The note's spot is kept on the photo and its words are cut short.
    expect(prompt).toContain(`A note reading "${'x'.repeat(60)}" at 100% across and 0% down.`);
    expect(cleanMark({ tool: 'number', at: [0.5, 0.5], n: 3, color: 'purple' })).toEqual({ tool: 'number', color: 'red', at: [0.5, 0.5], n: 3 });
    expect(cleanMark({ tool: 'pen', points: [] })).toBeNull();
    expect(taskPrompt('say-it', { words: 'a', locations: Array.from({ length: 400 }, (_, i) => `Room ${i}`) }).match(/- Room \d+/g)).toHaveLength(300);
  });

  it('reads several items from one photo, each checked, the same title once', () => {
    const answer = {
      title: 'adjust cabinet door',
      description: 'Upper left rubs.',
      trade: 'Carpentry',
      company: 'SMS Carpentry',
      others: [{ title: 'Touch up paint', description: 'Above the hood.', trade: 'Painting', company: 'Triple H Painting' }, { title: 'Adjust cabinet door' }, { description: 'no title' }],
    };
    expect(readSuggestions(answer, ctx).map((s) => [s.title, s.company, s.hours])).toEqual([
      ['Adjust cabinet door', 'SMS Carpentry', 0.5],
      ['Touch up paint', 'Triple H Painting', null],
    ]);
    expect(readSuggestions({ description: 'nothing' }, ctx)).toEqual([]);
    expect(suggestContext({ location: 'Kitchen 109', words: '  rubs  ', titles: [], trades: [], companies: [], jobCompanies: [], marks: [] }).words).toBe('rubs');
  });

  it("reads what was heard, with the job's own locations and people only", () => {
    const input = { locations: ['Kitchen 109', 'Master Bath 207'], companies: [{ name: 'SMS Carpentry', trade: 'Carpentry' }], people: ['Sam Lee'] };
    const heard = readSayIt(
      '```json\n{"items": [{"title": "adjust cabinet door.", "description": "upper left rubs", "location": "kitchen 109", "assignedTo": "sms carpentry"}, {"title": "Caulk tub", "location": "Guest Bath", "assignedTo": "Bob", "waitingOn": "tile grout to cure"}, {"title": ""}, {"title": "Order towel bar", "assignedTo": "Sam Lee"}]}\n```',
      input,
    );
    expect(heard).toEqual([
      { title: 'Adjust cabinet door', description: 'Upper left rubs', location: 'Kitchen 109', assignedTo: 'SMS Carpentry', waitingOn: null },
      { title: 'Caulk tub', description: '', location: null, assignedTo: null, waitingOn: 'tile grout to cure' },
      { title: 'Order towel bar', description: '', location: null, assignedTo: 'Sam Lee', waitingOn: null },
    ]);
    expect(readSayIt('no json here', input)).toEqual([]);
  });

  it('reads which item is the same work, which pairs are, and which standard title', () => {
    expect(readSameItem('{"same": 12}', [4, 12])).toBe(12);
    expect(readSameItem('{"same": "#4"}', [4, 12])).toBe(4);
    expect(readSameItem('{"same": 99}', [4, 12])).toBeNull();
    expect(readSameItem('{"same": null}', [4])).toBeNull();
    expect(readDuplicates('{"same": [1, 3, 3, 9]}', [1, 2, 3])).toEqual([1, 3]);
    expect(readDuplicates('{"same": "1"}', [1])).toEqual([]);
    expect(readStandardTitle('{"title": "tighten towel bar"}', ['Tighten towel bar'])).toBe('Tighten towel bar');
    expect(readStandardTitle('{"title": "Something new"}', ['Tighten towel bar'])).toBeNull();
  });
});

describe('the same work written twice', () => {
  it('compares the words that name the thing, not what to do to it', () => {
    expect([...thingWords('Install towel bars, loose')]).toEqual(['towel', 'bar']);
    expect(likeness({ title: 'Towel bar loose', description: '' }, { title: 'Install towel bar', description: '' })).toBeCloseTo(1);
    expect(likeness({ title: 'Touch up paint', description: 'By the window' }, { title: 'Touch up paint', description: 'At the door' })).toBeGreaterThanOrEqual(0.85);
    expect(likeness({ title: 'Touch up paint by window', description: '' }, { title: 'Touch up paint at door', description: '' })).toBeLessThan(0.6);
    expect(likeness({ title: 'Fix', description: '' }, { title: 'Fix', description: '' })).toBe(0);
  });

  it('finds close matches in the same location only, among open items', () => {
    n = 0;
    const items = [
      item({ title: 'Towel bar loose' }),
      item({ title: 'Install towel bar', locationId: 'bath' }),
      item({ title: 'Towel bar crooked', status: 'complete' }),
      item({ title: 'Adjust cabinet door' }),
    ];
    const found = closeMatches({ locationId: 'kitchen', title: 'Install towel bar', description: '' }, items);
    expect(found.map((m) => m.item.title)).toEqual(['Towel bar loose']);
    expect(closeMatches({ locationId: '', title: 'Install towel bar', description: '' }, items)).toEqual([]);
    expect(closeMatches({ id: 'i1', locationId: 'kitchen', title: 'Towel bar loose', description: '' }, items)).toEqual([]);
  });

  it('pairs the close ones for Find Duplicates, leaves out pairs said to be different, and keeps the better one', () => {
    n = 0;
    const a = item({ title: 'Towel bar loose', unfinished: true });
    const b = item({ title: 'Install towel bar', companyId: 'sms' });
    const c = item({ title: 'Towel bar', locationId: 'bath' });
    expect(closePairs([a, b, c]).map((p) => [p.a.id, p.b.id])).toEqual([['i1', 'i2']]);
    expect(closePairs([a, b, c], new Set([pairKey('i2', 'i1')]))).toEqual([]);
    expect(keeperOf(a, b).map((i) => i.id)).toEqual(['i2', 'i1']);
    const older = item({ title: 'Towel bar loose' });
    const newer = item({ title: 'Install towel bar' });
    expect(keeperOf(newer, older)[0].id).toBe(older.id);
  });
});

describe('standard wording', () => {
  const titles = [
    { title: 'Install towel bar', approved: true },
    { title: 'Touch up paint', approved: true },
    { title: 'Not approved yet', approved: false },
  ];

  it('knows a standard title typed in another order, and when there is nothing to ask', () => {
    expect(standardFor('towel bar install', titles)).toBe('Install towel bar');
    expect(standardFor('Install towel bar', titles)).toBeNull();
    expect(standardFor('yet not approved', titles)).toBeNull();
    expect(worthMatching('towel bar is loose', titles)).toBe(true);
    expect(worthMatching('touch up paint', titles)).toBe(false);
    expect(worthMatching('Fix', titles)).toBe(false);
  });

  it('offers wording typed again and again, with the trade it is most often', () => {
    n = 0;
    const items = [
      item({ title: 'Caulk tub', tradeId: 'tile' }),
      item({ title: 'caulk tub.', tradeId: 'tile' }),
      item({ title: 'Caulk tub', tradeId: 'plumbing' }),
      item({ title: 'Caulk tub', status: 'removed' }),
      item({ title: 'Touch up paint' }),
      item({ title: 'Touch up paint' }),
      item({ title: 'Touch up paint' }),
    ];
    expect(repeatedTitles(items, titles)).toEqual([{ title: 'Caulk tub', uses: 3, tradeId: 'tile' }]);
  });

  it('flags a title too vague to send', () => {
    expect(vagueTitle('Fix')).toBe(true);
    expect(vagueTitle('needs repair')).toBe(true);
    expect(vagueTitle('Fix door')).toBe(false);
  });
});

describe('who goes first in Assigned To', () => {
  it("is whoever this person assigned their own items to lately, each once", () => {
    n = 0;
    const items = [
      item({ companyId: 'sms', createdAt: '2026-11-01T10:00:00Z' }),
      item({ assignedTo: 'sam', createdAt: '2026-11-03T10:00:00Z' }),
      item({ companyId: 'triple', createdAt: '2026-11-02T10:00:00Z' }),
      item({ companyId: 'sms', createdAt: '2026-11-04T10:00:00Z' }),
      item({ companyId: 'metro', createdAt: '2026-11-05T10:00:00Z', createdBy: 'sam' }),
      item({ companyId: 'gone', createdAt: '2026-11-06T10:00:00Z', status: 'removed' }),
    ];
    expect(recentAssignees(items, 'jake')).toEqual(['sms', 'person:sam', 'triple']);
    expect(recentAssignees(items, 'jake', 1)).toEqual(['sms']);
  });
});

describe('what waits, after a merge', () => {
  it('waits on the item kept instead, unless that would leave something waiting on itself', () => {
    n = 0;
    const keep = item({ id: 'keep' });
    const dupe = item({ id: 'dupe' });
    const waits = item({ id: 'waits', ready: false, waitingOnItems: ['dupe', 'other'] });
    const both = item({ id: 'both', ready: false, waitingOnItems: ['dupe', 'keep'] });
    const keptWaits = item({ id: 'keep2', ready: false, waitingOnItems: ['dupe'] });
    const done = item({ id: 'done', ready: false, waitingOnItems: ['dupe'], status: 'complete' });
    const other = item({ id: 'other' });
    const items = [keep, dupe, waits, both, done, other];
    const out = mergedWaits('keep', 'dupe', items);
    expect(out.get('waits')).toEqual(['keep', 'other']);
    expect(out.get('both')).toEqual(['keep']);
    expect(out.has('done')).toBe(false);
    // The kept item waiting on the merged one just stops waiting, when the merged one comes off.
    expect(mergedWaits('keep2', 'dupe', [keptWaits, dupe]).has('keep2')).toBe(false);
    // Kept is waiting on what waits on the merged one: that would be a loop.
    const loopKeep = item({ id: 'k', ready: false, waitingOnItems: ['b'] });
    const loopB = item({ id: 'b', ready: false, waitingOnItems: ['d'] });
    const loopD = item({ id: 'd' });
    expect(mergedWaits('k', 'd', [loopKeep, loopB, loopD]).size).toBe(0);
    // Nothing waits on a kept item that is done.
    expect(mergedWaits('keep', 'dupe', [{ ...keep, status: 'complete' }, dupe, waits]).size).toBe(0);
  });
});

describe('a merge in Activity', () => {
  it('says what was merged into what, and what came along', () => {
    const entry: Activity = {
      id: 'a1',
      jobId: 'j1',
      itemId: 'i8',
      personId: 'jake',
      at: '2026-11-07T12:00:00Z',
      kind: 'items_merged',
      detail: { from_number: 12, from_title: 'Towel bar loose', into_number: 8, into_title: 'Install towel bar', photos: 2, comments: 1 },
    } as Activity;
    const look = { people: new Map([['jake', 'Jake Ross']]), companies: new Map(), locations: new Map(), items: new Map(), takenBack: new Set<string>() } as never;
    const [line] = activityLines([entry], look);
    expect(line).toMatchObject({ who: 'Jake Ross', action: 'merged #12 Towel bar loose into #8 Install towel bar', detail: 'Its 2 photos and 1 comment came along.' });
  });
});

describe('what Claude costs', () => {
  it('counts each answer at its model’s price, in cents', () => {
    expect(costCents('claude-sonnet-5-5', { input_tokens: 1200, output_tokens: 300 })).toBe(0.54);
    expect(costCents('claude-sonnet-5-5-20260928', { input_tokens: 1_000_000 })).toBe(200);
    expect(costCents('claude-haiku-5-5', { input_tokens: 2000, output_tokens: 100 })).toBe(0.025);
    // Past 100,000 tokens of prompt, Haiku costs five times as much.
    expect(costCents('claude-haiku-5-5', { input_tokens: 200_000, output_tokens: 1000 })).toBe(10.25);
    // A model it does not know is counted high, never as free.
    expect(costCents('claude-something-new', { input_tokens: 1_000_000 })).toBe(400);
    expect(costCents('claude-sonnet-5-5', { input_tokens: -5, output_tokens: Number.NaN })).toBe(0);
    expect(CLAUDE_MODELS.quick).toBe('claude-haiku-5-5');
    expect(CLAUDE_MODELS.sharp).toBe('claude-sonnet-5-5');
  });
});
