// What the company-page function answers with: the page as it stands.

import type { ChecklistEntry, ItemKind, Mark } from '@punch/core';

export interface PagePhoto {
  url: string;
  width: number;
  height: number;
  marks: Mark[];
}
export interface PageItem {
  id: string;
  number: number | null;
  title: string;
  description: string;
  location: string;
  floor: string | null;
  kind: ItemKind;
  ready: boolean;
  waiting_on: string[];
  waiting_for: { title: string; company: string | null; location: string | null }[];
  ready_by: string | null;
  hours: number | null;
  priority: boolean;
  po_or_co: string | null;
  checklist: ChecklistEntry[] | null;
  confirmed_at: string | null;
  marked_done_at: string | null;
  photos: PagePhoto[];
  /** What finishing it frees up: the open items that wait on it, down the chain, and their hours. An older answer leaves it out. */
  holds_up?: { items: number; hours: number } | null;
}
export interface PageComment {
  id: string;
  item_id: string | null;
  body: string;
  from_company: boolean;
  author: string | null;
  created_at: string;
}
export interface Page {
  builder: string;
  job: { name: string; address: string; closed: boolean };
  company: { id: string; name: string };
  items: PageItem[];
  completed: { id: string; number: number | null; title: string; location: string; completed_at: string }[];
  comments: PageComment[];
}

/** One item on the station's board, in short: enough to count it and to put it in order. */
export interface StationItem {
  id: string;
  number: number | null;
  title: string;
  location: string;
  kind: ItemKind;
  ready: boolean;
  ready_by: string | null;
  hours: number | null;
  priority: boolean;
  po_or_co: string | null;
  confirmed_at: string | null;
  marked_done_at: string | null;
  holds_up?: { items: number; hours: number } | null;
}
export interface StationCompany {
  id: string;
  name: string;
  /** The trade it does on the job, when it is on the job in Job Setup. */
  trade: string | null;
  items: StationItem[];
}
/** What the company-page function answers the job's station with: every company with work on the job. */
export interface StationBoard {
  builder: string;
  job: { name: string; address: string; closed: boolean };
  companies: StationCompany[];
}
