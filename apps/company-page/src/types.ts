// What the company-page function answers with: the page as it stands.

import type { ChecklistEntry, ItemKind, Mark } from '@punch/core';

export interface PagePhoto {
  url: string;
  width: number;
  height: number;
  marks: Mark[];
  /** A photo of the finished work. An older answer leaves it out. */
  done?: boolean;
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
  /** The builder's logo, when the page asked for it as it opened. */
  logo?: string | null;
  job: { name: string; address: string; closed: boolean };
  /** language: the page in Spanish. An older answer leaves it out. */
  company: { id: string; name: string; language?: 'en' | 'es' };
  items: PageItem[];
  completed: { id: string; number: number | null; title: string; location: string; completed_at: string }[];
  comments: PageComment[];
  /** The list's lines in Spanish, by their English, for a page in Spanish. */
  translations?: Record<string, string>;
  /** The company's other jobs with the builder that have open work, each with its own link. Never on a station. */
  other_jobs?: { name: string; address: string; token: string; open: number }[];
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
  /** The builder's logo, when the station asked for it as it opened. */
  logo?: string | null;
  job: { name: string; address: string; closed: boolean };
  companies: StationCompany[];
}

/** What the company-page function answers the owner's page with: the job as the owner sees it. */
export interface OwnerPage {
  builder: string;
  /** The builder's logo, when the page asked for it as it opened. */
  logo?: string | null;
  job: { name: string; address: string; closed: boolean };
  /** Who the link is for, as the builder named them. */
  owner: string | null;
  locations: {
    id: string;
    label: string;
    floor: string | null;
    open: { id: string; title: string; ready: boolean; waits_on_owner: boolean }[];
    /** Finished in the last 30 days, newest first, with their photos (done photos first). */
    done: { id: string; title: string; completed_at: string; photos: PagePhoto[] }[];
  }[];
  /** What the owner sent, newest first, and where each stands. */
  added: { id: string; words: string; title: string | null; location: string | null; status: 'received' | 'on_list' | 'done' | 'removed'; created_at: string }[];
  sign_offs: { name: string; location: string | null; open: number; at: string }[];
}
