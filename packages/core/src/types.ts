// The records the app works with. Field names here are the app's; the database uses the same
// names in snake_case. Dates are YYYY-MM-DD strings, times are ISO strings.

export type LocationKind = 'room' | 'shared';
export type ItemKind = 'deficiency' | 'added_scope';
export type ItemStatus = 'open' | 'complete' | 'removed';
export type ItemSource = 'walk' | 'typed' | 'import';

export interface Person {
  id: string;
  email: string;
  name: string;
  active: boolean;
}

export interface Job {
  id: string;
  name: string;
  address: string;
}

export interface Location {
  id: string;
  jobId: string;
  name: string;
  /** The plan number, "109". Shared areas have none. */
  number: string | null;
  /** What the lists show: "Kitchen 109". */
  label: string;
  floor: string | null;
  kind: LocationKind;
  /** Floor order, as pasted from the plans. */
  sortOrder: number;
  active: boolean;
}

export interface Trade {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Company {
  id: string;
  name: string;
  defaultTradeId: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export interface JobCompany {
  jobId: string;
  companyId: string;
  tradeId: string;
}

export interface Item {
  id: string;
  jobId: string;
  locationId: string;
  /** Job-wide, assigned by the database on first sync. Null until then. */
  number: number | null;
  title: string;
  description: string;
  tradeId: string | null;
  companyId: string | null;
  kind: ItemKind;
  ready: boolean;
  /** Everything it is waiting on, one or several: a company on the job, Ross Built, the owner, the design team. */
  waitingOn: string[];
  readyBy: string | null;
  boughtOut: boolean;
  poOrCo: string | null;
  status: ItemStatus;
  completedBy: string | null;
  completedAt: string | null;
  source: ItemSource;
  /** Answers to the added fields from Item Form setup, by field id. */
  extra: Record<string, ExtraValue>;
  /**
   * Saved quickly to finish later: a photo snapped on a walk, or an item saved before its company
   * was known. It may have no title, company or trade yet, and it stays off the lists that go out.
   */
  unfinished: boolean;
  /** The visit it is booked on, when the company's trip is planned. */
  visitId: string | null;
  /** Empty until the Buildertrend connection is turned on. */
  btExternalId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- the schedule ----------

/**
 * A company's trip to the job to do a batch of items: when it starts and how many working days it
 * takes. A best guess until the company confirms it. Removing keeps it, marked removed.
 */
export interface Visit {
  id: string;
  jobId: string;
  companyId: string;
  /** The first day, YYYY-MM-DD. */
  start: string;
  /** Working days, Monday to Friday. */
  days: number;
  confirmed: boolean;
  note: string;
  removed: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A list that went out: to a company, the whole job, or the owner and design team. */
export interface ListSend {
  id: string;
  jobId: string;
  /** Which list: "job", "company:<id>" or "party:<name>". */
  list: string;
  /** The items on it when it went out, to mark what is new on the next one. */
  itemIds: string[];
  sentAt: string;
  sentBy: string;
  removed: boolean;
}

// ---------- photos and their marks ----------

/** A point on a photo as fractions of its width and height (0 to 1), so marks fit any size. */
export type MarkPoint = [x: number, y: number];
export type MarkColor = 'red' | 'yellow' | 'white' | 'black';
export type MarkTool = 'pen' | 'arrow' | 'circle' | 'box' | 'text';

export type Mark =
  | { tool: 'pen'; color: MarkColor; points: MarkPoint[] }
  | { tool: 'arrow' | 'circle' | 'box'; color: MarkColor; from: MarkPoint; to: MarkPoint }
  | { tool: 'text'; color: MarkColor; at: MarkPoint; text: string };

export interface Photo {
  id: string;
  jobId: string;
  itemId: string;
  /** Where to show it from: a file on the phone, or a blob or data URL on the preview page. */
  uri: string;
  /** Its place in storage once uploaded; null until then. */
  storagePath: string | null;
  width: number;
  height: number;
  /** Drawn over the photo, never burned in, so the original is always kept. */
  marks: Mark[];
  sortOrder: number;
  removed: boolean;
  createdBy: string;
  createdAt: string;
}

// ---------- the New Item form ----------

/** A title from the standard list. Its trade lets the form fill in the trade and the company. */
export interface StandardTitle {
  id: string;
  title: string;
  tradeId: string | null;
  uses: number;
  approved: boolean;
}

export type CustomFieldKind = 'text' | 'list' | 'yes_no' | 'date';

/** A field Ross Built adds to the form in Item Form setup, like Found By. */
export interface CustomField {
  id: string;
  label: string;
  kind: CustomFieldKind;
  /** The choices, for a list. */
  options: string[];
  sortOrder: number;
  active: boolean;
}

export type ExtraValue = string | boolean | null;

/** The fields Item Form setup can turn off. Title and room are always on the form. */
export type FormField = 'description' | 'company' | 'trade' | 'kind' | 'ready' | 'waitingOn' | 'readyBy' | 'boughtOut' | 'poOrCo';

export interface FormSettings {
  hidden: FormField[];
  /** What a new item starts as. */
  startReady: boolean;
  startKind: ItemKind;
}
