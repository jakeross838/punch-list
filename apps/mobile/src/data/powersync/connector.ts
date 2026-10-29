// How the phone talks to the server: PowerSync streams changes down; this sends the phone's changes
// up through Supabase, so the database's access rules and triggers apply to every write.

import { UpdateType, type PowerSyncBackendConnector } from '@powersync/react-native';
import { config } from '../config';
import { toServerRow } from '../rows';
import { supabase } from './supabase';

type Database = Parameters<PowerSyncBackendConnector['uploadData']>[0];

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
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;
    for (const op of tx.crud) {
      const table = supabase.from(op.table);
      const data = toServerRow(op.table, op.opData ?? {});
      // The app only ever inserts new rows, so a PUT is a plain insert. A row that is already there
      // means an earlier attempt landed before the signal dropped.
      const result =
        op.op === UpdateType.PUT
          ? await table.insert({ ...data, id: op.id })
          : op.op === UpdateType.PATCH
            ? await table.update(data).eq('id', op.id)
            : await table.delete().eq('id', op.id);
      const error = result.error;
      if (!error) continue;
      if (op.op === UpdateType.PUT && error.code === ALREADY_THERE) continue;
      if (PERMANENT.some((re) => re.test(error.code ?? ''))) {
        await database.execute(
          'INSERT INTO rejected_changes (id, table_name, row_id, op, data, error, at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
          [op.table, op.id, op.op, JSON.stringify(op.opData ?? {}), `${error.code}: ${error.message}`, new Date().toISOString()],
        );
        continue;
      }
      throw error; // a lost signal or a server hiccup: PowerSync retries the whole transaction
    }
    await tx.complete();
  }
}
