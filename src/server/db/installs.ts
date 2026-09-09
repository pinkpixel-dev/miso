import type { Database } from 'better-sqlite3';
import type { InstallProgress } from '../../shared/types.ts';

/**
 * Install rows, keyed by package plus backend URL.
 *
 * Every function takes the handle rather than reaching for the singleton, so
 * tests run against an in-memory database and the poller can be pointed at one
 * too.
 */

export interface InstallRow extends InstallProgress {
  packageId: string;
  backendUrl: string;
}

interface Record_ {
  package_id: string;
  backend_url: string;
  state: string;
  phase: string | null;
  downloaded_bytes: number | null;
  total_bytes: number | null;
  error: string | null;
  started_at: string;
  updated_at: string;
}

function toRow(record: Record_): InstallRow {
  return {
    packageId: record.package_id,
    backendUrl: record.backend_url,
    state: record.state as InstallRow['state'],
    phase: record.phase ?? undefined,
    downloadedBytes: record.downloaded_bytes ?? undefined,
    totalBytes: record.total_bytes ?? undefined,
    error: record.error ?? undefined,
    startedAt: record.started_at,
    updatedAt: record.updated_at,
  };
}

function readOne(handle: Database, packageId: string, backendUrl: string): InstallRow {
  const record = handle
    .prepare('SELECT * FROM installs WHERE package_id = ? AND backend_url = ?')
    .get(packageId, backendUrl) as Record_ | undefined;

  if (!record) throw new Error(`No install row for ${packageId} on ${backendUrl}`);
  return toRow(record);
}

/**
 * Starts or restarts an install. Resume is the same call: the previous error and
 * byte counts are cleared so a stale failure never shows next to a live attempt.
 */
export function recordInstallStarted(handle: Database, packageId: string, backendUrl: string): InstallRow {
  handle
    .prepare(
      `INSERT INTO installs (package_id, backend_url, state)
       VALUES (?, ?, 'running')
       ON CONFLICT(package_id, backend_url) DO UPDATE SET
         state = 'running',
         phase = NULL,
         downloaded_bytes = NULL,
         total_bytes = NULL,
         error = NULL,
         started_at = datetime('now'),
         updated_at = datetime('now')`,
    )
    .run(packageId, backendUrl);

  return readOne(handle, packageId, backendUrl);
}

export function updateInstall(
  handle: Database,
  packageId: string,
  backendUrl: string,
  patch: Partial<InstallProgress>,
): void {
  handle
    .prepare(
      `UPDATE installs SET
         state            = COALESCE(?, state),
         phase            = COALESCE(?, phase),
         downloaded_bytes = COALESCE(?, downloaded_bytes),
         total_bytes      = COALESCE(?, total_bytes),
         error            = COALESCE(?, error),
         updated_at       = datetime('now')
       WHERE package_id = ? AND backend_url = ?`,
    )
    .run(
      patch.state ?? null,
      patch.phase ?? null,
      patch.downloadedBytes ?? null,
      patch.totalBytes ?? null,
      patch.error ?? null,
      packageId,
      backendUrl,
    );
}

export function listInstalls(handle: Database, backendUrl: string): InstallRow[] {
  const records = handle
    .prepare('SELECT * FROM installs WHERE backend_url = ? ORDER BY started_at DESC')
    .all(backendUrl) as Record_[];
  return records.map(toRow);
}

export function activeInstalls(handle: Database): InstallRow[] {
  const records = handle.prepare("SELECT * FROM installs WHERE state = 'running'").all() as Record_[];
  return records.map(toRow);
}
