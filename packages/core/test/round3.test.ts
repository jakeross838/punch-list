import { describe, expect, it } from 'vitest';
import {
  CLAUDE_TASKS,
  companySummaryInput,
  isClaudeTask,
  ownerUpdateInput,
  readCompanySummary,
  readOwnerUpdate,
  readTranslations,
  taskPrompt,
  translatePrompt,
} from '../src/index';

describe("the owner's weekly update", () => {
  const week = {
    job: 'Smith Residence',
    builder: 'Ross Built',
    from: 'Jake',
    owner: 'Karen',
    done: [
      { title: 'Install towel bar', location: 'Bathroom 116' },
      { title: 'Touch up paint', location: 'Kitchen 109' },
    ],
    open: 42,
    openBy: [{ location: 'Kitchen 109', open: 12 }],
    waiting: [{ title: 'Pick shower tile', location: 'Bathroom 116' }],
    sent: [{ words: 'Scratch on the pantry door', status: 'on_list' }],
    coming: [{ day: 'Tuesday, November 10', trade: 'Painting' }],
  };

  it('asks from the week as the owner sees it: trades, never companies or prices', () => {
    expect(isClaudeTask('owner-update')).toBe(true);
    expect(CLAUDE_TASKS['owner-update'].tier).toBe('sharp');
    const words = taskPrompt('owner-update', week);
    expect(words).toContain('It is from Jake, to Karen.');
    expect(words).toContain('Finished this week (2):');
    expect(words).toContain('- Install towel bar (Bathroom 116)');
    expect(words).toContain('Still open: 42 items, most in Kitchen 109 (12).');
    expect(words).toContain('- Pick shower tile (Bathroom 116)');
    expect(words).toContain('- "Scratch on the pantry door": on the list');
    expect(words).toContain('- Tuesday, November 10: Painting');
    expect(words).toContain('Name trades, never companies');
    expect(words).toContain('Close by wishing them a good weekend');
    expect(words).toContain('Keep it positive, and single no one out');
    // A quiet week still says so, rather than leaving Claude to guess.
    const quiet = taskPrompt('owner-update', { ...week, done: [], waiting: [], coming: [], sent: [] });
    expect(quiet).toContain('Nothing on the list was finished this week.');
    expect(quiet).toContain('Nothing is waiting on the owner.');
    expect(quiet).toContain('No one is scheduled for the next week yet.');
  });

  it('takes only what the phone could send, and asks only when there is something to say', () => {
    const x = ownerUpdateInput({ ...week, open: -3, sent: [{ words: 'Fix it', status: 'paid' }], coming: [{ day: 'Monday' }] });
    expect(x.open).toBe(0);
    expect(x.sent).toEqual([]);
    expect(x.coming).toEqual([]);
    expect(CLAUDE_TASKS['owner-update'].enough({ job: 'Smith Residence' })).toBe(false);
    expect(CLAUDE_TASKS['owner-update'].enough(week)).toBe(true);
  });

  it('reads the update, with no dashes', () => {
    expect(readOwnerUpdate('{"subject": "This week — Smith Residence", "body": "Hi Karen,\\n\\n\\n\\nThe bath is done — towel bars and all.\\n\\nJake"}')).toEqual({
      subject: 'This week, Smith Residence',
      body: 'Hi Karen,\n\nThe bath is done, towel bars and all.\n\nJake',
    });
    expect(readOwnerUpdate('{"subject": "Hi"}')).toBeNull();
    expect(readOwnerUpdate('not json')).toBeNull();
  });
});

describe("the companies' answers, summed up", () => {
  it('asks from what each company did on its page, and reads only the companies given', () => {
    expect(CLAUDE_TASKS['company-summary'].tier).toBe('quick');
    const input = {
      days: 7,
      lines: [
        { company: 'Triple H Painting', text: 'Mike at Triple H Painting confirmed Patch drywall. Laundry 119. From their page.' },
        { company: 'SMS Carpentry', text: 'SMS Carpentry commented on Install base. Asked if the base is stain grade.' },
      ],
    };
    const words = taskPrompt('company-summary', input);
    expect(words).toContain('in the last 7 days');
    expect(words).toContain('- SMS Carpentry: SMS Carpentry commented on Install base.');
    expect(CLAUDE_TASKS['company-summary'].enough({ days: 7, lines: [] })).toBe(false);
    expect(companySummaryInput({ days: 400, lines: [{ company: '', text: 'x' }] })).toEqual({ days: 31, lines: [] });
    const said = readCompanySummary(
      '{"companies": [{"name": "sms carpentry", "summary": "Asked whether the base is stain grade", "needsAnswer": true}, {"name": "Made Up Co", "summary": "Nothing."}, {"name": "SMS Carpentry", "summary": "Again."}, {"name": "Triple H Painting", "summary": "Confirmed the drywall patch — Laundry 119."}]}',
      ['Triple H Painting', 'SMS Carpentry'],
    );
    expect(said).toEqual([
      { name: 'SMS Carpentry', summary: 'Asked whether the base is stain grade.', needsAnswer: true },
      { name: 'Triple H Painting', summary: 'Confirmed the drywall patch, Laundry 119.', needsAnswer: false },
    ]);
    expect(readCompanySummary('{"companies": "none"}', ['SMS Carpentry'])).toEqual([]);
  });
});

