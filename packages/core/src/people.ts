// The people at a company and who does what. Four roles: an admin runs the company (its people,
// companies, templates and setup) and every job; a project manager makes jobs and sets them up; a
// superintendent walks jobs, adds items, sends lists and checks them off; View Only sees the jobs
// and comments. Each person sees every job or only the jobs they are on; admins and project
// managers see every job. A job's team says who is on it and as what. An item can be assigned to
// one person, and shows on their My Items.

import type { Item, Person, Role, Sees, TeamMember, TeamPart } from './types';

/** The roles, as they are offered in People. */
export const ROLES: readonly Role[] = ['admin', 'project_manager', 'team', 'view_only'];

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', project_manager: 'Project Manager', team: 'Superintendent', view_only: 'View Only' };

export const ROLE_HINTS: Record<Role, string> = {
  admin: 'Runs the company: its people, companies, templates and every job.',
  project_manager: 'Makes jobs and sets them up: locations, companies and the team.',
  team: 'Walks jobs, adds items, sends lists and checks the work off.',
  view_only: 'Sees the jobs and comments. Changes nothing.',
};

export const SEES_LABELS: Record<Sees, string> = { all: 'Every Job', assigned: 'Only Their Jobs' };

export const TEAM_PARTS: TeamPart[] = ['project_manager', 'superintendent', 'field'];

export const PART_LABELS: Record<TeamPart, string> = { project_manager: 'Project Manager', superintendent: 'Superintendent', field: 'Field' };

/** Whether this person changes the company's setup: its people, companies, templates, standard titles and added fields, and deletes jobs. */
export const isAdmin = (person: Pick<Person, 'role' | 'active'> | null | undefined): boolean => !!person && person.active && person.role === 'admin';

/** Whether this person makes jobs and sets them up: their name, locations, companies and team, closing and opening them. */
export const canSetUpJobs = (person: Pick<Person, 'role' | 'active'> | null | undefined): boolean =>
  !!person && person.active && (person.role === 'admin' || person.role === 'project_manager');

/** Whether this person changes anything at all; View Only looks and comments. */
export const canChange = (person: Pick<Person, 'role' | 'active'> | null | undefined): boolean => !!person && person.active && person.role !== 'view_only';

/** Whether this person sees every job whatever Sees says: admins and project managers do. */
export const seesEveryJob = (person: Pick<Person, 'role' | 'sees'>): boolean => person.role === 'admin' || person.role === 'project_manager' || person.sees === 'all';

/** Whether this person sees a job: admins and people who see every job always; everyone else when they are on its team. */
export function seesJob(person: Pick<Person, 'id' | 'role' | 'sees' | 'active'> | null | undefined, jobId: string, team: Pick<TeamMember, 'jobId' | 'personId'>[]): boolean {
  if (!person || !person.active) return false;
  if (seesEveryJob(person)) return true;
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
