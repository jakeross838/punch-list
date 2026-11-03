// The phone's copy of the database, kept by PowerSync. iPhone only.

import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from '../powersync/schema';

export const db = new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: 'punch-list.sqlite' } });