describe("a company's page in Spanish", () => {
  it('asks for each line in order, and reads a translation for each, or none', () => {
    const words = translatePrompt(['Install towel bar', 'Left of the vanity,\n18 inches up']);
    expect(words).toContain('1. Install towel bar');
    expect(words).toContain('2. Left of the vanity, 18 inches up');
    expect(words).toContain('Keep names, room names and numbers');
    expect(readTranslations('{"es": ["Instalar toallero", "A la izquierda del lavabo"]}', 2)).toEqual(['Instalar toallero', 'A la izquierda del lavabo']);
    // A list that does not line up is not trusted at all: the page shows the English.
    expect(readTranslations('{"es": ["Instalar toallero"]}', 2)).toEqual([null, null]);
    expect(readTranslations('{"es": ["Instalar toallero", "  "]}', 2)).toEqual(['Instalar toallero', null]);
    // Translating is the page function's own work, never a task the phone can ask for.
    expect(isClaudeTask('translate')).toBe(false);
  });
});

import { averageDaysText, nudgeEmail, nudgeReason, nudgeText, ownerWeek, reportCard, waitsOnOwner, type Item, type Visit } from '../src/index';

const base = (over: Partial<Item>): Item => ({
  id: 'i', jobId: 'j', locationId: 'kitchen', number: 1, assignedTo: null, title: 'Adjust cabinet door', description: '', tradeId: null, companyId: 'sms',
  kind: 'completion', ready: true, waitingOn: [], waitingOnItems: [], readyBy: null, boughtOut: true, poOrCo: null, status: 'open', completedBy: null,
  completedAt: null, extra: {}, unfinished: false, visitId: null, hours: null, source: 'typed', btExternalId: null, createdBy: 'jake',
  createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', ...over,
});
const visit = (over: Partial<Visit>): Visit => ({
  id: 'v', jobId: 'j', companyId: 'sms', start: '2026-11-02', days: 2, confirmed: true, note: '', removed: false, askedStart: null, askedDays: null, askedName: null, askedAt: null,
  createdBy: 'jake', createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z', ...over,
});

describe("the owner's week", () => {
  it('knows what waits on the owner, however it is written', () => {
    expect(waitsOnOwner(['Countertops', ' Owner '])).toBe(true);
    expect(waitsOnOwner(['Homeowner'])).toBe(true);
    expect(waitsOnOwner(['Owner selections'])).toBe(false);
  });

  it('gathers the week: done, open by room, waiting on the owner, what they sent and who is coming, by trade', () => {
    const now = new Date(2026, 10, 9, 9, 0);
    const week = ownerWeek({
      job: { name: 'Fish Residence' },
      builder: 'Ross Built',
      from: 'Jake',
      owner: 'Karen',
      now,
      locations: [
        { id: 'kitchen', jobId: 'j', name: 'Kitchen', number: '109', label: 'Kitchen 109', floor: 'Level 1', kind: 'room', sortOrder: 1, active: true, walkedAt: null },
        { id: 'bath', jobId: 'j', name: 'Bath', number: '116', label: 'Bath 116', floor: 'Level 1', kind: 'room', sortOrder: 2, active: true, walkedAt: null },
      ],
      items: [
        base({ id: 'd1', title: 'Install towel bar', locationId: 'bath', status: 'complete', completedAt: '2026-11-06T15:00:00.000Z' }),
        base({ id: 'd0', title: 'Old work', status: 'complete', completedAt: '2026-10-20T15:00:00.000Z' }),
        base({ id: 'o1' }),
        base({ id: 'o2', locationId: 'bath', title: 'Pick shower tile', ready: false, waitingOn: ['Owner'] }),
        base({ id: 'o3' }),
        base({ id: 's1', source: 'owner', unfinished: true, title: '', description: 'Scratch on the pantry door', createdAt: '2026-11-08T12:00:00.000Z' }),
        base({ id: 'x', status: 'removed', title: 'Gone' }),
      ],
      visits: [
        visit({ id: 'v1', companyId: 'paint', start: '2026-11-10' }),
        visit({ id: 'v2', companyId: 'paint', start: '2026-11-10' }),
        visit({ id: 'v3', companyId: 'sms', start: '2026-11-30' }),
        visit({ id: 'v4', companyId: 'sms', start: '2026-11-12', removed: true }),
      ],
      jobCompanies: [{ jobId: 'j', companyId: 'paint', tradeId: 'painting' }],
      trades: [{ id: 'painting', name: 'Painting', sortOrder: 1 }],
      companies: [{ id: 'paint', defaultTradeId: null }, { id: 'sms', defaultTradeId: null }],
    });
    expect(week.done).toEqual([{ title: 'Install towel bar', location: 'Bath 116' }]);
    expect(week.open).toBe(3);
    expect(week.openBy).toEqual([{ location: 'Kitchen 109', open: 2 }, { location: 'Bath 116', open: 1 }]);
    expect(week.waiting).toEqual([{ title: 'Pick shower tile', location: 'Bath 116' }]);
    expect(week.sent).toEqual([{ words: 'Scratch on the pantry door', status: 'received' }]);
    expect(week.coming).toEqual([{ day: 'Tuesday, November 10', trade: 'Painting' }]);
    expect(week.owner).toBe('Karen');
  });
});

