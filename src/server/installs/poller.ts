import type { Database } from 'better-sqlite3';
import { fetchInstallStatus } from '../audiocpp/client.ts';
import { activeInstalls, updateInstall } from '../db/installs.ts';
import { nextInstallProgress } from './state.ts';

/**
 * One timer for the whole service.
 *
 * A three gigabyte download outlives any browser tab, so the service watches it
 * rather than the client. Ten open tabs still produce one poll loop, and the
 * timer stops the moment nothing is installing.
 */

const INTERVAL_MS = 3000;

let timer: NodeJS.Timeout | undefined;

/** Polls every running install once. Returns how many rows changed. */
export async function pollActiveInstalls(handle: Database): Promise<number> {
  const rows = activeInstalls(handle);
  if (rows.length === 0) return 0;

  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        const report = await fetchInstallStatus(row.backendUrl, row.packageId);
        return { row, patch: nextInstallProgress(report) };
      } catch (error) {
        // One unhealthy backend must not stop the others from being polled.
        console.error(`[installs] status failed for ${row.packageId}`, error);
        return { row, patch: {} };
      }
    }),
  );

  let changed = 0;
  for (const { row, patch } of results) {
    if (Object.keys(patch).length === 0) continue;
    updateInstall(handle, row.packageId, row.backendUrl, patch);
    changed += 1;
  }

  return changed;
}

/** Starts the timer if it is not already running. Safe to call on every install. */
export function ensurePollerRunning(handle: Database): void {
  if (timer) return;

  timer = setInterval(() => {
    void pollActiveInstalls(handle)
      .then(() => {
        if (activeInstalls(handle).length === 0) stopPoller();
      })
      .catch((error: unknown) => console.error('[installs] poll failed', error));
  }, INTERVAL_MS);

  timer.unref();
}

export function stopPoller(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
