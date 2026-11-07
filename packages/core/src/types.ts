// The records the app works with. Field names here are the app's; the database uses the same
// names in snake_case. Dates are YYYY-MM-DD strings, times are ISO strings.

export type LocationKind = 'room' | 'shared';
/** Deficiency: wrong or damaged, to fix. Completion (shown as Incomplete): scope completion, their work not done yet. Added scope (shown as Additional): extra work, to be quoted until it has its purchase order, variance purchase order or change order. */
export type ItemKind = 'deficiency' | 'completion' | 'added_scope';
export type ItemStatus = 'open' | 'complete' | 'removed';
/** How an item came onto the list: a photo on a walk, typed in, imported, pasted, or from a template. */
export type ItemSource = 'walk' | 'typed' | 'import' | 'copy' | 'template' | 'said';

/** admin: adds people, makes and closes jobs, changes the setup. team: walks jobs, adds items, checks them off. */
export type Role = 'admin' | 'team';

/** Which jobs a person sees: every job, or only the jobs they are on. Admins see every job. */
export type Sees = 'all' | 'assigned';

/** The company using the app: its people, its jobs and its own setup. Its name goes on every list it sends. */
export interface Org {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  email: string;
  name: string;
  active: boolean;
  role: Role;
  sees: Sees;
  phone: string | null;
}

export interface Job {
  id: string;
  name: string;
  address: string;
  /** Done and put away: off the jobs list until it is opened again. */
  closed: boolean;
}

/** What a person is on a job's team. */
export type TeamPart = 'project_manager' | 'superintendent' | 'field';

/** A person on a job's team. */
export interface TeamMember {
  id: string;
  jobId: string;
  personId: string;
  part: TeamPart;
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
  /** When Done Here marked it walked on the walk going now; null until then, and after Start a New Walk. */
  walkedAt: string | null;
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
  /** The database row, on the phone; the preview's sample has none. */
  id?: string;
  jobId: string;
  companyId: string;
  tradeId: string;
}

