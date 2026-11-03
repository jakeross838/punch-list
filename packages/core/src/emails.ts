// What goes out to the companies, in Jake's words: short, the attachments carrying the detail. A
// company's list goes to its people with the link to its page; the Schedule Email goes to every
// company on the job at once with the Three Week Look Ahead and the Whole Schedule attached. Either
// can be changed before it goes.

import type { Contact, Job, Person } from './types';

export interface Email {
  subject: string;
  body: string;
}

/** The job as the companies know it: its address, or its name when it has none. */
export const jobPlace = (job: Pick<Job, 'name' | 'address'>) => job.address.trim() || job.name.trim();

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** Who it is from: the first name of whoever sends it. */
const signedBy = (from: Pick<Person, 'name'> | null) => firstName(from?.name ?? '') || 'Ross Built';

/** "Hi Mike,", "Hi Mike and Dave,", "Hi everyone," or "Hi," with no names. */
export function greeting(contacts: Pick<Contact, 'name'>[]): string {
  const names = [...new Set(contacts.map((c) => firstName(c.name)).filter(Boolean))];
  if (names.length === 0) return 'Hi,';
  if (names.length <= 2) return `Hi ${names.join(' and ')},`;
  return 'Hi everyone,';
}

/** A company's list, to its people. ready: how many of its items can be done any time. */
export function companyListEmail(input: { job: Pick<Job, 'name' | 'address'>; contacts: Pick<Contact, 'name'>[]; link: string | null; from: Pick<Person, 'name'> | null; ready: number }): Email {
  const place = jobPlace(input.job);
  const lines = [
    greeting(input.contacts),
    '',
    `Here is your current list for ${place}. Take a look and let me know if anything is missing or needs adjusting.${
      input.ready > 0 ? ' Anything marked ready can be done any time, so if you have an open day I would love to get those cleared out.' : ''
    }`,
  ];
  if (input.link) {
    lines.push('', 'Your dates and the list with photos are on your page, where you can confirm your dates, ask for other ones, or comment on anything:', input.link);
  }
  lines.push('', 'Thanks,', signedBy(input.from));
  return { subject: `${place} Completion List`, body: lines.join('\n') };
}

/** A company's list as a text, for people with a phone and no email. */
export function companyListText(input: { job: Pick<Job, 'name' | 'address'>; contacts: Pick<Contact, 'name'>[]; link: string | null; from: Pick<Person, 'name'> | null }): string {
  const hi = greeting(input.contacts).replace(/,$/, '');
  const page = input.link ? ` Your dates and photos are on your page: ${input.link}` : '';
  return `${hi}, here is your current list for ${jobPlace(input.job)}.${page} Thanks, ${signedBy(input.from)}`;
}

/** The Schedule Email to every company on the job. */
export function scheduleEmail(input: { job: Pick<Job, 'name' | 'address'>; from: Pick<Person, 'name'> | null }): Email {
  const place = jobPlace(input.job);
  const body = [
    'Hi everyone,',
    '',
    `Attached are the Three Week Look Ahead and the Whole Schedule for ${place}. Green is confirmed and blue is our best guess, and the goal is to get everything green, earliest first.`,
    '',
    'Please look over your dates and let me know if they work, or if anything is missing or needs to change. You can confirm your dates on your page, from the link on your list.',
    '',
    'Thanks,',
    signedBy(input.from),
  ].join('\n');
  return { subject: `${place} Construction Schedule`, body };
}
