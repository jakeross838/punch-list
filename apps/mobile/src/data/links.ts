// A company's own page: the private link on each list it gets, opened with no account and no app.
// The page lives on Expo's hosting (apps/company-page); the link's token goes after the #, so it is
// never sent to the hosting or kept in its logs. EXPO_PUBLIC_COMPANY_PAGE_URL changes where it is.

const BASE = process.env.EXPO_PUBLIC_COMPANY_PAGE_URL || 'https://punch-list.expo.app/c';

/** The page's address for a link's token. */
export function companyPageUrl(token: string): string {
  return `${BASE.replace(/[#/]+$/, '')}#${token}`;
}

/** On the preview, with sample data, every company's page is the sample one: nothing real is sent. */
export function pageUrlFor(mode: 'preview' | 'live', token: string): string {
  return companyPageUrl(mode === 'preview' ? 'sample' : token);
}

/**
 * The job's station, on the same hosting: /s for a tablet, /tv for a TV. On the preview it is the
 * sample station.
 */
export function stationUrlFor(mode: 'preview' | 'live', token: string, on: 'tablet' | 'tv' = 'tablet'): string {
  const site = BASE.replace(/[#/]+$/, '').replace(/\/[^/]*$/, '');
  return `${site}/${on === 'tv' ? 'tv' : 's'}#${mode === 'preview' ? 'sample' : token}`;
}
