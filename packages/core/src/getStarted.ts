// Get Started: the short checklist on a new company's first days, for its admin. Each step ticks
// itself off from what the company has done: a first job of its own (the Sample Job is for trying
// things, so it does not count), a walk with photos, the companies it works with, a list sent and
// its people. Put away with a tap, or gone once every step is done.

import { SAMPLE_JOB } from './sampleJob';
import type { Company, Job, ListSend, Person, Photo } from './types';

export type GetStartedStep = 'job' | 'walk' | 'companies' | 'send' | 'people';

export interface GetStartedRow {
  step: GetStartedStep;
  title: string;
  hint: string;
  done: boolean;
}

export const GET_STARTED_STEPS: readonly { step: GetStartedStep; title: string; hint: string }[] = [
  { step: 'job', title: 'Set Up Your First Job', hint: 'Its name and address, then its locations.' },
  { step: 'walk', title: 'Walk It', hint: 'A photo of each thing left to do, location by location.' },
  { step: 'companies', title: 'Add the Companies You Work With', hint: 'Each gets its own list and its own page.' },
  { step: 'send', title: 'Send a Company Its List', hint: 'By email or text, with the link to its page.' },
  { step: 'people', title: 'Add Your People', hint: 'Your project managers and superintendents, by email.' },
];

/** A job of the company's own: not the Sample Job, and not closed. */
export const isOwnJob = (j: Job) => !j.closed && j.address !== SAMPLE_JOB.address;

export function getStarted(input: {
  meId: string | null;
  jobs: Job[];
  photos: Pick<Photo, 'jobId' | 'removed'>[];
  companies: Pick<Company, 'active'>[];
  sends: Pick<ListSend, 'jobId' | 'removed'>[];
  people: Pick<Person, 'id' | 'active'>[];
}): GetStartedRow[] {
  const own = new Set(input.jobs.filter(isOwnJob).map((j) => j.id));
  const done: Record<GetStartedStep, boolean> = {
    job: own.size > 0,
    walk: input.photos.some((p) => !p.removed && own.has(p.jobId)),
    companies: input.companies.some((c) => c.active),
    send: input.sends.some((s) => !s.removed && own.has(s.jobId)),
    people: input.people.some((p) => p.active && p.id !== input.meId),
  };
  return GET_STARTED_STEPS.map((s) => ({ ...s, done: done[s.step] }));
}
