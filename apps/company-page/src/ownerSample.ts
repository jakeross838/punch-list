// The sample owner's page, at /o#sample: what an owner sees, with a made up house, for the preview of
// the app and for showing anyone how it goes. Nothing it does is sent anywhere; it resets when the
// page is opened again.

import type { Mark } from '@punch/core';
import type { OwnerPage } from './types';

/** A drawn stand-in for a photo of finished work: a painted wall with a new outlet cover. */
const WALL = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#E8E3DA"/><rect y="700" width="1200" height="200" fill="#B9A890"/><rect x="560" y="420" width="80" height="120" rx="6" fill="#F7F6F2" stroke="#C8C3BA" stroke-width="5"/></svg>`;
const DOOR = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="#DCD6CC"/><rect x="200" y="120" width="500" height="1000" fill="#F4F1EA" stroke="#C3BBAE" stroke-width="8"/><circle cx="640" cy="640" r="18" fill="#9C9286"/></svg>`;
const photo = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function sampleOwnerPage(): OwnerPage {
  const circle: Mark = { tool: 'circle', color: 'red', from: [0.42, 0.42], to: [0.58, 0.64] };
  return {
    builder: 'Sample Builder',
    job: { name: 'Sample Job', address: '100 Gulf Drive', closed: false },
    owner: 'Sample Owner',
    locations: [
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        label: 'Kitchen 109',
        floor: 'Level 1',
        open: [
          { id: 'k1', title: 'Adjust cabinet door', ready: true, waits_on_owner: false },
          { id: 'k2', title: 'Pick the pendant lights', ready: false, waits_on_owner: true },
        ],
        done: [
          { id: 'k3', title: 'Replace outlet cover', completed_at: ago(26), photos: [{ url: photo(WALL), width: 1200, height: 900, marks: [circle], done: true }] },
        ],
      },
      {
        id: 'b2222222-2222-4222-8222-222222222222',
        label: 'Primary Bath 207',
        floor: 'Level 2',
        open: [{ id: 'b1', title: 'Install vanity faucets', ready: true, waits_on_owner: false }],
        done: [{ id: 'b2', title: 'Touch up paint on the door', completed_at: ago(50), photos: [{ url: photo(DOOR), width: 900, height: 1200, marks: [], done: true }] }],
      },
      { id: 'c3333333-3333-4333-8333-333333333333', label: 'Garage 101', floor: 'Level 1', open: [], done: [] },
    ],
    added: [{ id: 'o1', words: 'The pantry door sticks at the top', title: 'Adjust pantry door', location: 'Kitchen 109', status: 'on_list', created_at: ago(72) }],
    sign_offs: [],
  };
}

/** An answer on the sample, made here: what the function would have done. */
export function answerOwnerSample(page: OwnerPage, body: Record<string, unknown>): OwnerPage {
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (body.action === 'add') {
    const words = typeof body.words === 'string' ? body.words.replace(/\s+/g, ' ').trim() : '';
    if (!words && typeof body.photo !== 'string') throw new Error('Say what to look at, or add a photo');
    const place = page.locations.find((l) => l.id === body.location);
    return { ...page, added: [{ id: `o${page.added.length + 2}`, words, title: null, location: place?.label ?? null, status: 'received', created_at: new Date().toISOString() }, ...page.added] };
  }
  if (body.action === 'sign-off') {
    if (!name || name.length < 2) throw new Error('Type your name to sign off');
    const place = page.locations.find((l) => l.id === body.location);
    const open = place ? place.open.length : page.locations.reduce((n, l) => n + l.open.length, 0);
    return { ...page, sign_offs: [{ name, location: place?.label ?? null, open, at: new Date().toISOString() }, ...page.sign_offs] };
  }
  return page;
}
