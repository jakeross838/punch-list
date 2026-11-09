// How the phone talks to the server: PowerSync streams changes down; this sends the phone's changes
// up through Supabase, so the database's access rules and triggers apply to every write.

import { UpdateType, type CrudEntry, type PowerSyncBackendConnector } from '@powersync/react-native';
import { config } from '../config';
import { KEY_COLUMNS, toServerRow, uploadRuns } from '../rows';
import { supabase } from './supabase';

type Database = Parameters<PowerSyncBackendConnector['uploadData']>[0];

/** How many of the phone's changes are taken at a time. */
const BATCH = 200;

// Postgres errors that no retry will fix: bad data (22), a broken rule (23) and no permission (42501).
// Those changes are set aside in rejected_changes and shown in the app, not retried forever.
const PERMANENT = [/^22...$/, /^23...$/, /^42501$/];
const ALREADY_THERE = '23505';

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) return null;
    return {
      endpoint: config.powersyncUrl,
      token: session.access_token,
      ...(session.expires_at ? { expiresAt: new Date(session.expires_at * 1000) } : {}),
    };
  }

  async uploadData(database: Database) {
    const batch = await database.getCrudBatch(BATCH);
    if (!batch) return;
    for (const run of uploadRuns(batch.crud)) {
      // New rows of one table go up together. If the database turns any of them down (or one is
      // there already), they go one at a time instead, so each is kept or set aside on its own.
      if (run.length > 1 && (await insertAll(run))) continue;
      for (const op of run) await send(database, op);
    }
    await batch.complete();
  }
}

/** New rows of one table, in one request: true when they all went in. */
async function insertAll(run: CrudEntry[]): Promise<boolean> {
  const table = run[0]!.table;
  const key = KEY_COLUMNS[table] ?? 'id';
  const rows = run.map((op) => ({ ...toServerRow(table, op.opData ?? {}), [key]: op.id }));
  // A column one row leaves out takes its default, as it does when each goes alone.
  const { error } = await supabase.from(table).insert(rows, { defaultToNull: false });
  return !error;
}

/** One change. A change no retry will fix is set aside to show in the app; anything else is tried again later. */
async function send(database: Database, op: CrudEntry): Promise<void> {
  const table = supabase.from(op.table);
  const data = toServerRow(op.table, op.opData ?? {});
  // The row's id on the phone; a company link's is its token.
  const key = KEY_COLUMNS[op.table] ?? 'id';
  // The app only ever inserts new rows, so a PUT is a plain insert. A row that is already there
  // means an earlier attempt landed before the signal dropped.
  const result =
    op.op === UpdateType.PUT
      ? await table.insert({ ...data, [key]: op.id })
      : op.op === UpdateType.PATCH
        ? await table.update(data).eq(key, op.id)
        : await table.delete().eq(key, op.id);
  const error = result.error;
  if (!error) return;
  if (op.op === UpdateType.PUT && error.code === ALREADY_THERE) return;
  if (PERMANENT.some((re) => re.test(error.code ?? ''))) {
    await database.execute(
      'INSERT INTO rejected_changes (id, table_name, row_id, op, data, error, at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
      [op.table, op.id, op.op, JSON.stringify(op.opData ?? {}), `${error.code}: ${error.message}`, new Date().toISOString()],
    );
    return;
  }
  throw error; // a lost signal or a server hiccup: PowerSync tries the batch again
}
