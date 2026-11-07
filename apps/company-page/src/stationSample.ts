// The sample station, at /s#sample and /tv#sample: a made up job with a few companies, for the
// preview of the app and for showing anyone how it goes. Each company's list is a sample company
// page, and the board is worked out from them, so an answer on a list shows on the board at once.
// Nothing is sent anywhere; it resets when the page is opened again.

import { answerSample, samplePage } from './sample';
import type { Page, PageItem, StationBoard } from './types';

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let n = 100;
function item(title: string, location: string, over: Partial<PageItem> = {}): PageItem {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    number: n - 60,
    title,
    description: '',
    location,
    floor: null,
    kind: 'completion',
    ready: true,
    waiting_on: [],
    waiting_for: [],
    ready_by: null,
    hours: null,
    priority: false,
    po_or_co: null,
    checklist: [],
    confirmed_at: null,
    marked_done_at: null,
    photos: [],
    ...over,
  };
}

function company(id: string, name: string, items: PageItem[]): Page {
  return { ...samplePage(), company: { id, name }, items, completed: [], comments: [] };
}

export interface SampleStation {
  pages: Map<string, Page>;
  trades: Map<string, string>;
}

export function sampleStation(): SampleStation {
  n = 100;
  const plumbing = samplePage();
  const pages = new Map<string, Page>([
    [plumbing.company.id, plumbing],
    [
      'sample-carpentry',
      company('sample-carpentry', 'Sample Carpentry', [
        item('Install pocket door hardware', 'Primary Bath 207', { hours: 1, holds_up: { items: 1, hours: 3 } }),
        item('Install door stops', 'Guest Bedroom 114', { hours: 0.5 }),
        item('Adjust closet door', 'Primary Bedroom 206', { kind: 'deficiency' }),
        item('Install baseboard', 'Laundry 112', { hours: 4 }),
        item('Hang front door', 'Foyer 115', { ready: false, waiting_on: ['the owner'], ready_by: daysFromNow(6) }),
      ]),
    ],
    [
      'sample-painting',
      company('sample-painting', 'Sample Painting', [
        item('Paint pocket doors', 'Primary Bath 207', { ready: false, waiting_for: [{ title: 'Install pocket door hardware', company: 'Sample Carpentry', location: null }] }),
        item('Touch up paint', 'Kitchen 109', { kind: 'deficiency', hours: 1 }),
        item('Patch drywall', 'Living 107', { kind: 'deficiency', marked_done_at: new Date().toISOString() }),
      ]),
    ],
    [
      'sample-electric',
      company('sample-electric', 'Sample Electric', [
        item('Install pendant lights', 'Kitchen 109', { ready: false, waiting_on: ['the owner'], ready_by: daysFromNow(3) }),
        item('Replace outlet cover', 'Guest Bedroom 114', { kind: 'deficiency' }),
      ]),
    ],
    ['sample-glass', company('sample-glass', 'Sample Glass', [])],
  ]);
  const trades = new Map([
    [plumbing.company.id, 'Plumbing'],
    ['sample-carpentry', 'Carpentry'],
    ['sample-painting', 'Painting'],
    ['sample-electric', 'Electrical'],
    ['sample-glass', 'Glass'],
  ]);
  return { pages, trades };
}

/** The board, from the sample companies' lists as they stand. */
export function sampleBoard(s: SampleStation): StationBoard {
  const first = [...s.pages.values()][0]!;
  return {
    builder: first.builder,
    job: first.job,
    companies: [...s.pages.values()].map((p) => ({
      id: p.company.id,
      name: p.company.name,
      trade: s.trades.get(p.company.id) ?? null,
      items: p.items.map((i) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        location: i.location,
        kind: i.kind,
        ready: i.ready,
        ready_by: i.ready_by,
        hours: i.hours,
        priority: i.priority,
        po_or_co: i.po_or_co,
        confirmed_at: i.confirmed_at,
        marked_done_at: i.marked_done_at,
        holds_up: i.holds_up ?? null,
      })),
    })),
  };
}

/** An answer on a sample company's list, done here. */
export function answerStation(s: SampleStation, companyId: string, body: Record<string, unknown>): Page {
  const page = s.pages.get(companyId);
  if (!page) throw new Error('That company is not on this job');
  const next = answerSample(page, body);
  s.pages.set(companyId, next);
  return JSON.parse(JSON.stringify(next)) as Page;
}
