import { readFile } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import { setAssetPeaks } from '../db/assets.ts';
import { assetPath } from './storage.ts';
import { peaksFromWav } from './wavPeaks.ts';

/**
 * Fills in the waveform of WAV takes saved before the service could read one.
 *
 * Every take generated before this existed has no stored waveform, which used
 * to be invisible: with no peaks, the player downloads the whole file and draws
 * it on the fly, and at 30 seconds nobody noticed. At three minutes that is a
 * 34 MB request on every view, and a request that size is one a browser
 * extension can intercept, at which point the track will not draw or play at
 * all and there is no button that fixes it.
 *
 * It runs once in the useful sense. Each pass only sees rows that are still
 * missing peaks, and takes saved from now on arrive with theirs, so the second
 * start finds nothing and costs one query.
 *
 * Failures are skipped rather than raised. A file that has gone missing, or one
 * whose samples cannot be read, leaves the row exactly as it was: unchanged and
 * still playable.
 */
export async function backfillWavPeaks(handle: Database): Promise<number> {
  const rows = handle
    .prepare(`SELECT id, project_id FROM assets WHERE peaks IS NULL AND format = 'wav'`)
    .all() as { id: string; project_id: string }[];

  let filled = 0;

  for (const row of rows) {
    try {
      const bytes = await readFile(assetPath(row.project_id, row.id, 'wav'));
      const peaks = peaksFromWav(bytes);
      if (!peaks) continue;

      setAssetPeaks(handle, row.id, peaks);
      filled += 1;
    } catch {
      // A missing or unreadable file is not worth stopping a startup for.
    }
  }

  return filled;
}
