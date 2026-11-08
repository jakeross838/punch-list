// What Read the Plans works with on either side: the plans picked (a PDF, or pictures of the sheets),
// what this side can pick, and a problem said in plain words for the person.

export interface PlanFile {
  uri: string;
  name: string;
  /** In bytes, when the picker says. */
  size: number | null;
  /** A picture's size; null for a PDF. */
  width: number | null;
  height: number | null;
  /** The preview page: the file itself. */
  blob?: Blob;
}

export interface PickedPlans {
  kind: 'pdf' | 'pictures';
  files: PlanFile[];
}

/** What can be picked here. */
export interface PlanWays {
  pdf: boolean;
  pictures: boolean;
  camera: boolean;
}

/** Why the plans could not be read, said for the person. */
export class PlanReadError extends Error {}

/** The most pictures read at once: each sheet goes as itself and its pieces. */
export const MOST_PICTURES = 6;
/** The biggest PDF Claude reads in one go. */
export const MOST_PDF_BYTES = 30 * 1024 * 1024;

export const TOO_BIG = 'That PDF is too big to read at once. Save the floor plan pages as a PDF of their own, or take pictures of them.';
export const NOTHING_FOUND = 'Claude could not find the rooms on these plans. Try the floor plan pages, or clearer pictures of them.';

/** When Claude finds no work to do on a list. */
export const NOTHING_ON_LIST = 'Claude did not find anything to do on that list. Check it is the punch list, then try again.';