export interface Item {
  id: string;
  jobId: string;
  /** Empty while a draft waits for its location (a photo saves before one is picked). */
  locationId: string;
  /** Job-wide, assigned by the database on first sync. Null until then. */
  number: number | null;
  /** The person at the company it is assigned to, if anyone: it shows on their My Items. */
  assignedTo: string | null;
  title: string;
  description: string;
  tradeId: string | null;
  companyId: string | null;
  kind: ItemKind;
  ready: boolean;
  /** Who it waits on, for what is not a task on the list: the owner, the design team, your own company, someone else. */
  waitingOn: string[];
  /** The tasks that have to be done first, usually one: the ids of other items on the job. */
  waitingOnItems: string[];
  readyBy: string | null;
  /** Follows the type and the order number: additional work is Bought Out once it has one. Kept for Buildertrend. */
  boughtOut: boolean;
  /** The purchase order or change order number for additional work. */
  poOrCo: string | null;
  status: ItemStatus;
  completedBy: string | null;
  completedAt: string | null;
  source: ItemSource;
  /** Where it sits in its location's list once someone drags it there. Absent or null: number order. */
  position?: number | null;
  /** Answers to the added fields from Item Form setup, by field id. */
  extra: Record<string, ExtraValue>;
  /**
   * Saved quickly to finish later: a photo snapped on a walk, or an item saved before its company
   * was known. It may have no title, company or trade yet, and it stays off the lists that go out.
   */
  unfinished: boolean;
  /** The visit it is booked on, when the company's trip is planned. */
  visitId: string | null;
  /** About how long the work takes, in hours: a quarter hour at the least. Null until someone, the standard title or Claude gives it one. */
  hours: number | null;
  /** Empty until the Buildertrend connection is turned on. */
  btExternalId: string | null;
  /**
   * When the company said the work is done, from its own page (out of the app for now): the item
   * waited for someone at your company to look. Only your own team completes an item.
   */
  markedDoneAt?: string | null;
  /**
   * When the company confirmed the item from its own page: it is theirs and right as it is. The
   * builder changing what the work is, where, who does it, when it is ready or how long it takes
   * takes it back.
   */
  confirmedAt?: string | null;
  /** Wanted first: it sorts to the top of its list and shows a red mark. */
  priority?: boolean;
  /** Steps to tick off inside the item, like the parts of a door to adjust. */
  checklist?: ChecklistEntry[];
  /** Where it is pinned on the job's plans: the plan sheet and the spot, as fractions across and down. */
  planId?: string | null;
  pinX?: number | null;
  pinY?: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A step inside an item. */
export interface ChecklistEntry {
  id: string;
  text: string;
  done: boolean;
}

/** A sheet of the job's plans, one per level, to pin items on. */
export interface PlanSheet {
  id: string;
  jobId: string;
  /** The level it shows, as the locations name it: "Level 1". */
  floor: string;
  name: string;
  uri: string;
  width: number;
  height: number;
  sortOrder: number;
  removed: boolean;
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
  /** Other dates the company asked for from its page, until the visit is moved or kept as it is. */
  askedStart: string | null;
  askedDays: number | null;
  /** The name the company's person typed. */
  askedName: string | null;
  askedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A list that went out: to a company, the whole job, or the owner and design team. */
export interface ListSend {
  id: string;
  jobId: string;
  /** Which list: "job", "lookahead", "schedule", "company:<id>" or "party:<name>". */
  list: string;
  /** The items on it when it went out, to mark what is new on the next one. */
  itemIds: string[];
  sentAt: string;
  sentBy: string;
  removed: boolean;
  /** The schedule as it went out, for the look ahead and the schedule email: to track against. */
  snapshot?: ScheduleSnapshot | null;
}

/** The schedule as it went out: when everything was to be done, and each visit or best guess. */
export interface ScheduleSnapshot {
  finish: string | null;
  bars: SnapshotBar[];
}

export interface SnapshotBar {
  key: string;
  companyId: string;
  start: string;
  end: string;
  confirmed: boolean;
}

/** A company's private link on a job: its own page, with no account. Taken back, it stops working. */
export interface CompanyLink {
  /** 64 random hex characters: the link itself. */
  token: string;
  jobId: string;
  companyId: string;
  createdAt: string;
  revoked: boolean;
}

/** One of a company's people: who gets its lists and the Schedule Email, on every job. */
export interface Contact {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Gets the company's lists and the schedule email. */
  getsLists: boolean;
  sortOrder: number;
  /** Switched off: no longer gets anything. Nothing is deleted. */
  active: boolean;
}

// ---------- comments ----------

/**
 * A comment on an item, or on a company's whole list on a job: a back and forth between your team
 * and the company doing the work. Never deleted; taking one back marks it removed.
 */
export interface Comment {
  id: string;
  jobId: string;
  /** The item it is on, or null for a comment on the company's whole list. */
  itemId: string | null;
  /** The company the conversation is with. */
  companyId: string | null;
  body: string;
  /** Who at your company wrote it; null when the company doing the work did. */
  personId: string | null;
  /** The company wrote it, from its page. */
  fromCompany: boolean;
  /** The name the company's person typed on the page. */
  authorName: string | null;
  /** Internal: only your own company sees it, never on a printed list. */
  internal: boolean;
  removed: boolean;
  createdAt: string;
}

// ---------- photos and their marks ----------

/** A point on a photo as fractions of its width and height (0 to 1), so marks fit any size. */
export type MarkPoint = [x: number, y: number];
export type MarkColor = 'red' | 'yellow' | 'white' | 'black';
export type MarkTool = 'pen' | 'arrow' | 'circle' | 'box' | 'measure' | 'number' | 'text';

export type Mark =
  | { tool: 'pen'; color: MarkColor; points: MarkPoint[] }
  | { tool: 'arrow' | 'circle' | 'box'; color: MarkColor; from: MarkPoint; to: MarkPoint }
  /** A measurement: a line from one end to the other with end bars, and its size written out ("24 inches"). */
  | { tool: 'measure'; color: MarkColor; from: MarkPoint; to: MarkPoint; text: string }
  /** A numbered spot: one of several places with the same work, numbered in the order they were tapped. */
  | { tool: 'number'; color: MarkColor; at: MarkPoint; n: number }
  /**
   * A note: its words set where it was placed (at). With to, an arrow runs from the words to that
   * spot: the most used mark there is, after a circle and a plain arrow.
   */
  | { tool: 'text'; color: MarkColor; at: MarkPoint; text: string; to?: MarkPoint };

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
  /** How long the work usually takes, in hours: it fills in the estimate when the title is picked. */
  hours: number | null;
  /** The kinds of room it is common in, offered as Common Tasks there. */
  rooms: RoomKind[];
}

/** Kinds of room, worked out from a location's name, for the common tasks in each. */
export type RoomKind = 'bathroom' | 'kitchen' | 'laundry' | 'bedroom' | 'closet' | 'living' | 'garage' | 'outside';

export type CustomFieldKind = 'text' | 'list' | 'yes_no' | 'date';

/** A field your company adds to the form in Item Form setup, like Found By. */
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
export type FormField = 'description' | 'company' | 'assignedTo' | 'kind' | 'ready' | 'waitingOn' | 'readyBy' | 'hours';

export interface FormSettings {
  hidden: FormField[];
  /** What a new item starts as. */
  startReady: boolean;
  startKind: ItemKind;
}
