// What is switched off for now. Jake's call on 10 November 2026: the app is for walking a job,
// photographing what is left and keeping the running list, so the parts that are further down the
// road stay out of sight until they are worth their place. Each one stays in the code and in the
// database: nothing already entered is lost, and switching one back on brings back its screens,
// its wording on the lists and its place on the companies' pages.
//
//   types      Type (Deficiency, Incomplete, Additional), the order behind additional work
//              (purchase order, variance purchase order or change order) and To Be Quoted.
//   hours      How long an item takes, the standard time, and the companies giving their time.
//   visits     A company's visit to the job, and what is past due after one.
//   ownerPage  The owner's page, what the owner sends and signs off, and the update to the owner.
//
// To switch one back on, change SHIPPED here: the phone app, the companies' pages and the server
// functions all read this file. For one build or one run, name them in EXPO_PUBLIC_FEATURES instead
// ("types,hours", or "all").

export type Feature = 'types' | 'hours' | 'visits' | 'ownerPage';

export const FEATURES: Feature[] = ['types', 'hours', 'visits', 'ownerPage'];

/** What goes out to people: every one of these off. */
export const SHIPPED: Readonly<Record<Feature, boolean>> = { types: false, hours: false, visits: false, ownerPage: false };

const state: Record<Feature, boolean> = { ...SHIPPED };

/** Whether a part of the app is on. Asked each time something is drawn or worded, never kept. */
export function featureOn(feature: Feature): boolean {
  return state[feature];
}

/** Switches parts on or off, the ones named only. */
export function setFeatures(next: Partial<Record<Feature, boolean>>): void {
  for (const f of FEATURES) {
    const on = next[f];
    if (typeof on === 'boolean') state[f] = on;
  }
}

/** Back to what goes out to people. */
export function resetFeatures(): void {
  setFeatures(SHIPPED);
}

/** "types,hours" or "all" read as the parts to switch on; anything else in the text is passed over. */
export function featuresFrom(text: string | null | undefined): Partial<Record<Feature, boolean>> {
  const names = (text ?? '')
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  if (names.includes('all')) return { types: true, hours: true, visits: true, ownerPage: true };
  const out: Partial<Record<Feature, boolean>> = {};
  for (const f of FEATURES) if (names.includes(f.toLowerCase())) out[f] = true;
  return out;
}

// Where there is an environment (the tests, the tools and the functions), it can name parts to
// switch on. The phone app reads its own build setting and calls setFeatures as it starts.
function named(): string | undefined {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.EXPO_PUBLIC_FEATURES;
  } catch {
    return undefined;
  }
}

setFeatures(featuresFrom(named()));
