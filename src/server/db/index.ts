import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { databasePath, dataDir } from '../config.ts';
import { migrate } from './migrate.ts';

let instance: Database.Database | undefined;

/**
 * Opens the database, creating and migrating it on first use.
 *
 * WAL is on because the service will later read assets while a job writes
 * results. Foreign keys are on because SQLite leaves them off by default and
 * the lineage graph in phase 3 depends on them.
 */
export function db(): Database.Database {
  if (instance) return instance;

  mkdirSync(dataDir, { recursive: true });
  const handle = new Database(databasePath);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');

  const applied = migrate(handle);
  if (applied.length > 0) {
    console.log(`[db] applied ${applied.length} migration(s): ${applied.join(', ')}`);
  }

  instance = handle;
  return instance;
}
