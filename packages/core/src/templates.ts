// Templates: what always needs doing in a house, kept once and added to any job in one go. A
// template is a named list of tasks. Each task says where it goes: the Whole House or another of
// the areas every job has (Roof, Pool, Driveway and the rest), or every location of a kind, like
// every bathroom. It carries its trade (the company doing that trade on the job does it), its type,
// its usual time, and the other tasks in the template it waits on. Adding a template puts each task
// in each location it fits, leaves out any already on the list there, and keeps the waits between
// them. Saving a template from items on a job keeps their titles, trades, types and times, and
// where each went by its kind of location.

import { featureOn } from './features';
import { companyForTrade } from './titles';
import { hasOrder, tidyItem } from './rules';
import { ROOM_KIND_LABELS, ROOM_KINDS, roomKind } from './roomTasks';
import { inWalkOrder, SHARED_AREAS, type SharedArea } from './rooms';
import { firstThingsFirst, twinIn, type PlannedItem } from './copy';
import type { ItemFields } from './rules';
import type { Item, ItemKind, JobCompany, Location, RoomKind } from './types';

/** Where a template's task goes: one of the areas every job has, or every location of a kind. */
export type TemplatePlace = SharedArea | RoomKind;

export interface Template {
  id: string;
  name: string;
  /** Switched off: no longer offered. Nothing is deleted. */
  active: boolean;
  sortOrder: number;
}

export interface TemplateItem {
  id: string;
  templateId: string;
  title: string;
  description: string;
  kind: ItemKind;
  /** The trade that does it: the company doing that trade on the job gets it. */
  tradeId: string | null;
  hours: number | null;
  place: TemplatePlace;
  /** Other tasks in the template that have to be done first. */
  waitsOn: string[];
  sortOrder: number;
  active: boolean;
}

/** Every place a task can go, in the order a template lists them: the Whole House first. */
export const TEMPLATE_PLACES: TemplatePlace[] = ['Whole House', ...ROOM_KINDS, ...SHARED_AREAS.filter((a) => a !== 'Whole House')];

const SINGULAR: Record<RoomKind, string> = {
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  laundry: 'Laundry Room',
  bedroom: 'Bedroom',
  closet: 'Closet and Pantry',
  living: 'Living Area and Hall',
  garage: 'Garage',
  outside: 'Outside Room',
};

export const isRoomKind = (place: string): place is RoomKind => (ROOM_KINDS as string[]).includes(place);

export const isTemplatePlace = (place: unknown): place is TemplatePlace => typeof place === 'string' && (TEMPLATE_PLACES as string[]).includes(place);

/** A place as a template shows it: "Every Bathroom", "Whole House", "Roof". */
export function placeLabel(place: TemplatePlace): string {
  return isRoomKind(place) ? `Every ${SINGULAR[place]}` : place;
}

/** A place as a heading over its tasks: "Bathrooms", "Whole House". */
export function placeHeading(place: TemplatePlace): string {
  return isRoomKind(place) ? ROOM_KIND_LABELS[place] : place;
}

/** Where a location's tasks go in a template: its area, or its kind of room. Null when its name does not say. */
export function placeOf(location: Pick<Location, 'kind' | 'label'>): TemplatePlace | null {
  if (location.kind === 'shared') return (SHARED_AREAS as readonly string[]).includes(location.label) ? (location.label as SharedArea) : null;
  return roomKind(location.label);
}

/** The job's locations a place fits: the area by its name, or every room of that kind. */
export function locationsFor(place: TemplatePlace, locations: Location[]): Location[] {
  const live = inWalkOrder(locations.filter((l) => l.active));
  if (isRoomKind(place)) return live.filter((l) => l.kind === 'room' && roomKind(l.label) === place);
  return live.filter((l) => l.kind === 'shared' && l.label.toLowerCase() === place.toLowerCase());
}

export interface TemplatePlan {
  items: PlannedItem[];
  /** Tasks left out because the same title is already on the list there, open or done. */
  skipped: number;
  /** Places with no location on the job: their tasks have nowhere to go. */
  missing: TemplatePlace[];
  /** Items that go to Drafts for their company: no company does their trade on the job, or more than one does. */
  needCompany: number;
  /** How many land in each location, in the job's order. */
  byLocation: { locationId: string; count: number }[];
}