describe("a company's report card, and Nudge", () => {
  const now = new Date(2026, 10, 9, 9, 0);
  const items = [
    base({ id: 'a', status: 'complete', createdAt: '2026-11-01T12:00:00.000Z', completedAt: '2026-11-05T12:00:00.000Z' }),
    base({ id: 'b', status: 'complete', createdAt: '2026-11-01T12:00:00.000Z', completedAt: '2026-11-02T12:00:00.000Z' }),
    base({ id: 'c', visitId: 'v1', confirmedAt: '2026-11-02T12:00:00.000Z' }),
    base({ id: 'd', createdAt: '2026-11-08T12:00:00.000Z' }),
    base({ id: 'e', companyId: 'other' }),
    base({ id: 'f', unfinished: true }),
  ];

  it('counts what is open, finished lately, how long it took, what is past its visit and what is not confirmed', () => {
    const card = reportCard('sms', items, [visit({ id: 'v1', start: '2026-11-02', days: 2 })], '2026-11-08T14:00:00.000Z', now);
    expect(card).toEqual({ open: 2, finished: 2, averageDays: 2.5, pastDue: 1, unconfirmed: 1, openedAt: '2026-11-08T14:00:00.000Z' });
    expect(averageDaysText(card.averageDays)).toBe('2.5 days');
    expect(averageDaysText(null)).toBe('None yet');
    expect(averageDaysText(0.4)).toBe('Under a day');
  });

  it('nudges a company that has not opened its page in a week, never opened it, or has not confirmed its work', () => {
    const vs = [visit({ id: 'v1' })];
    const recent = reportCard('sms', items, vs, '2026-11-08T14:00:00.000Z', now);
    expect(nudgeReason(recent, items, 'sms', now, '2026-10-01T12:00:00.000Z')).toBeNull();
    const stale = reportCard('sms', items, vs, '2026-10-30T14:00:00.000Z', now);
    expect(nudgeReason(stale, items, 'sms', now, '2026-10-01T12:00:00.000Z')).toBe('Has not opened their page in 10 days');
    const never = reportCard('sms', items, vs, null, now);
    expect(nudgeReason(never, items, 'sms', now, '2026-11-04T12:00:00.000Z')).toBe('Has not opened their page since the link was made 5 days ago');
    const old = [...items, base({ id: 'g', createdAt: '2026-11-01T12:00:00.000Z' })];
    expect(nudgeReason(reportCard('sms', old, vs, '2026-11-08T14:00:00.000Z', now), old, 'sms', now, null)).toBe('1 item not confirmed in 3 days');
    // Nothing open: nothing to nudge about.
    expect(nudgeReason(reportCard('other-co', items, vs, null, now), items, 'other-co', now, '2026-10-01T12:00:00.000Z')).toBeNull();
  });

  it('words the reminder, short, with the link', () => {
    const input = { job: { name: 'Fish Residence', address: '715 North Shore Drive' }, contacts: [{ name: 'Mike Smith' }], from: { name: 'Jake Ross' }, open: 3, unconfirmed: 2, link: 'https://punch-list.expo.app/c#abc' };
    expect(nudgeText(input)).toBe(
      'Hi Mike, a quick reminder: you have 3 items open at 715 North Shore Drive. Please confirm them when you get a chance. Your list is here: https://punch-list.expo.app/c#abc Thanks, Jake',
    );
    const email = nudgeEmail({ ...input, unconfirmed: 0, open: 1 });
    expect(email.subject).toBe('715 North Shore Drive Reminder');
    expect(email.body).toBe('Hi Mike,\n\nA quick reminder: you have 1 item open at 715 North Shore Drive. Your list is here, with the photos:\nhttps://punch-list.expo.app/c#abc\n\nThanks,\nJake');
    expect(nudgeText(input)).not.toMatch(/[–—-]{1}\s/);
  });
});
