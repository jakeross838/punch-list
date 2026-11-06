// The iPhone's backend once the project is set up: the real database, through PowerSync. Every
// change is made on the phone first and goes up when there is a signal, so the app works the same
// on a job site with no signal. Signing in connects the phone; signing out clears it. Someone new
// signs in, starts their company and is its admin; deleting an account clears the phone too.

import { PowerSyncContext, useQuery, useStatus } from '@powersync/react-native';
import { companyNameProblem, isAdmin, tidyComment, tidyCompanyName, tidyEmail, yourNameProblem, type Activity } from '@punch/core';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DataContext, type DataApi, type SyncInfo } from '../api';
import { latestFirst, makeApi, UPDATES_KEPT, type Keeper } from '../engine';
import { keepPhoto } from '../photoFiles';
import { SupabaseConnector } from '../powersync/connector';
import {
  deleteAccountOnServer,
  deleteJobOnServer,
  deletePhotosOnServer,
  myAccount,
  sendSignInCode,
  signOutOfSupabase,
  startCompanyOnServer,
  supabase,
  verifySignInCode,
} from '../powersync/supabase';
import { rowToItemHistory, rowToJobActivity } from '../rows';
import { db } from './db';
import { BUCKET, deletePhotoFiles, photosWaiting, startPhotos, stopPhotos } from './photos';
import { changed, hideJob, loadEverything, reset, save, sessionEmail, setNewAccount, setSessionEmail, store, WATCHED_TABLES } from './store';

type Row = Record<string, unknown>;

const connector = new SupabaseConnector();

/** The email the phone is connected for, if any. */
let connectedFor: string | null = null;

/** Connects the phone for whoever is signed in, or disconnects it when nobody is. */
async function follow(email: string | null): Promise<void> {
  const clean = email ? tidyEmail(email) : null;
  setSessionEmail(clean);
  if (clean === connectedFor) return;
  if (connectedFor && clean) {
    // Someone else on this phone: nothing of the last person's stays.
    await db.disconnectAndClear();
    deletePhotoFiles();
    reset();
    setSessionEmail(clean);
  }
  connectedFor = clean;
  if (clean) {
    // With no signal it keeps trying in the background; the app works from the phone meanwhile.
    db.connect(connector).catch((e: unknown) => console.warn('Connecting the phone', e));
    startPhotos();
  } else {
    stopPhotos();
    await db.disconnect();
  }
}

/** The sentence for someone switched off at their company. */
const switchedOff = (company: string) => `That email is switched off at ${company || 'its company'}. Ask an admin there to switch it back on.`;

/**
 * Signed in, but nobody on the phone yet: someone new who has not started their company (they
 * start it on the sign in screen), or someone switched off since (the phone is cleared).
 */
async function checkAccount(clean: string): Promise<void> {
  const account = await myAccount();
  if (!account || sessionEmail() !== clean || store.get().signedIn) return;
  if (account.state === 'none') setNewAccount(clean);
  else if (account.state === 'off') await clearPhone();
}

/** Waits for the signed-in person's row to come down to the phone. True once it is here. */
async function personArrives(clean: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await db.getOptional('SELECT id FROM people WHERE email = ? AND active = 1', [clean])) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let starting: Promise<void> | null = null;

function start(): Promise<void> {
  starting ??= (async () => {
    await db.init();
    await loadEverything();
    db.onChange({ onChange: (e) => changed(e.changedTables) }, { tables: WATCHED_TABLES, throttleMs: 30 });
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user.email ?? null;
    await follow(email);
    if (email && !store.get().signedIn) void checkAccount(tidyEmail(email));
    supabase.auth.onAuthStateChange((_event, session) => {
      // Not inside the callback: Supabase asks that its own calls wait until it returns.
      setTimeout(() => void follow(session?.user.email ?? null), 0);
    });
  })();
  return starting;
}

async function clearPhone(): Promise<void> {
  stopPhotos();
  await db.disconnectAndClear();
  deletePhotoFiles();
  await signOutOfSupabase();
  connectedFor = null;
  reset();
  setSessionEmail(null);
}

/** What each table holds, the way a person says it, for a change the server turned down. */
const THINGS: Record<string, string> = {
  items: 'An item',
  photos: 'A photo',
  visits: 'A visit',
  comments: 'A comment',
  list_sends: 'A list sent',
  locations: 'A location',
  jobs: 'A job',
  orgs: 'The company name',
  people: 'A person',
  job_team: 'Someone on a team',
  companies: 'A company',
  company_contacts: "A company's person",
  job_companies: 'A company on a job',
  company_links: "A company's link",
  job_waiting_on: 'A Waiting On choice',
  trades: 'A trade',
  title_library: 'A standard title',
  custom_fields: 'An added field',
  templates: 'A template',
  template_items: 'A task in a template',
  person_settings: 'Your settings',
};
const DONE: Record<string, string> = { PUT: 'added', PATCH: 'changed', DELETE: 'taken off' };

