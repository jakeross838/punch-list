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
  waitingOn: string | null;
  readyBy: string | null;
  boughtOut: boolean;
  poOrCo: string | null;
  status: ItemStatus;
  completedBy: string | null;
  completedAt: string | null;
  source: ItemSource;
  /** Empty until the Buildertrend connection is turned on. */
  btExternalId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
