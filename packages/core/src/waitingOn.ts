// The Waiting On choices for a job: the job's own extras first (Ross Built, Owner, the design team
// by name), then every company on the job, each name once.

import type { Company, JobCompany } from './types';

export const DEFAULT_WAITING_ON_EXTRAS = ['Ross Built', 'Owner'] as const;

export function waitingOnChoices(
  jobCompanies: JobCompany[],
  companies: Company[],
  extras: string[] = [...DEFAULT_WAITING_ON_EXTRAS],
): string[] {
  const byId = new Map(companies.map((c) => [c.id, c]));
  const names = jobCompanies
    .map((jc) => byId.get(jc.companyId)?.name)
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...extras, ...names]) {
    const key = name.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

/** Waiting On as it reads in a sentence: "Owner", "Owner and Volcano Stone", "Owner, Ross Built and Volcano Stone". */
export function waitingOnText(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
