// Checks the iPhone's writes against the real database. The app's own rules make each change the
// way the live backend does, the write planner turns it into the phone's writes, and each write
// goes to a fresh local copy of the database the way the PowerSync connector sends it: through the
// access rules, as the signed-in person. Any write the database turns down, or an update that
// finds nothing to change (which the server would drop without a word), fails the run. Then the
// database's own work is checked: item numbers, the trade, freed items, the team, the log.
//
//   npm run test:live-writes

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DEFAULT_FORM, DEFAULT_VIEW, moveLevel, outsideAreas, planLocations, type Item, type Person } from '@punch/core';
import type { NewItem } from '../apps/mobile/src/data/api';
import { makeApi, type Keeper, type State } from '../apps/mobile/src/data/engine';
import { planWrites, type HoldupRow, type Write } from '../apps/mobile/src/data/live/writes';
import { KEY_COLUMNS, toServerRow } from '../apps/mobile/src/data/rows';

const ORG = 'ross_built';
const DB = `punch_live_${Date.now()}_${process.pid}`;

function psql(sql: string, database = DB): string {
  return execFileSync('runuser', ['-u', 'postgres', '--', 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const json = (v: unknown) => {
  const tag = `$j${randomUUID().slice(0, 8)}$`;
  return `${tag}${JSON.stringify(v)}${tag}::json`;
};

/** Tables only on the phone: never sent up. */
const LOCAL_ONLY = new Set(['photo_files', 'rejected_changes']);

let signedIn = 'jake@rossbuilt.com';
const failures: string[] = [];
let sent = 0;

/** One write as the connector sends it through Supabase, as the signed-in person. */
function send(w: Write): void {
  if (LOCAL_ONLY.has(w.table)) return;
  const key = KEY_COLUMNS[w.table] ?? 'id';
  const t = `public.${w.table}`;
  let statement: string;
  if (w.op === 'delete') {
    statement = `with d as (delete from ${t} where ${key} = ${lit(w.id)} returning 1) select count(*) from d`;
  } else {
    // The phone's insert carries the org, as the phone's database does.
    const data = toServerRow(w.table, w.op === 'insert' ? { org: ORG, ...w.values } : w.values);
    const row = w.op === 'insert' ? { ...data, [key]: w.id } : data;
    const cols = Object.keys(row);
    const from = `from json_populate_record(null::${t}, ${json(row)})`;
    statement =
      w.op === 'insert'
        ? `with i as (insert into ${t} (${cols.join(', ')}) select ${cols.join(', ')} ${from} returning 1) select count(*) from i`
        : cols.length === 1
          ? `with u as (update ${t} set ${cols[0]} = (select ${cols[0]} ${from}) where ${key} = ${lit(w.id)} returning 1) select count(*) from u`
          : `with u as (update ${t} set (${cols.join(', ')}) = (select ${cols.join(', ')} ${from}) where ${key} = ${lit(w.id)} returning 1) select count(*) from u`;
  }
  sent++;
  try {
    const count = psql(
      `begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', ${lit(JSON.stringify({ email: signedIn }))}, true) \\g /dev/null\n${statement};\ncommit;\n`,
    );
    if (count !== '1') failures.push(`${signedIn}: ${w.op} ${w.table} ${w.id} reached ${count || 'no'} rows: ${JSON.stringify(w.values)}`);
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    failures.push(`${signedIn}: ${w.op} ${w.table} ${w.id} ${JSON.stringify(w.values)}\n    ${(err.stderr ?? err.message).trim().split('\n')[0]}`);
  }
}

// ---------- a fresh database with two people ----------

const asPostgres = (file: string) =>
  execFileSync('runuser', ['-u', 'postgres', '--', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', file], { stdio: ['ignore', 'ignore', 'pipe'] });

execFileSync('runuser', ['-u', 'postgres', '--', 'createdb', DB]);
process.on('exit', () => {
  try {
    execFileSync('runuser', ['-u', 'postgres', '--', 'dropdb', '--if-exists', DB], { stdio: 'ignore' });
  } catch {
    // Left for the next clean up.
  }
});

asPostgres('supabase/test/local-stub.sql');
for (const f of execFileSync('ls', ['supabase/migrations'], { encoding: 'utf8' }).trim().split('\n')) asPostgres(`supabase/migrations/${f}`);
psql(`insert into public.people (org, email, name, role, sees) values ('${ORG}', 'jake@rossbuilt.com', 'Jake Ross', 'admin', 'all'), ('${ORG}', 'sam@rossbuilt.com', 'Sam Rivera', 'team', 'assigned');`);

const people: Person[] = (
  JSON.parse(psql(`select json_agg(json_build_object('id', id, 'email', email, 'name', name, 'role', role, 'sees', sees)) from public.people`)) as Omit<Person, 'active' | 'phone'>[]
).map((p) => ({ ...p, active: true, phone: null }));
const jake = people.find((p) => p.email === 'jake@rossbuilt.com')!;
const sam = people.find((p) => p.email === 'sam@rossbuilt.com')!;

// ---------- the live backend's keeping, without a phone ----------

let state: State = {
  me: jake,
  signedIn: true,
  codeFor: null,
  newAccount: null,
  org: { id: ORG, name: 'Ross Built' },
  people,
  activity: [],
  jobs: [],
  team: [],
  locations: [],
  trades: [],
  companies: [],
  contacts: [],
  links: [],
  jobCompanies: [],
  waitingOn: {},
  items: [],
  photos: [],
  plans: [],
  visits: [],
  sends: [],
  comments: [],
  titles: [],
  customFields: [],
  templates: [],
  templateItems: [],
  formSettings: DEFAULT_FORM,
  viewSettings: DEFAULT_VIEW,
  counters: {},
};
const holdups = new Map<string, HoldupRow[]>();
const hasSettings = new Set<string>();

const keeper: Keeper = {
  mode: 'live',
  server: true,
  get: () => state,
  subscribe: () => () => {},
  async save(next) {
    const plan = planWrites(state, next, { meId: state.me.id, hasSettings: hasSettings.has(state.me.id), holdups, newId: randomUUID });
    for (const w of plan.writes) {
      send(w);
      if (w.table === 'person_settings' && w.op === 'insert') hasSettings.add(w.id);
    }
    for (const [job, rows] of plan.holdups) holdups.set(job, rows);
    const { me: _me, signedIn: _in, codeFor: _code, counters: _counters, activity: _activity, ...kept } = plan.next;
    state = { ...state, ...kept };
  },
  keepPhoto: async (_uri, id) => `file:///photos/${id}.jpg`,
};

const api = makeApi(keeper, {
  sendSignInCode: async () => {},
  verifySignInCode: async () => 'signed_in',
  startCompany: async () => {},
  deleteAccount: async () => {},
  signOut: async () => {},
});

function signIn(person: Person): void {
  signedIn = person.email;
  state = { ...state, me: person };
}

const blank = (over: Partial<NewItem> & Pick<NewItem, 'jobId' | 'locationId' | 'title' | 'companyId'>): NewItem => ({
  description: '',
  tradeId: null,
  kind: 'completion',
  ready: true,
  waitingOn: [],
  waitingOnItems: [],
  readyBy: null,
  boughtOut: true,
  poOrCo: null,
  status: 'open',
  completedBy: null,
  completedAt: null,
  extra: {},
  unfinished: false,
  visitId: null,
  hours: null,
  assignedTo: null,
  source: 'typed',
  ...over,
});

const steps: string[] = [];
async function step(name: string, run: () => Promise<unknown>): Promise<void> {
  const before = failures.length;
  try {
    await run();
  } catch (e) {
    failures.push(`${name}: the app refused it: ${e instanceof Error ? e.message : String(e)}`);
  }
  steps.push(failures.length === before ? name : `${name} (FAILED)`);
}

async function main(): Promise<void> {
  // ---------- as Jake, an admin ----------

  let jobId = '';
  let copied = '';
  let kitchen = '';
  let bath = '';
  let carpentry = '';
  let electrical = '';
  let sms = '';
  let sparks = '';
  let first = '';
  let second = '';
  let third = '';
  let uncropped = '';
  let cropped = '';

  await step("the company's name, changed by its admin", async () => {
    await api.renameOrg('  Ross   Built Custom Homes ');
  });
  await step('a new job, with Jake as its Project Manager', async () => {
    jobId = await api.createJob({ name: 'Fish', address: '715 North Shore Drive', projectManagerId: jake.id });
  });
  await step('locations pasted in', async () => {
    await api.addLocations(jobId, [
      { name: 'Kitchen', number: '101', label: '101 Kitchen', floor: 'First Floor', kind: 'room', sortOrder: 1 },
      { name: 'Primary Bath', number: '201', label: '201 Primary Bath', floor: 'Second Floor', kind: 'room', sortOrder: 2 },
      { name: 'Whole House', number: null, label: 'Whole House', floor: null, kind: 'shared', sortOrder: 3 },
    ]);
    kitchen = state.locations.find((l) => l.name === 'Kitchen')!.id;
    bath = state.locations.find((l) => l.name === 'Primary Bath')!.id;
  });
  await step('trades, in order', async () => {
    electrical = await api.addTrade('Low Voltage');
    carpentry = await api.addTrade('Carpentry');
    await api.reorderTrades([carpentry, electrical]);
  });
  await step('companies, on the job for their trades', async () => {
    sms = await api.addCompany({ name: 'SMS Carpentry', defaultTradeId: carpentry });
    sparks = await api.addCompany({ name: 'Sparks Electric', defaultTradeId: electrical });
    await api.addCompanyToJob(jobId, sms, carpentry);
    await api.addCompanyToJob(jobId, sparks, electrical);
  });
  await step("a company's people", async () => {
    const mike = await api.addContact({ companyId: sms, name: 'Mike Smith', email: 'Mike@SMS.example', phone: null, getsLists: true });
    await api.addContact({ companyId: sparks, name: 'Dan', email: null, phone: '941 555 0100', getsLists: true });
    await api.updateContact(mike, { phone: '941 555 0111' });
  });
  await step('Sam on the team, then as Field', async () => {
    await api.setTeamMember(jobId, sam.id, 'superintendent');
    await api.setTeamMember(jobId, sam.id, 'field');
  });
  await step('items: a task, one waiting on it, one waiting on the owner', async () => {
    first = await api.createItem(blank({ jobId, locationId: kitchen, title: 'Install cabinet hardware', companyId: sms, hours: 2 }));
    second = await api.createItem(blank({ jobId, locationId: kitchen, title: 'Install pendant lights', companyId: sparks, ready: false, waitingOnItems: [first] }));
    third = await api.createItem(blank({ jobId, locationId: bath, title: 'Install towel bar', companyId: sms, ready: false, waitingOn: ['Owner'], kind: 'added_scope', poOrCo: 'CO 12' }));
  });
  await step('a draft from the camera, then finished', async () => {
    const draft = await api.createItem(blank({ jobId, locationId: '', title: '', companyId: null, unfinished: true, source: 'walk' }));
    await api.addPhotos([{ jobId, itemId: draft, uri: 'file:///tmp/camera.jpg', width: 4032, height: 3024, marks: [] }]);
    await api.updateItem(draft, { locationId: bath, title: 'Caulk tub surround', companyId: sms, unfinished: false });
  });
  await step('photos marked up, and one removed', async () => {
    await api.addPhotos([
      { jobId, itemId: first, uri: 'file:///tmp/a.jpg', width: 3024, height: 4032, marks: [] },
      { jobId, itemId: first, uri: 'file:///tmp/b.jpg', width: 3024, height: 4032, marks: [] },
    ]);
    const [a, b] = state.photos.filter((p) => p.itemId === first);
    await api.updatePhoto(a!.id, { marks: [{ tool: 'circle', color: 'red', from: [0.2, 0.2], to: [0.4, 0.4] }] });
    await api.updatePhoto(b!.id, { removed: true });
    // The uploader, once a picture is up.
    send({ table: 'photos', op: 'update', id: a!.id, values: { storage_path: `${jobId}/${a!.id}.jpg` } });
    // What is in it, in Claude's words, for search.
    await api.setPhotoWords(a!.id, '  water stain   on the ceiling ');
  });
  await step('a photo cropped in markup: the new picture takes its place with the marks moved, and the one before is kept, removed', async () => {
    const a = state.photos.find((p) => p.itemId === first && !p.removed);
    uncropped = a!.id;
    cropped = (await api.replacePhoto(uncropped, { uri: 'file:///tmp/a-cropped.jpg', width: 4032, height: 3024, marks: [{ tool: 'circle', color: 'red', from: [0.1, 0.3], to: [0.4, 0.6] }] })) ?? '';
  });
  await step('a plan for the level, an item pinned on it, a priority and a checklist', async () => {
    const plan = await api.addPlan({ jobId, floor: 'Level 1', name: 'Level 1 Plan', uri: 'file:///tmp/plan.jpg', width: 1600, height: 1100 });
    await api.updateItem(second, { planId: plan, pinX: 0.4, pinY: 0.6, priority: true, checklist: [{ id: 'step-1', text: 'Both hinges', done: false }] });
    // The uploader, once the plan's picture is up.
    send({ table: 'plan_sheets', op: 'update', id: plan, values: { storage_path: `${jobId}/plans/${plan}.jpg` } });
    await api.updatePlan(plan, { name: 'Level 1 Floor Plan' });
  });
  await step('the first task done: the item waiting on it is ready', async () => {
    await api.updateItem(first, { status: 'complete', completedBy: jake.id, completedAt: new Date().toISOString() });
  });
  await step('To Check: the company says it is done, Complete answers it, and Undo puts it back', async () => {
    const said = '2026-11-04T17:10:00.000Z';
    await api.updateItem(second, { markedDoneAt: said });
    // What Complete and its Undo send from the app.
    await api.updateItem(second, { status: 'complete', completedBy: jake.id, completedAt: new Date().toISOString(), markedDoneAt: null });
    await api.updateItem(second, { status: 'open', completedBy: null, completedAt: null, markedDoneAt: said });
  });
  await step('a visit, moved, confirmed, then removed', async () => {
    const visit = await api.addVisit({ jobId, companyId: sms, start: '2026-11-10', days: 2, confirmed: false, itemIds: [third] });
    await api.updateVisit(visit, { start: '2026-11-11' }, [third]);
    await api.updateVisit(visit, { confirmed: true });
    await api.keepVisitDates(visit);
    await api.removeVisit(visit);
  });
  await step('comments, and one taken back', async () => {
    await api.addComment({ jobId, itemId: third, companyId: null, body: 'Owner picked the bar.', internal: false });
    const note = await api.addComment({ jobId, itemId: null, companyId: sms, body: 'Ross Built only: check the PO.', internal: true });
    await api.setCommentRemoved(note, true);
  });
  await step('a list sent with the schedule, then Undo', async () => {
    const send1 = await api.recordSend({
      jobId,
      list: 'schedule',
      itemIds: [second, third],
      snapshot: { finish: '2026-12-18', bars: [{ key: 'visit:x', companyId: sms, start: '2026-11-11', end: '2026-11-12', confirmed: true }] },
    });
    await api.recordSend({ jobId, list: `company:${sms}`, itemIds: [third] });
    await api.undoSend(send1);
  });
  await step("a company's link, then taken back", async () => {
    const token = await api.companyLink(jobId, sms);
    await api.revokeCompanyLink(token);
    await api.companyLink(jobId, sms);
  });
  await step('Waiting On choices: added, put in order, one taken off', async () => {
    await api.setWaitingOnExtras(jobId, ['Owner', 'Design Team', 'Engineer']);
    await api.setWaitingOnExtras(jobId, ['Engineer', 'Owner']);
  });
  await step('settings: the Item Form, then the job view', async () => {
    await api.setFormSettings({ ...DEFAULT_FORM, startReady: false });
    await api.setViewSettings({ ...DEFAULT_VIEW, groupBy: 'company' });
    await api.setFormSettings({ ...DEFAULT_FORM, startReady: true });
  });
  await step('a template with a task waiting on another, then changed', async () => {
    const id = await api.addTemplate({
      name: '  End of   the House ',
      items: [
        { key: 'a', title: 'Touch up paint', description: '', kind: 'completion', tradeId: carpentry, hours: 4, place: 'Whole House', waitsOn: [], sortOrder: 1 },
        { key: 'b', title: 'Clean windows', description: '', kind: 'completion', tradeId: null, hours: null, place: 'outside', waitsOn: ['a'], sortOrder: 2 },
      ],
    });
    const task = await api.addTemplateItem(id, { title: 'Install towel bar', description: '', kind: 'completion', tradeId: carpentry, hours: 0.5, place: 'bathroom', waitsOn: [] });
    await api.updateTemplateItem(task, { hours: 1 });
    await api.updateTemplate(id, { name: 'End of House' });
  });
  await step('standard titles and an added field', async () => {
    const t = await api.addTitle({ title: 'Install towel bar', tradeId: carpentry, hours: 0.5 });
    await api.updateTitle(t, { rooms: ['bathroom'], hours: 0.75 });
    const f = await api.addCustomField({ label: 'Paint Color', kind: 'list', options: ['White', 'Gray'] });
    await api.updateCustomField(f, { options: ['White', 'Gray', 'Black'] });
  });
  await step('template tasks added to the job', async () => {
    await api.addItems([
      { ...blank({ jobId, locationId: bath, title: 'Install towel bar', companyId: sms }), id: randomUUID(), source: 'template' },
      { ...blank({ jobId, locationId: kitchen, title: 'Touch up paint', companyId: sms, ready: false, waitingOn: ['Owner'] }), id: randomUUID(), source: 'template' },
    ]);
  });
  await step('items assigned to Sam, in bulk', async () => {
    await api.updateItems([
      { id: second, patch: { assignedTo: sam.id } },
      { id: third, patch: { assignedTo: sam.id } },
    ]);
  });
  await step('Assigned To: work for someone on the team with no company, and back to a company', async () => {
    const ours = await api.createItem(blank({ jobId, locationId: kitchen, title: 'Order towel bar', companyId: null, assignedTo: sam.id }));
    await api.updateItem(ours, { companyId: sms, assignedTo: null });
    await api.updateItem(ours, { companyId: null, assignedTo: sam.id });
  });
  await step('the company moves to another trade on the job, and is renamed', async () => {
    await api.setJobCompanyTrade(jobId, sparks, electrical, carpentry);
    await api.updateCompany(sparks, { name: 'Sparks Electric LLC' });
  });
  await step("a company's page put in Spanish", async () => {
    await api.updateCompany(sms, { language: 'es' });
  });
  await step("a location renamed, removed and brought back, the walk order, and Done Here", async () => {
    await api.updateLocation(kitchen, { label: '101 Kitchen and Pantry', name: 'Kitchen and Pantry' });
    await api.updateLocation(bath, { active: false });
    await api.updateLocation(bath, { active: true });
    await api.reorderLocations(jobId, [bath, kitchen]);
    await api.setWalked([kitchen, bath], true);
    await api.setWalked([kitchen], false);
  });
  let office = '';
  await step('locations typed in by level, a level renamed and moved, and the plans read in', async () => {
    // Typed in with no number, then the plans give it its number and level.
    office = await api.addLocation(jobId, 'Office');
    await api.addLocations(jobId, [{ name: 'Pantry', number: '102', label: 'Pantry 102', floor: 'First Floor', kind: 'room', sortOrder: 1 }]);
    const pantry = state.locations.find((l) => l.label === 'Pantry 102')!.id;
    await api.moveLocation(pantry, { floor: 'Second Floor', kind: 'room' });
    await api.renameLevel(jobId, 'Second Floor', 'Level 2');
    const live = state.locations.filter((l) => l.jobId === jobId && l.active);
    await api.reorderLocations(jobId, moveLevel(live, 'First Floor', -1)!.map((l) => l.id));
    const reading = {
      name: null,
      address: null,
      levels: [{ name: 'Level 3', rooms: [{ name: 'Office', number: '301' }, { name: 'Bunk Room', number: '302' }], sheet: null }],
      outside: outsideAreas(['Dock']),
      notes: null,
    };
    const result = await api.addPlanLocations(jobId, planLocations(reading, state.locations.filter((l) => l.jobId === jobId)));
    if (result.added !== 8 || result.filledIn !== 1) failures.push(`the plans added ${result.added} and filled in ${result.filledIn}, not 8 and 1`);
    if (result.addedIds.length !== 8 || result.addedIds.some((id) => !state.locations.some((l) => l.id === id && l.active))) failures.push('the plans did not say which locations they added');
  });
  await step('someone new under People, then changed', async () => {
    const id = await api.addPerson({ name: 'Taylor Brooks', email: 'Taylor@RossBuilt.com', phone: null, role: 'team', sees: 'all' });
    await api.updatePerson(id, { phone: '941 555 0142', sees: 'assigned' });
  });
  await step('the job renamed, closed and opened again', async () => {
    await api.updateJob(jobId, { name: 'Fish Residence', address: '715 North Shore Drive, Anna Maria' });
    await api.updateJob(jobId, { closed: true });
    await api.updateJob(jobId, { closed: false });
  });
  await step('a company taken off the job', async () => {
    await api.removeCompanyFromJob(jobId, sparks, carpentry);
  });
  await step("a new job from the Fish setup: its companies, Waiting On choices, team and locations", async () => {
    copied = await api.createJob({ name: 'Fish Guest House', address: '717 North Shore Drive', projectManagerId: jake.id, from: { jobId, companies: true, team: true, locations: true } });
  });

  // ---------- as Sam, on the team ----------

  signIn(sam);
  await step('Sam adds an item and finishes his', async () => {
    const id = await api.createItem(blank({ jobId, locationId: bath, title: 'Adjust closet door', companyId: sms }));
    await api.updateItem(id, { description: 'Rubs at the top.' });
    await api.updateItem(third, { status: 'complete', completedBy: sam.id, completedAt: new Date().toISOString() });
  });
  await step('Sam comments and takes it back', async () => {
    const c = await api.addComment({ jobId, itemId: id0(), companyId: null, body: 'Done Friday.', internal: false });
    await api.setCommentRemoved(c, true);
  });
  let laundry = '';
  let tile = '';
  await step('Sam types a room in on the walk', async () => {
    laundry = await api.addLocation(jobId, 'Laundry 112', 'First Floor');
    // The same name again is the one already there.
    if ((await api.addLocation(jobId, ' laundry  112 ')) !== laundry) failures.push('a room typed in twice was added twice');
  });
  await step('Sam adds a company for an item, and it joins the job', async () => {
    tile = await api.addCompany({ name: '  Gulf Coast   Tile ', defaultTradeId: carpentry });
    await api.addCompanyToJob(jobId, tile, carpentry);
    await api.createItem(blank({ jobId, locationId: laundry, title: 'Grout the laundry floor', companyId: tile }));
  });
  await step('Sam cannot delete the job: the app stops it first', async () => {
    let stopped = false;
    try {
      await api.deleteJob(jobId);
    } catch {
      stopped = true;
    }
    if (!stopped) failures.push('Sam was let through to delete a job');
  });
  await step('Sam sets his own view', async () => {
    await api.setViewSettings({ ...DEFAULT_VIEW, showCompleted: true });
  });
  await step('Sam cannot change the setup: the app stops it first', async () => {
    let stopped = false;
    try {
      await api.addTrade('Plumbing');
    } catch {
      stopped = true;
    }
    if (!stopped) failures.push('Sam was let through to add a trade');
    let renamed = true;
    try {
      await api.renameOrg('Sam Built');
    } catch {
      renamed = false;
    }
    if (renamed) failures.push("Sam was let through to change the company's name");
  });

  function id0(): string {
    return state.items.find((i: Item) => i.title === 'Install cabinet hardware')!.id;
  }

  // ---------- what the database did with it ----------

  const check = (name: string, sql: string, expected: string) => {
    const got = psql(sql);
    steps.push(got === expected ? `database: ${name}` : `database: ${name} (FAILED)`);
    if (got !== expected) failures.push(`database: ${name}: got ${got}, expected ${expected}`);
  };

  check("the company's name, tidied", `select name from public.orgs where id = ${lit(ORG)}`, 'Ross Built Custom Homes');
  check("a photo's words, kept for search", `select string_agg(description, ',') from public.photos where job_id = ${lit(jobId)} and description is not null`, 'water stain on the ceiling');
  check("a company's page in Spanish, the others in English", `select string_agg(language, ',' order by language) from (select distinct language from public.companies where org = ${lit(ORG)}) x`, 'en,es');
  check("the Spanish one is the one changed", `select language from public.companies where id = ${lit(sms)}`, 'es');
  check('every row on the job is the company\'s', `select count(*) from public.items where job_id = ${lit(jobId)} and org <> ${lit(ORG)}`, '0');
  check('every item numbered in the order it arrived', `select string_agg(number::text, ',' order by number) from public.items where job_id = ${lit(jobId)}`, '1,2,3,4,5,6,7,8,9');
  check(
    "work for someone on the team needs no company",
    `select (company_id is null)::text || ',' || (assigned_to = ${lit(sam.id)})::text || ',' || unfinished::text from public.items where job_id = ${lit(jobId)} and title = 'Order towel bar'`,
    'true,true,false',
  );
  check(
    'the trade follows the company',
    `select count(*) from public.items i where i.job_id = ${lit(jobId)} and i.company_id = ${lit(sms)} and i.trade_id is distinct from ${lit(carpentry)}::uuid`,
    '0',
  );
  check('the item waiting on the done task is ready', `select ready::text || ',' || cardinality(waiting_on_items) from public.items where id = ${lit(second)}`, 'true,0');
  check('Sam is on the team as Field', `select part from public.job_team where job_id = ${lit(jobId)} and person_id = ${lit(sam.id)}`, 'field');
  check('Sam completed the item himself', `select completed_by::text = ${lit(sam.id)} from public.items where id = ${lit(third)}`, 't');
  check('the photo knows where its picture is', `select count(*) from public.photos where job_id = ${lit(jobId)} and storage_path is not null`, '1');
  check(
    'the cropped photo in place of the one it was made from, which is kept, removed',
    `select string_agg(id::text || ':' || removed::text || ':' || width || 'x' || height || ':' || sort_order || ':' || jsonb_array_length(marks), ',' order by removed) from public.photos where id in (${lit(uncropped)}, ${lit(cropped)})`,
    `${cropped}:false:4032x3024:1:1,${uncropped}:true:3024x4032:1:1`,
  );
  check(
    'the plan, its picture and the pin',
    `select s.name || ',' || (s.storage_path is not null)::text || ',' || i.pin_x || ',' || i.priority::text || ',' || jsonb_array_length(i.checklist) from public.items i join public.plan_sheets s on s.id = i.plan_id where i.id = ${lit(second)}`,
    'Level 1 Floor Plan,true,0.4,true,1',
  );
  check('Undo after Complete is To Check again', `select (marked_done_at is not null)::text || ',' || status from public.items where id = ${lit(second)}`, 'true,open');
  check(
    "History says it was completed, not that the company's done was taken back",
    `select count(*) from public.item_history where item_id = ${lit(second)} and field = 'marked_done_at' and after is null`,
    '0',
  );
  check('one live link, one taken back', `select string_agg(revoked::text, ',' order by revoked) from public.company_links where job_id = ${lit(jobId)}`, 'false,true');
  check('Waiting On in its new order', `select string_agg(label, ',' order by sort_order) from public.job_waiting_on where job_id = ${lit(jobId)}`, 'Engineer,Owner');
  check(
    'settings kept for each person, as their own',
    `select string_agg((item_form ->> 'startReady') || ':' || (job_view ->> 'groupBy') || ':' || (job_view ->> 'showCompleted'), ',' order by person_id = ${lit(jake.id)} desc) from public.person_settings`,
    'true:company:false,true:room:true',
  );
  check('the template name tidied', `select name from public.templates`, 'End of House');
  // As Fish was when the new job was made: Sam's room and the company he added came after.
  check(
    "the new job took Fish's companies, Waiting On choices and team",
    `select (select string_agg(company_id::text || ':' || trade_id::text, ',' order by company_id, trade_id) from public.job_companies where job_id = ${lit(copied)}) = (select string_agg(company_id::text || ':' || trade_id::text, ',' order by company_id, trade_id) from public.job_companies where job_id = ${lit(jobId)} and company_id <> ${lit(tile)})
       and (select string_agg(label, ',' order by sort_order) from public.job_waiting_on where job_id = ${lit(copied)}) = (select string_agg(label, ',' order by sort_order) from public.job_waiting_on where job_id = ${lit(jobId)})
       and (select string_agg(person_id::text || ':' || part, ',' order by person_id) from public.job_team where job_id = ${lit(copied)}) = (select string_agg(person_id::text || ':' || part, ',' order by person_id) from public.job_team where job_id = ${lit(jobId)})`,
    't',
  );
  check(
    "the new job took Fish's locations in walk order, none walked",
    `select ((select string_agg(label || '|' || coalesce(floor, ''), ',' order by sort_order) from public.locations where job_id = ${lit(copied)}) = (select string_agg(label || '|' || coalesce(floor, ''), ',' order by sort_order) from public.locations where job_id = ${lit(jobId)} and active and id <> ${lit(laundry)}))::text || ',' || (select count(*) from public.locations where job_id = ${lit(copied)} and walked_at is not null)`,
    'true,0',
  );
  check('the room Sam typed in, on its floor', `select label || ',' || coalesce(floor, '') from public.locations where id = ${lit(laundry)}`, 'Laundry 112,First Floor');
  check(
    // Sam's room goes on the end: only an admin moves the others to make room.
    'the walk order: each level together, the plans read in, the outside areas last',
    `select string_agg(label, ',' order by sort_order) from public.locations where job_id = ${lit(jobId)} and active`,
    '101 Kitchen and Pantry,201 Primary Bath,Pantry 102,Office 301,Bunk Room 302,North Elevation,South Elevation,East Elevation,West Elevation,Roof,Site,Whole House,Dock,Laundry 112',
  );
  check('the room typed in with no number, filled in from the plans', `select label || ',' || floor from public.locations where id = ${lit(office)}`, 'Office 301,Level 3');
  check('the company Sam added, tidied and on the job', `select c.name || ',' || count(jc.*) from public.companies c left join public.job_companies jc on jc.company_id = c.id and jc.job_id = ${lit(jobId)} where c.id = ${lit(tile)} group by c.name`, 'Gulf Coast Tile,1');
  check('the standard title counted as used', `select uses from public.title_library where title = 'Install towel bar'`, '1');
  check('the sent schedule kept as it went', `select snapshot -> 'bars' -> 0 ->> 'companyId' = ${lit(sms)} from public.list_sends where list = 'schedule'`, 't');
  check('History has every item and change', `select (count(*) > 15)::text from public.item_history where job_id = ${lit(jobId)}`, 'true');
  check(
    'Activity has the photos, visits, lists, setup and team',
    `select string_agg(distinct kind collate "C", ',' order by kind collate "C") from public.job_activity where job_id = ${lit(jobId)} and kind in ('photo_added','photo_marked','photo_removed','visit_added','visit_changed','visit_removed','list_sent','list_undone','company_added','company_trade_changed','company_renamed','company_removed','location_renamed','location_removed','location_restored','team_added','team_changed','job_renamed','job_closed','job_reopened','comment_added')`,
    'comment_added,company_added,company_removed,company_renamed,company_trade_changed,job_closed,job_renamed,job_reopened,list_sent,list_undone,location_removed,location_renamed,location_restored,photo_added,photo_marked,photo_removed,team_added,team_changed,visit_added,visit_changed,visit_removed',
  );

  console.log(steps.map((s) => `  ${s}`).join('\n'));
  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${sent} writes or checks failed:\n${failures.map((f) => `- ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`\nAll ${sent} writes went through the database's rules, as Jake and as Sam, and the database did its part.`);
}

void main();
