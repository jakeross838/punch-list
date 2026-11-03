// The iPhone's backend once the project is set up: the real database, through PowerSync. Every
// change is made on the phone first and goes up when there is a signal, so the app works the same
// on a job site with no signal. Signing in connects the phone; signing out clears it.

import { PowerSyncContext, useQuery, useStatus } from '@powersync/react-native';
import { tidyComment, tidyEmail, type Activity } from '@punch/core';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DataContext, type DataApi, type SyncInfo } from '../api';
import { makeApi, type Keeper } from '../engine';
import { keepPhoto } from '../photoFiles';
import { SupabaseConnector } from '../powersync/connector';
import { NOT_SET_UP, sendSignInCode, signOutOfSupabase, supabase, verifySignInCode } from '../powersync/supabase';
import { rowToItemHistory, rowToJobActivity } from '../rows';
import { db } from './db';
import { deletePhotoFiles, photosWaiting, startPhotos, stopPhotos } from './photos';
import { changed, loadEverything, reset, save, sessionEmail, setSessionEmail, store, WATCHED_TABLES } from './store';

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

let starting: Promise<void> | null = null;

function start(): Promise<void> {
  starting ??= (async () => {
    await db.init();
    await loadEverything();
    db.onChange({ onChange: (e) => changed(e.changedTables) }, { tables: WATCHED_TABLES, throttleMs: 30 });
    const { data } = await supabase.auth.getSession();
    await follow(data.session?.user.email ?? null);
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
    await follow(clean);
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
      // Synced, and not one of Ross Built's people (or switched off since the account was made).
      await clearPhone();
      throw new Error(NOT_SET_UP);
    }
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
