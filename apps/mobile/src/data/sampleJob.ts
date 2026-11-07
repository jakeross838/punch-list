// Adds the Sample Job (packages/core/src/sampleJob.ts) through the same steps a person would take,
// so it is kept and synced like any other job: the job with you as its project manager, its
// locations, the sample companies on it, each item, its photos and comments, and the first floor's
// plan with items pinned on it. The photos come from the app itself (samplePhotoFiles).

import {
  kindDefaults,
  parseRoomList,
  SAMPLE_JOB,
  sampleJobName,
  sampleTrades,
  tidyItem,
  type ItemFields,
  type SamplePhotoName,
} from '@punch/core';
import type { DataApi } from './api';
import type { SampleState as State } from './sample';

/** Each drawn photo as a picture the data layer can keep, like one from the camera. */
export type SamplePhotoFiles = Record<SamplePhotoName, { uri: string; width: number; height: number }>;

/** Today plus some days, as a date. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Adds the Sample Job and answers its id. Admins only, as for any new job. */
export async function addSampleJob(api: DataApi, get: () => State, photos: SamplePhotoFiles): Promise<string> {
  const start = get();
  const me = start.me;
  const builder = start.org.name || 'Builder';
  const jobId = await api.createJob({ name: sampleJobName(start.jobs.map((j) => j.name)), address: SAMPLE_JOB.address, projectManagerId: me.id });
  await api.addLocations(jobId, parseRoomList(SAMPLE_JOB.rooms).locations);
  const locations = new Map(get().locations.filter((l) => l.jobId === jobId).map((l) => [l.label.toLowerCase(), l.id]));

  // The trades every company starts with; one renamed or taken away is put back.
  const tradeIds = new Map<string, string>();
  for (const name of sampleTrades()) {
    const have = get().trades.find((t) => t.name.toLowerCase() === name.toLowerCase());
    tradeIds.set(name, have?.id ?? (await api.addTrade(name)));
  }
  // The sample companies, once each across every Sample Job, each on this job for its trade.
  const companyIds = new Map<string, { id: string; tradeId: string }>();
  for (const c of SAMPLE_JOB.companies) {
    const tradeId = tradeIds.get(c.trade)!;
    const have = get().companies.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    const id = have?.id ?? (await api.addCompany({ name: c.name, defaultTradeId: tradeId }));
    await api.addCompanyToJob(jobId, id, tradeId);
    companyIds.set(c.name, { id, tradeId });
  }

  const ids = new Map<string, string>();
  const pins: { id: string; at: [number, number] }[] = [];
  for (const s of SAMPLE_JOB.items) {
    const company = s.company ? companyIds.get(s.company) : undefined;
    const waits = s.waitsOn ? ids.get(s.waitsOn) : undefined;
    const waitingOn = (s.waitingOn ?? []).map((w) => (w === 'owner' ? 'Owner' : builder));
    const fields: ItemFields = tidyItem({
      title: s.title,
      description: s.description,
      tradeId: company?.tradeId ?? null,
      companyId: company?.id ?? null,
      // Work for you: on your My Items. A draft is no one's yet.
      assignedTo: !company && !s.draft ? me.id : null,
      ...kindDefaults(s.kind ?? 'completion', { poOrCo: s.poOrCo ?? null }),
      ready: !waits && waitingOn.length === 0,
      waitingOn,
      waitingOnItems: waits ? [waits] : [],
      readyBy: s.readyInDays ? daysFromNow(s.readyInDays) : null,
      status: 'open',
      completedBy: null,
      completedAt: null,
      extra: {},
      unfinished: !!s.draft,
      visitId: null,
      hours: s.hours ?? null,
      priority: !!s.priority,
    });
    const id = await api.createItem({ ...fields, jobId, locationId: locations.get(s.location.toLowerCase()) ?? '', source: s.draft ? 'walk' : 'typed' });
    ids.set(s.key, id);
    if (s.photo) {
      const file = photos[s.photo.name];
      await api.addPhotos([{ jobId, itemId: id, uri: file.uri, width: file.width, height: file.height, marks: s.photo.marks }]);
    }
    for (const c of s.comments ?? []) await api.addComment({ jobId, itemId: id, companyId: null, body: c.body, internal: c.internal });
    if (s.done) await api.updateItem(id, { status: 'complete', completedBy: me.id, completedAt: new Date().toISOString() });
    if (s.pin) pins.push({ id, at: s.pin });
  }

  // The first floor's plan, with items where they are on it.
  const plan = photos[SAMPLE_JOB.plan.photo];
  const planId = await api.addPlan({ jobId, floor: SAMPLE_JOB.plan.floor, name: SAMPLE_JOB.plan.name, uri: plan.uri, width: plan.width, height: plan.height });
  await api.updateItems(pins.map((p) => ({ id: p.id, patch: { planId, pinX: p.at[0], pinY: p.at[1] } })));
  return jobId;
}
