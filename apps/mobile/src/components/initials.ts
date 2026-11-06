// Initials for a person, on avatars: kept apart from the rows that use them so the app bar can
// import them without importing the whole UI kit back.

/** "JR" for Jake Ross. */
export function initials(name: string): string {
  // "Mike at SMS Carpentry" reads MS: the small words are left out.
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^[A-Z0-9]/.test(w));
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}
