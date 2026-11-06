// The people at a company and who does what. Two roles: an admin adds people, makes and closes jobs and
// changes the setup; the team walks jobs, adds items and checks them off. Each person sees every
// job or only the jobs they are on; admins see every job. A job's team says who is on it and as
// what. An item can be assigned to one person, and shows on their My Items.

import type { Item, Person, Role, Sees, TeamMember, TeamPart } from './types';

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', team: 'Team' };

export const ROLE_HINTS: Record<Role, string> = {
  admin: 'Adds people, makes and closes jobs, and changes the setup.',
  team: 'Walks jobs, adds items and checks them off.',
};

export const SEES_LABELS: Record<Sees, string> = { all: 'Every Job', assigned: 'Only Their Jobs' };

export const TEAM_PARTS: TeamPart[] = ['project_manager', 'superintendent', 'field'];

export const PART_LABELS: Record<TeamPart, string> = { project_manager: 'Project Manager', superintendent: 'Superintendent', field: 'Field' };

/** Whether this person changes the setup: people, jobs, a job's locations, companies and team, the standard titles and the added fields. */
export const isAdmin = (person: Pick<Person, 'role' | 'active'> | null | undefined): boolean => !!person && person.active && person.role === 'admin';

/** Whether this person sees a job: admins and people who see every job always; everyone else when they are on its team. */
export function seesJob(person: Pick<Person, 'id' | 'role' | 'sees' | 'active'> | null | undefined, jobId: string, team: Pick<TeamMember, 'jobId' | 'personId'>[]): boolean {
  if (!person || !person.active) return false;
  if (person.role === 'admin' || person.sees === 'all') return true;
  return team.some((t) => t.jobId === jobId && t.personId === person.id);
}

/** A job's team in the order it reads: project manager, superintendent, then the field, each by name. */
export function teamInOrder<T extends Pick<TeamMember, 'part' | 'personId'>>(team: T[], people: Pick<Person, 'id' | 'name'>[]): T[] {
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? '';
  return [...team].sort((a, b) => TEAM_PARTS.indexOf(a.part) - TEAM_PARTS.indexOf(b.part) || name(a.personId).localeCompare(name(b.personId)));
}

/** "Jake Ross, Project Manager" for the first of the team; the rest count. */
export function teamText(team: Pick<TeamMember, 'part' | 'personId'>[], people: Pick<Person, 'id' | 'name'>[]): string {
  const ordered = teamInOrder(team, people);
  const first = ordered[0];
  if (!first) return '';
  const name = people.find((p) => p.id === first.personId)?.name ?? 'Someone';
  const more = ordered.length - 1;
  return `${name}, ${PART_LABELS[first.part]}${more > 0 ? `, and ${more} more` : ''}`;
}

/** The open work assigned to a person, on the lists. */
export function assignedTo(items: Item[], personId: string): Item[] {
  return items.filter((i) => i.assignedTo === personId && i.status === 'open' && !i.unfinished);
}

/** An email as it is kept: trimmed and in lower case. */
export const tidyEmail = (email: string): string => email.trim().toLowerCase();

/** Whether an email looks like one. */
export const isEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tidyEmail(email));

/** People in the order lists show them: active first, then by name. */
export function peopleInOrder<T extends Pick<Person, 'name' | 'active'>>(people: T[]): T[] {
  return [...people].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}
