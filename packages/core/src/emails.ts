// What goes out to the companies: short, the attached list carrying the detail. A company's list
// goes to its people by email, or by text to anyone with only a phone, and either can be changed
// before it goes. The Schedule Email is kept for when the schedule comes back.

import type { Contact, Job, Person } from './types';

export interface Email {
  subject: string;
  body: string;
}

/** The job as the companies know it: its address, or its name when it has none. */
export const jobPlace = (job: Pick<Job, 'name' | 'address'>) => job.address.trim() || job.name.trim();

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** Who it is from: the first name of whoever sends it, or their company when they have no name yet. */
const signedBy = (from: Pick<Person, 'name'> | null, company = '') => firstName(from?.name ?? '') || company.trim();

/** The last lines: "Thanks," and who it is from, or only "Thanks." */
const thanks = (from: Pick<Person, 'name'> | null, company?: string) => {
  const who = signedBy(from, company);
  return who ? ['Thanks,', who] : ['Thanks.'];
};

/** "Hi Mike,", "Hi Mike and Dave,", "Hi everyone," or "Hi," with no names. */
export function greeting(contacts: Pick<Contact, 'name'>[]): string {
  const names = [...new Set(contacts.map((c) => firstName(c.name)).filter(Boolean))];
  if (names.length === 0) return 'Hi,';
  if (names.length <= 2) return `Hi ${names.join(' and ')},`;
  return 'Hi everyone,';
}

/** A company's list, to its people. ready: how many of its items can be done any time. company: whose list it is, to sign with when the sender has no name. */
export function companyListEmail(input: { job: Pick<Job, 'name' | 'address'>; contacts: Pick<Contact, 'name'>[]; from: Pick<Person, 'name'> | null; company?: string; ready: number }): Email {
  const place = jobPlace(input.job);
  const lines = [
    greeting(input.contacts),
    '',
    `Here is your current list for ${place}. Take a look and let me know if anything is missing or needs adjusting.${
      input.ready > 0 ? ' Anything marked ready can be done any time, so if you have an open day I would love to get those cleared out.' : ''
    }`,
  ];
  lines.push('', ...thanks(input.from, input.company));
  return { subject: `${place} Completion List`, body: lines.join('\n') };
}

/** A company's list as a text, for people with a phone and no email. */
export function companyListText(input: { job: Pick<Job, 'name' | 'address'>; contacts: Pick<Contact, 'name'>[]; from: Pick<Person, 'name'> | null; company?: string }): string {
  const hi = greeting(input.contacts).replace(/,$/, '');
  return `${hi}, here is your current list for ${jobPlace(input.job)}. Let me know if anything is missing. ${thanks(input.from, input.company).join(' ')}`;
}

/** The Schedule Email to every company on the job. */
export function scheduleEmail(input: { job: Pick<Job, 'name' | 'address'>; from: Pick<Person, 'name'> | null; company?: string }): Email {
  const place = jobPlace(input.job);
  const body = [
    'Hi everyone,',
    '',
    `Attached are the Three Week Look Ahead and the Whole Schedule for ${place}. Green is confirmed and blue is our best guess, and the goal is to get everything green, earliest first.`,
    '',
    'Please look over your dates and let me know if they work, or if anything is missing or needs to change. You can confirm your dates on your page, from the link on your list.',
    '',
    ...thanks(input.from, input.company),
  ].join('\n');
  return { subject: `${place} Construction Schedule`, body };
}
