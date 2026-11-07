// Who an item is assigned to: one field, Assigned To, for a company or someone on your own team. A
// company gets the item on its list, its page and its emails; someone on the team gets it on their
// My Items. Picking one clears the other. It is kept in the two columns it always was, company_id
// and assigned_to, so everything a company's list does works as it did.

import type { Item } from './types';

type Assigned = Pick<Item, 'companyId' | 'assignedTo'>;

/** The start of a person's key, where a company's key is its id alone. */
export const PERSON_KEY = 'person:';

/** The key for someone on the team, in a picker or a group. */
export const personKey = (personId: string) => `${PERSON_KEY}${personId}`;

/** The person in a key, or null for a company's key. */
export const personOfKey = (key: string): string | null => (key.startsWith(PERSON_KEY) ? key.slice(PERSON_KEY.length) : null);

/** What it reads when an item is assigned to no one yet: a draft, or one from before the rule. */
export const NOT_ASSIGNED = 'Not assigned';

/** Whoever an item is assigned to, as a key: the company's id, or the person's key. Null for no one. */
export function assigneeKey(item: Assigned): string | null {
  return item.companyId ?? (item.assignedTo ? personKey(item.assignedTo) : null);
}

/** The fields to save for an assignee picked by its key: a company clears the person, and a person the company. */
export function assigneeFields(key: string | null): Assigned {
  if (!key) return { companyId: null, assignedTo: null };
  const person = personOfKey(key);
  return person ? { companyId: null, assignedTo: person } : { companyId: key, assignedTo: null };
}

/** Assigned to a company or to someone on the team. */
export const isAssigned = (item: Partial<Assigned>) => !!item.companyId || !!item.assignedTo;

export interface AssigneeNames {
  companies: Map<string, string>;
  people: Map<string, string>;
}

/** The name for an assignee's key. */
export function keyName(key: string, names: AssigneeNames): string | undefined {
  const person = personOfKey(key);
  return person ? names.people.get(person) : names.companies.get(key);
}

/**
 * The name of whoever an item is assigned to, or null. The company when an item from before the two
 * were one field has both: the company is the one doing the work.
 */
export function assigneeName(item: Assigned, names: AssigneeNames): string | null {
  const key = assigneeKey(item);
  return key ? (keyName(key, names) ?? null) : null;
}
