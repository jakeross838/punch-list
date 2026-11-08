// A company's report card on a job: what is open, what it finished in the last 30 days and how long
// its work took on average, what is past its visit, and when it last opened its page. Nudge: a
// company that has not opened its page in a week, or has open work it has not confirmed, gets a
// short reminder with its link.

import { greeting, jobPlace } from './emails';
import { daysBetween, dayOfDate, visitEnd } from './dates';
import type { Contact, Item, Job, Person, Visit } from './types';

export interface ReportCard {
  open: number;
  /** Finished in the last 30 days. */
  finished: number;
  /** Days from being put on the list to done, on average, for what it finished in the last 90 days; null when none. */
  averageDays: number | null;
  /** Open work still open after its visit ended. */
  pastDue: number;
  /** Open work it has not confirmed. */
  unconfirmed: number;
  /** When it last opened its page, or null. */
  openedAt: string | null;
}

const DAY = 86_400_000;

export function reportCard(companyId: string, items: Item[], visits: Visit[], openedAt: string | null, now: Date): ReportCard {
  const today = dayOfDate(now);
  const mine = items.filter((i) => i.companyId === companyId && !i.unfinished);
  const open = mine.filter((i) => i.status === 'open');
  const ended = new Map(visits.filter((v) => !v.removed).map((v) => [v.id, visitEnd(v)]));
  const finishedSince = (days: number) => mine.filter((i) => i.status === 'complete' && i.completedAt && now.getTime() - Date.parse(i.completedAt) <= days * DAY);
  const took = finishedSince(90).map((i) => (Date.parse(i.completedAt!) - Date.parse(i.createdAt)) / DAY).filter((d) => Number.isFinite(d) && d >= 0);
  return {
    open: open.length,
    finished: finishedSince(30).length,
    averageDays: took.length > 0 ? Math.round((took.reduce((a, b) => a + b, 0) / took.length) * 10) / 10 : null,
    pastDue: open.filter((i) => {
      const end = i.visitId ? ended.get(i.visitId) : undefined;
      return !!end && end < today;
    }).length,
    unconfirmed: open.filter((i) => !i.confirmedAt && !i.markedDoneAt).length,
    openedAt,
  };
}

/** "4.5 days", "1 day", "Less than a day". */
export function averageDaysText(days: number | null): string {
  if (days === null) return 'None yet';
  if (days < 1) return 'Under a day';
  const shown = days >= 10 ? Math.round(days) : Math.round(days * 10) / 10;
  return `${shown} ${shown === 1 ? 'day' : 'days'}`;
}

/** How long a page goes unopened before its company gets a nudge. */
export const NUDGE_AFTER_DAYS = 7;
/** How long open work waits to be confirmed before its company gets a nudge. */
export const CONFIRM_WITHIN_DAYS = 3;

/** Why a company could use a nudge, in a few words, or null when it does not. */
export function nudgeReason(card: ReportCard, items: Item[], companyId: string, now: Date, linkMadeAt: string | null): string | null {
  if (card.open === 0) return null;
  const since = card.openedAt ?? linkMadeAt;
  const unopened = since ? daysBetween(dayOfDate(new Date(since)), dayOfDate(now)) : null;
  if (card.openedAt === null && unopened !== null && unopened >= CONFIRM_WITHIN_DAYS) return `Has not opened their page since the link was made ${unopened} days ago`;
  if (card.openedAt !== null && unopened !== null && unopened >= NUDGE_AFTER_DAYS) return `Has not opened their page in ${unopened} days`;
  const waiting = items.filter(
    (i) => i.companyId === companyId && i.status === 'open' && !i.unfinished && !i.confirmedAt && !i.markedDoneAt && now.getTime() - Date.parse(i.createdAt) >= CONFIRM_WITHIN_DAYS * DAY,
  ).length;
  if (waiting > 0) return `${waiting === 1 ? '1 item' : `${waiting} items`} not confirmed in ${CONFIRM_WITHIN_DAYS} days`;
  return null;
}

/** The reminder, by text: short, with the link. */
export function nudgeText(input: { job: Pick<Job, 'name' | 'address'>; contacts: Pick<Contact, 'name'>[]; from: Pick<Person, 'name'> | null; company?: string; open: number; unconfirmed: number; link: string }): string {
  const hi = greeting(input.contacts).replace(/,$/, '');
  const confirm = input.unconfirmed > 0 ? ` Please confirm ${input.unconfirmed === 1 ? 'it' : 'them'} when you get a chance.` : '';
  const who = input.from?.name.trim().split(/\s+/)[0] || input.company?.trim() || '';
  return `${hi}, a quick reminder: you have ${input.open === 1 ? '1 item' : `${input.open} items`} open at ${jobPlace(input.job)}.${confirm} Your list is here: ${input.link}${who ? ` Thanks, ${who}` : ' Thanks.'}`;
}

/** The reminder, by email. */
export function nudgeEmail(input: Parameters<typeof nudgeText>[0]): { subject: string; body: string } {
  const place = jobPlace(input.job);
  const who = input.from?.name.trim().split(/\s+/)[0] || input.company?.trim() || '';
  const body = [
    greeting(input.contacts),
    '',
    `A quick reminder: you have ${input.open === 1 ? '1 item' : `${input.open} items`} open at ${place}.${input.unconfirmed > 0 ? ` Please confirm ${input.unconfirmed === 1 ? 'it' : 'them'} when you get a chance.` : ''} Your list is here, with the photos:`,
    input.link,
    '',
    ...(who ? ['Thanks,', who] : ['Thanks.']),
  ].join('\n');
  return { subject: `${place} Reminder`, body };
}