export interface TemplatePlanOptions {
  /** Just the tasks that fit this one location. */
  onlyLocationId?: string;
  /** Just the tasks that fit these locations: the ones the plans just added. */
  onlyLocationIds?: string[];
  /** Just the tasks for these places. */
  places?: TemplatePlace[];
  /** Just these tasks; the rest still count for what these wait on. */
  taskIds?: string[];
  /** Every task picked goes in this one location, whatever its place: Common Tasks. */
  intoLocationId?: string;
}

/** What adding a template to a job makes. newId makes the ids of the new items. */
export function templatePlan(
  tasks: TemplateItem[],
  job: { jobId: string; locations: Location[]; items: Item[]; jobCompanies: JobCompany[] },
  newId: () => string,
  options: TemplatePlanOptions = {},
): TemplatePlan {
  const live = tasks.filter((t) => t.active && t.title.trim() !== '').sort((a, b) => a.sortOrder - b.sortOrder);
  const wanted = live.filter((t) => (!options.places || options.places.includes(t.place)) && (!options.taskIds || options.taskIds.includes(t.id)));
  const into = options.intoLocationId ? job.locations.filter((l) => l.id === options.intoLocationId) : null;
  const existing = job.items.filter((i) => i.status !== 'removed');
  // Each task's item in each location: a new one, or the item already there with its title.
  const madeIn = new Map<string, Map<string, string>>();
  const missing: TemplatePlace[] = [];
  const planned: { task: TemplateItem; locationId: string; id: string }[] = [];
  const plannedKeys = new Set<string>();
  let skipped = 0;
  for (const task of wanted) {
    const where =
      into ??
      locationsFor(task.place, job.locations).filter((l) => (!options.onlyLocationId || l.id === options.onlyLocationId) && (!options.onlyLocationIds || options.onlyLocationIds.includes(l.id)));
    if (where.length === 0 && !options.onlyLocationId && !options.onlyLocationIds && !into && !missing.includes(task.place)) missing.push(task.place);
    const ids = new Map<string, string>();
    for (const l of where) {
      const twin = twinIn(task.title, l.id, existing, true);
      const key = `${l.id}|${titleKey(task.title)}`;
      if (twin) {
        skipped += 1;
        ids.set(l.id, twin.id);
      } else if (plannedKeys.has(key)) {
        // The same title twice in the template lands once.
        ids.set(l.id, planned.find((p) => p.locationId === l.id && titleKey(p.task.title) === titleKey(task.title))!.id);
      } else {
        const id = newId();
        ids.set(l.id, id);
        planned.push({ task, locationId: l.id, id });
        plannedKeys.add(key);
      }
    }
    madeIn.set(task.id, ids);
  }
  /** A task that was not added this time, already open on the job: its items by location. */
  const alreadyOn = (taskId: string): Map<string, string> => {
    const found = new Map<string, string>();
    const other = live.find((t) => t.id === taskId);
    if (!other) return found;
    for (const l of [...(into ?? []), ...locationsFor(other.place, job.locations)]) {
      const twin = twinIn(other.title, l.id, existing);
      if (twin) found.set(l.id, twin.id);
    }
    return found;
  };
  // A task waits on the task it names in the same location, else on the one in an area.
  const waitFor = (taskId: string, locationId: string): string | null => {
    const ids = madeIn.get(taskId) ?? alreadyOn(taskId);
    if (ids.size === 0) return null;
    return ids.get(locationId) ?? (ids.size === 1 ? [...ids.values()][0]! : null);
  };
  let needCompany = 0;
  const items = planned.map(({ task, locationId, id }): PlannedItem => {
    const waitingOnItems = [...new Set(task.waitsOn.flatMap((w) => (w === task.id ? [] : (waitFor(w, locationId) ?? []))))].filter((w) => w !== id);
    const companyId = companyForTrade(task.tradeId, job.jobCompanies);
    if (!companyId) needCompany += 1;
    const kind = featureOn('types') ? task.kind : 'completion';
    const fields: ItemFields = {
      assignedTo: null,
      title: task.title.trim(),
      description: task.description.trim(),
      tradeId: task.tradeId,
      companyId,
      // A type or a time nobody can see is not put on new work: each comes back with its switch.
      kind,
      ready: waitingOnItems.length === 0,
      waitingOn: [],
      waitingOnItems,
      readyBy: null,
      boughtOut: hasOrder({ kind, poOrCo: null }),
      poOrCo: null,
      status: 'open',
      completedBy: null,
      completedAt: null,
      extra: {},
      // Without a company it waits in Drafts until one is picked.
      unfinished: !companyId,
      visitId: null,
      hours: featureOn('hours') ? task.hours : null,
    };
    return { ...tidyItem(fields), id, jobId: job.jobId, locationId, source: 'template' };
  });
  const order = inWalkOrder(job.locations).map((l) => l.id);
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.locationId, (counts.get(i.locationId) ?? 0) + 1);
  const byLocation = order.filter((id) => counts.has(id)).map((locationId) => ({ locationId, count: counts.get(locationId)! }));
  return { items: firstThingsFirst(items), skipped, missing, needCompany, byLocation };
}

