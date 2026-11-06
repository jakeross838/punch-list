// Your own company: anyone signs up, names their company and becomes its admin, then adds their
// people. Its name goes at the top of every list it sends. The database checks the same things.

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
