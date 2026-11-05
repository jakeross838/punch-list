// The screens that open with a large title, and the title each opens with. An empty title is filled
// in by the screen itself, for a job's, a company's or a person's name.
//
// The iPhone stack sets these where the screens are registered (app/_layout.tsx), so the large title
// is there before a screen first lays out. Set only from inside the screen (Page), the title turns
// large after the list has been placed under a small bar, and iOS draws it over the first rows.
// Every screen whose Page is large is listed here; test/large-titles.test.ts checks both ways.

export const LARGE_TITLES = {
  'sign-in': 'Sign In',
  index: 'Jobs',
  my: 'My Items',
  'settings/account': '',
  'settings/companies/index': 'Companies',
  'settings/companies/[companyId]': '',
  'settings/people/index': 'People',
  'settings/people/[personId]': '',
  'settings/templates/index': 'Templates',
  'settings/templates/[templateId]': '',
  'jobs/[jobId]/index': '',
  'jobs/[jobId]/list/[by]/[key]': '',
  'jobs/[jobId]/setup': 'Job Setup',
  'jobs/[jobId]/schedule': 'Schedule',
  'jobs/[jobId]/activity': 'Activity',
  'jobs/[jobId]/plan/[companyId]': '',
  'jobs/[jobId]/company/[companyId]': '',
} as const satisfies Record<string, string>;

export type LargeTitleScreen = keyof typeof LARGE_TITLES;

export function largeTitleFor(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(LARGE_TITLES, name) ? LARGE_TITLES[name as LargeTitleScreen] : undefined;
}

/**
 * The header text sizes, one step under the system's, like the rest of the app's text (the large
 * title is the theme's largeTitle size). Kept here, free of React Native, so the test can read this file.
 */
export const HEADER_TEXT = {
  largeTitle: { fontSize: 30, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '600' },
} as const;
