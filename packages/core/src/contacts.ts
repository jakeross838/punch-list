// The people at each company: who its lists go to, by email, or by text when they have a phone and
// no email. They belong to the company, so they get its lists on every job. The Schedule Email goes
// to every company on the job at once: to the person sending it, a copy to the rest of the job's
// team, and a blind copy to each company's people, so nobody sees anybody else's address.

import { isEmail, tidyEmail } from './people';
import type { Contact, Person, TeamMember } from './types';

export interface ContactFields {
  name: string;
  email: string | null;
  phone: string | null;
}

/** A contact as it is kept: the name and phone trimmed to single spaces, the email in lower case, blanks as nothing. */
export function tidyContact<T extends ContactFields>(c: T): T {
  const one = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');
  return { ...c, name: one(c.name), email: one(c.email) === '' ? null : tidyEmail(one(c.email)), phone: one(c.phone) === '' ? null : one(c.phone) };
}

/** What keeps a contact from saving, in a sentence, or null when it can. */
export function contactProblem(c: ContactFields): string | null {
  const t = tidyContact(c);
  if (t.name === '' && !t.email && !t.phone) return 'Give them a name, an email or a phone.';
  if (t.email && !isEmail(t.email)) return 'That email does not look right.';
  return null;
}

/** A company's people switched on, in order. */
export function contactsOf(contacts: Contact[], companyId: string): Contact[] {
  return contacts.filter((c) => c.companyId === companyId && c.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Who gets a company's lists: its people switched on who get the lists, in order. */
export function listContacts(contacts: Contact[], companyId: string): Contact[] {
  return contactsOf(contacts, companyId).filter((c) => c.getsLists);
}

/** How a company's list reaches it: by email to everyone with one, and by text to anyone with only a phone. */
export function listRecipients(contacts: Contact[], companyId: string): { emails: string[]; phones: string[]; people: Contact[] } {
  const people = listContacts(contacts, companyId);
  const emails = [...new Set(people.flatMap((c) => (c.email ? [c.email] : [])))];
  const phones = [...new Set(people.flatMap((c) => (!c.email && c.phone ? [c.phone] : [])))];
  return { emails, phones, people };
}

/** "Mike Smith, mike@smscarpentry.com, 941 555 0123" */
export function contactDetail(c: ContactFields): string {
  return [c.name, c.email, c.phone].filter((x): x is string => !!x && x.trim() !== '').join(', ');
}

export interface ScheduleRecipients {
  /** The person sending it. */
  to: string[];
  /** The rest of the job's team. */
  cc: string[];
  /** Every company's people who get the lists. */
  bcc: string[];
  /** The companies with nobody to send to by email. */
  without: string[];
}

/**
 * Who gets the Schedule Email: the person sending it, a copy to the rest of the job's team, and a
 * blind copy to the people at every company on it who get the lists.
 */
export function scheduleRecipients(input: {
  me: Pick<Person, 'id' | 'email'> | null;
  jobId: string;
  team: Pick<TeamMember, 'jobId' | 'personId'>[];
  people: Pick<Person, 'id' | 'email' | 'active'>[];
  companyIds: string[];
  contacts: Contact[];
}): ScheduleRecipients {
  const to = input.me?.email && isEmail(input.me.email) ? [tidyEmail(input.me.email)] : [];
  const cc = [
    ...new Set(
      input.team
        .filter((t) => t.jobId === input.jobId && t.personId !== input.me?.id)
        .flatMap((t) => {
          const p = input.people.find((x) => x.id === t.personId && x.active);
          return p && isEmail(p.email) ? [tidyEmail(p.email)] : [];
        })
        .filter((e) => !to.includes(e)),
    ),
  ];
  const bcc: string[] = [];
  const without: string[] = [];
  for (const companyId of input.companyIds) {
    const emails = listRecipients(input.contacts, companyId).emails.filter((e) => !to.includes(e) && !cc.includes(e));
    if (emails.length === 0 && listRecipients(input.contacts, companyId).emails.length === 0) without.push(companyId);
    for (const e of emails) if (!bcc.includes(e)) bcc.push(e);
  }
  return { to, cc, bcc, without };
}