export interface NewTemplateItem extends Omit<TemplateItem, 'id' | 'templateId' | 'active'> {
  /** Kept only to tie the waits together while saving: the task's id in the new template. */
  key: string;
}

/**
 * A template from items on a job: each title once for each place, in list order, with its trade,
 * type, description and time, and the waits between the items picked. Items in a location whose
 * name does not say its kind go to the Whole House.
 */
export function templateFromItems(items: Item[], locations: Location[], newId: () => string): NewTemplateItem[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const order = (i: Item) => byId.get(i.locationId)?.sortOrder ?? 0;
  const picked = [...items].filter((i) => i.status !== 'removed' && i.title.trim() !== '').sort((a, b) => order(a) - order(b) || (a.number ?? 0) - (b.number ?? 0));
  const keyOf = new Map<string, string>();
  const out: NewTemplateItem[] = [];
  for (const item of picked) {
    const l = byId.get(item.locationId);
    const place: TemplatePlace = (l && placeOf(l)) ?? 'Whole House';
    const same = out.find((t) => t.place === place && titleKey(t.title) === titleKey(item.title));
    if (same) {
      keyOf.set(item.id, same.key);
      continue;
    }
    const key = newId();
    keyOf.set(item.id, key);
    out.push({ key, title: item.title.trim(), description: item.description.trim(), kind: item.kind, tradeId: item.tradeId, hours: item.hours, place, waitsOn: [], sortOrder: out.length + 1 });
  }
  for (const item of picked) {
    const key = keyOf.get(item.id)!;
    const task = out.find((t) => t.key === key)!;
    for (const w of item.waitingOnItems) {
      const other = keyOf.get(w);
      if (other && other !== key && !task.waitsOn.includes(other)) task.waitsOn.push(other);
    }
  }
  return out;
}

const titleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Common Tasks for a place: every template's tasks there, template by template in order, each title
 * once. A walk offers them in each location of that place, to add with a tap.
 */
export function commonTasks(place: TemplatePlace, templates: Template[], tasks: TemplateItem[]): { template: Template; tasks: TemplateItem[] }[] {
  const seen = new Set<string>();
  return [...templates]
    .filter((t) => t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((template) => ({
      template,
      tasks: tasks
        .filter((t) => t.templateId === template.id && t.active && t.place === place && t.title.trim() !== '')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((t) => {
          const key = titleKey(t.title);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    }))
    .filter((g) => g.tasks.length > 0);
}

/** The places Common Tasks offers in a location: its own place first, then every kind of room, then the Whole House. */
export function commonPlaces(location: Pick<Location, 'kind' | 'label'> | null | undefined): TemplatePlace[] {
  const own = location ? placeOf(location) : null;
  return [...new Set<TemplatePlace>([...(own ? [own] : []), ...ROOM_KINDS, 'Whole House'])];
}

/** "12 tasks" */
export const taskCount = (n: number) => (n === 1 ? '1 task' : `${n} tasks`);