/** The live company link for a company on a job: the company's page works through it. */
function linkFor(jobId: string, companyId: string): string {
  const link = store.get().links.find((l) => l.jobId === jobId && l.companyId === companyId && !l.revoked);
  if (!link) throw new Error("Copy the company's link on its plan first: its page works through the link.");
  return link.token;
}

function visitLink(visitId: string): string {
  const visit = store.get().visits.find((v) => v.id === visitId && !v.removed);
  if (!visit) throw new Error('That visit is not on this list');
  return linkFor(visit.jobId, visit.companyId);
}

const keeper: Keeper = { mode: 'live', server: true, get: store.get, subscribe: store.subscribe, save: (next) => save(next), keepPhoto };

const liveApi: DataApi = makeApi(keeper, {
  async sendSignInCode(email) {
    await sendSignInCode(email);
  },
  async verifySignInCode(email, code) {
    await verifySignInCode(email, code);
    const clean = tidyEmail(email);
    const account = await myAccount();
    if (account?.state === 'off') {
      await clearPhone();
      throw new Error(switchedOff(account.company));
    }
    await follow(clean);
    // Someone new: they start their company next, on the sign in screen.
    if (account?.state === 'none') {
      setNewAccount(clean);
      return 'new';
    }
    // The first time, everything comes down before the app opens; past a while it carries on with
    // Getting Your Jobs on this screen.
    const enough = new AbortController();
    const timer = setTimeout(() => enough.abort(), 20_000);
    try {
      await db.waitForFirstSync(enough.signal);
    } finally {
      clearTimeout(timer);
    }
    const me = await db.getOptional('SELECT id FROM people WHERE email = ? AND active = 1', [clean]);
    if (db.currentStatus.hasSynced && !me) {
      // Synced and not with a company: the server could not be asked before, so start one now.
      setNewAccount(clean);
      return 'new';
    }
    return 'signed_in';
  },
  async startCompany({ company, name }) {
    const clean = store.get().newAccount ?? sessionEmail();
    if (!clean) throw new Error('Sign in first.');
    const problem = companyNameProblem(company) ?? yourNameProblem(name);
    if (problem) throw new Error(`${problem}.`);
    await startCompanyOnServer(tidyCompanyName(company), tidyCompanyName(name));
    // A fresh connection brings the new company down.
    await db.disconnect();
    db.connect(connector).catch((e: unknown) => console.warn('Connecting the phone', e));
    if (!(await personArrives(clean, 30_000))) {
      throw new Error('Your company is set up. It has not come down to this phone yet: check the signal, then tap Start again.');
    }
    setNewAccount(null);
  },
  async deleteAccount() {
    const changes = (await db.getUploadQueueStats()).count + (await photosWaiting());
    if (changes > 0) {
      throw new Error(
        `${changes === 1 ? 'A change' : `${changes} changes`} made on this phone ${changes === 1 ? 'has' : 'have'} not gone up yet. Get a signal and wait a moment, then delete your account.`,
      );
    }
    // The last one at the company takes it with them: its photos first, from storage.
    const s = store.get();
    if (!s.people.some((p) => p.active && p.id !== s.me.id)) {
      const rows = await db.getAll<Row>(
        "SELECT storage_path FROM photos WHERE coalesce(storage_path, '') <> '' UNION SELECT storage_path FROM plan_sheets WHERE coalesce(storage_path, '') <> ''",
      );
      await deletePhotosOnServer(BUCKET, rows.map((r) => String(r.storage_path)));
    }
    await deleteAccountOnServer();
    await clearPhone();
  },
  async deleteJob(id) {
    if (!isAdmin(store.get().me)) throw new Error('Only an admin can delete a job.');
    const changes = (await db.getUploadQueueStats()).count + (await photosWaiting());
    if (changes > 0) {
      throw new Error(
        `${changes === 1 ? 'A change' : `${changes} changes`} made on this phone ${changes === 1 ? 'has' : 'have'} not gone up yet. Get a signal and wait a moment, then delete the job.`,
      );
    }
    const rows = await db.getAll<Row>(
      "SELECT storage_path FROM photos WHERE job_id = ? AND coalesce(storage_path, '') <> '' UNION SELECT storage_path FROM plan_sheets WHERE job_id = ? AND coalesce(storage_path, '') <> ''",
      [id, id],
    );
    await deletePhotosOnServer(BUCKET, rows.map((r) => String(r.storage_path)));
    await deleteJobOnServer(id);
    hideJob(id);
  },
  async signOut() {
    const changes = (await db.getUploadQueueStats()).count + (await photosWaiting());
    if (changes > 0) {
      throw new Error(
        `${changes === 1 ? 'A change' : `${changes} changes`} made on this phone ${changes === 1 ? 'has' : 'have'} not gone up yet. Get a signal and wait a moment, then sign out.`,
      );
    }
    await clearPhone();
  },
  useActivity(jobId) {
    const { data: history } = useQuery<Row>('SELECT * FROM item_history WHERE job_id = ?', [jobId]);
    const { data: logged } = useQuery<Row>('SELECT * FROM job_activity WHERE job_id = ?', [jobId]);
    return useMemo((): Activity[] => [...history.map(rowToItemHistory), ...logged.map(rowToJobActivity)], [history, logged]);
  },
  useUpdates() {
    const { data: history } = useQuery<Row>(`SELECT * FROM item_history ORDER BY at DESC LIMIT ${UPDATES_KEPT}`);
    const { data: logged } = useQuery<Row>(`SELECT * FROM job_activity ORDER BY at DESC LIMIT ${UPDATES_KEPT}`);
    return useMemo(
      (): Activity[] => latestFirst([...history.map(rowToItemHistory), ...logged.map(rowToJobActivity)]).slice(0, UPDATES_KEPT),
      [history, logged],
    );
  },
  useSync() {
    const status = useStatus();
    const s = useSyncExternalStore(store.subscribe, store.get, store.get);
    const { data: queue } = useQuery<Row>('SELECT count(*) AS n FROM ps_crud');
    const { data: photos } = useQuery<Row>('SELECT count(*) AS n FROM photo_files WHERE uploaded = 0');
    const { data: refused } = useQuery<Row>('SELECT id, table_name, op, error, at FROM rejected_changes ORDER BY at DESC LIMIT 20');
    return useMemo(
      (): SyncInfo => ({
        gettingJobs: sessionEmail() !== null && !s.signedIn && !status.hasSynced,
        waiting: Number(queue[0]?.n ?? 0) + Number(photos[0]?.n ?? 0),
        refused: refused.map((r) => ({
          id: String(r.id),
          at: String(r.at ?? ''),
          what: `${THINGS[String(r.table_name)] ?? 'A change'} ${DONE[String(r.op)] ?? 'made'} here was turned down: ${String(r.error ?? '').replace(/^\w+: /, '')}`,
        })),
        online: status.connected,
      }),
      [s.signedIn, status.hasSynced, status.connected, queue, photos, refused],
    );
  },
  async clearRefused() {
    await db.execute('DELETE FROM rejected_changes');
  },
  // The company's page, from the app: through the database's functions for the page, with the link.
  // The page is out of the app for now, and the database keeps these functions closed.
  async addCompanyComment({ jobId, companyId, itemId, body, name }) {
    const text = tidyComment(body);
    if (text === '') return '';
    const { data, error } = await supabase.rpc('trade_comment', { p_token: linkFor(jobId, companyId), p_item: itemId, p_body: text, p_name: name });
    if (error) throw new Error(error.message);
    return String(data ?? '');
  },
  async companyConfirmVisit({ visitId, name }) {
    const { error } = await supabase.rpc('trade_confirm_visit', { p_token: visitLink(visitId), p_visit: visitId, p_name: name });
    if (error) throw new Error(error.message);
  },
  async companyMarkDone({ jobId, companyId, itemId, done, name }) {
    const { error } = await supabase.rpc('trade_mark_done', { p_token: linkFor(jobId, companyId), p_item: itemId, p_done: done, p_name: name });
    if (error) throw new Error(error.message);
  },
  async companyAskVisit({ visitId, start: first, days, name }) {
    const { error } = await supabase.rpc('trade_ask_visit', { p_token: visitLink(visitId), p_visit: visitId, p_start: first, p_days: days, p_name: name });
    if (error) throw new Error(error.message);
  },
});

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    start().then(
      () => setReady(true),
      (e: unknown) => setProblem(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  if (problem) {
    return (
      <View style={styles.problem}>
        <Text style={styles.problemText}>{`The phone's copy of the jobs did not open: ${problem}`}</Text>
      </View>
    );
  }
  if (!ready) return null;
  return (
    <PowerSyncContext.Provider value={db}>
      <DataContext.Provider value={liveApi}>{children}</DataContext.Provider>
    </PowerSyncContext.Provider>
  );
}

const styles = StyleSheet.create({
  problem: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  problemText: { fontSize: 17, textAlign: 'center' },
});
