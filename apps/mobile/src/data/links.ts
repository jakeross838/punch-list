// A company's own page: the private link on its list, opened with no account. The address is set at
// setup (EXPO_PUBLIC_COMPANY_PAGE_URL, with the token added to the end); until then it is the house
// domain's.

const BASE = process.env.EXPO_PUBLIC_COMPANY_PAGE_URL || 'https://link.rossbuilt.com/c/';

/** The page's address for a link's token. */
export function companyPageUrl(token: string): string {
  return `${BASE.endsWith('/') ? BASE : `${BASE}/`}${token}`;
}
