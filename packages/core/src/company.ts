// Your own company: anyone signs up, names their company and becomes its admin, then adds their
// people. Its name goes at the top of every list it sends. The database checks the same things.

import type { Plan } from './types';

/** The longest a company's or a person's name can be. */
export const COMPANY_NAME_MAX = 80;

/** The trades a new company starts with, in the order the work goes: the same list the database gives it. */
export const STARTING_TRADES = [
  'Site Work',
  'Concrete',
  'Framing',
  'Roofing',
  'Windows and Doors',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Insulation',
  'Drywall',
  'Trim Carpentry',
  'Cabinets',
  'Countertops',
  'Tile',
  'Flooring',
  'Painting',
  'Appliances',
  'Landscaping',
  'Cleaning',
] as const;

/** A name as it is kept: trimmed, one space between words. */
export function tidyCompanyName(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** What is wrong with a company's name, or null when it is fine. */
export function companyNameProblem(text: string): string | null {
  const name = tidyCompanyName(text);
  if (name === '') return 'Enter the company name';
  if (name.length > COMPANY_NAME_MAX) return `Keep it to ${COMPANY_NAME_MAX} characters or fewer`;
  return null;
}

/** What is wrong with the name of the person starting a company, or null when it is fine. */
export function yourNameProblem(text: string): string | null {
  const name = tidyCompanyName(text);
  if (name === '') return 'Enter your name';
  if (name.length > COMPANY_NAME_MAX) return `Keep it to ${COMPANY_NAME_MAX} characters or fewer`;
  return null;
}

/** The most a logo may take, as the database keeps it: a data URL of about 300 kilobytes. */
export const LOGO_MOST = 400_000;

/** A logo the database keeps: a PNG or JPEG data URL, small enough. */
export const isLogo = (v: string): boolean => v.length <= LOGO_MOST && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v);

// ---------- plans ----------

/** Where a company stands: on a plan or free, in its free trial with the days left, or with its trial over. */
export type PlanState = { kind: 'paid' } | { kind: 'free' } | { kind: 'trial'; daysLeft: number; ends: string } | { kind: 'ended' };

/** The words the database turns a change down with once a trial is over, and the app too. */
export const TRIAL_ENDED = "Your company's free trial has ended. Everything is still here to look at, comment on and download.";

/** Where a company stands on a day. A trial with no end said has not ended. */
export function planState(org: { plan?: Plan; trialEnds?: string | null }, now: Date = new Date()): PlanState {
  if (org.plan === 'paid') return { kind: 'paid' };
  if (org.plan !== 'trial') return { kind: 'free' };
  const ends = org.trialEnds ? new Date(org.trialEnds) : null;
  if (!ends || Number.isNaN(ends.getTime())) return { kind: 'trial', daysLeft: 30, ends: '' };
  const left = ends.getTime() - now.getTime();
  if (left <= 0) return { kind: 'ended' };
  return { kind: 'trial', daysLeft: Math.max(1, Math.ceil(left / 86_400_000)), ends: org.trialEnds! };
}

/** "Free Trial, 12 days left", "Free Trial, last day", "Free Trial Ended" or "Paid", for Me. Empty when free. */
export function planText(state: PlanState): string {
  if (state.kind === 'paid') return 'Paid';
  if (state.kind === 'ended') return 'Free Trial Ended';
  if (state.kind === 'trial') return state.daysLeft <= 1 ? 'Free Trial, last day' : `Free Trial, ${state.daysLeft} days left`;
  return '';
}
