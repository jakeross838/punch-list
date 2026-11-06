// The sample company page, at /c#sample: what a company sees, with made up work, for the preview
// of the app and for showing anyone how it goes. Nothing it does is sent anywhere; it resets when
// the page is opened again.

import type { Mark } from '@punch/core';
import type { Page } from './types';

/** A drawn stand-in for a job photo: a vanity wall, with the faucet spot. */
const WALL = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#DCD7CF"/><rect y="560" width="1200" height="340" fill="#EFECE7"/><rect x="380" y="120" width="440" height="330" rx="10" fill="#C9D3D6" stroke="#B7BFC2" stroke-width="8"/><rect x="200" y="540" width="800" height="40" fill="#6B6560"/><rect x="240" y="580" width="720" height="320" fill="#F6F4F0"/><path d="M600 580v320" stroke="#D5CFC6" stroke-width="4"/></svg>`;
const BATH = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="#E4E0D8"/><rect y="760" width="900" height="440" fill="#CFC8BC"/><path d="M0 760h900" stroke="#B9B1A4" stroke-width="6"/><rect x="250" y="520" width="400" height="300" rx="40" fill="#F7F6F2" stroke="#C8C3BA" stroke-width="6"/></svg>`;
const photo = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function samplePage(): Page {
  const circle: Mark = { tool: 'circle', color: 'red', from: [0.33, 0.12], to: [0.67, 0.5] };
  const label: Mark = { tool: 'text', color: 'red', at: [0.5, 0.57], text: 'Faucet here' };
  const arrow: Mark = { tool: 'arrow', color: 'yellow', from: [0.2, 0.3], to: [0.4, 0.5] };
  return {
    builder: 'Sample Builder',
    job: { name: 'Sample Job', address: '100 Gulf Drive', closed: false },
    company: { id: 'sample-company', name: 'Sample Plumbing' },
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111', number: 12, title: 'Install vanity faucets', description: 'Both sinks in the primary bath.',
        location: 'Primary Bath 207', floor: 'Level 2', kind: 'completion', ready: true, waiting_on: [], waiting_for: [], ready_by: null, hours: 2,
        priority: true, po_or_co: null, checklist: [], confirmed_at: ago(20), marked_done_at: null,
        photos: [{ url: photo(WALL), width: 1200, height: 900, marks: [circle, label] }],
      },
      {
        id: '22222222-2222-4222-8222-222222222222', number: 14, title: 'Set the toilet', description: '',
        location: 'Guest Bath 210', floor: 'Level 2', kind: 'completion', ready: false, waiting_on: ['the owner'],
        waiting_for: [{ title: 'Install tile floor', company: 'Sample Tile', location: 'Guest Bath 210' }], ready_by: daysFromNow(9), hours: null,
        priority: false, po_or_co: null, checklist: [], confirmed_at: null, marked_done_at: null,
        photos: [{ url: photo(BATH), width: 900, height: 1200, marks: [arrow] }],
      },
      {
        id: '33333333-3333-4333-8333-333333333333', number: 19, title: 'Add a hose bib on the deck', description: 'The owner asked for one by the grill.',
        location: 'Deck', floor: null, kind: 'added_scope', ready: true, waiting_on: [], waiting_for: [], ready_by: null, hours: null,
        priority: false, po_or_co: null, checklist: [], confirmed_at: null, marked_done_at: null, photos: [],
      },
    ],
    completed: [{ id: '44444444-4444-4444-8444-444444444444', number: 3, title: 'Cap the laundry lines', location: 'Laundry 112', completed_at: ago(30) }],
    comments: [
      { id: 'm1', item_id: '22222222-2222-4222-8222-222222222222', body: 'Tile goes in next week. I will let you know when it is ready.', from_company: false, author: 'Sample Superintendent', created_at: ago(5) },
    ],
  };
}

/** What the function would do with an answer, done here on the sample instead. */
export function answerSample(page: Page, body: Record<string, unknown>): Page {
  const item = page.items.find((i) => i.id === body.item);
  const now = new Date().toISOString();
  if (body.action === 'confirm' && item) item.confirmed_at = body.value === false ? null : now;
  if (body.action === 'done' && item) item.marked_done_at = body.value === false ? null : now;
  if (body.action === 'hours' && item) item.hours = typeof body.value === 'number' ? body.value : null;
  if (body.action === 'comment' && typeof body.value === 'string' && body.value.trim()) {
    page.comments.push({
      id: `m${page.comments.length + 1}`,
      item_id: typeof body.item === 'string' ? body.item : null,
      body: body.value.trim(),
      from_company: true,
      author: typeof body.name === 'string' && body.name ? body.name : null,
      created_at: now,
    });
  }
  return page;
}
