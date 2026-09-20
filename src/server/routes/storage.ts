import { Hono } from 'hono';
import type { ModelStorage, StorageUsage } from '../../shared/types.ts';
import { getLiveStatus } from '../audiocpp/packageStatus.ts';
import { db } from '../db/index.ts';
import { listProjects } from '../db/projects.ts';
import { readSettings } from '../db/settings.ts';

/**
 * What Miso is holding, per project and in total.
 *
 * This reuses the rollups listProjects already computes rather than walking the
 * projects directory. The byte count on a row was taken from the upload stream
 * that wrote the file, so the two agree, and a sum over a small table beats a
 * recursive stat over gigabytes.
 *
 * Model weights are counted too, from the backend rather than from disk, and
 * they are usually the bigger number by an order of magnitude. A panel that
 * reports a gigabyte of takes and says nothing about forty gigabytes of weights
 * answers the wrong question, because the question is always where the space
 * went.
 */
export const storageRoutes = new Hono();

/**
 * Installed packages only. An uninstalled one takes up nothing.
 *
 * Exported for its own test, because the two rules in here are both easy to get
 * wrong and neither needs a backend to check.
 */
export function summarizeModels(
  packages: { bytes: number | undefined; installed: boolean }[],
): ModelStorage {
  const installed = packages.filter((pkg) => pkg.installed);
  return {
    kind: 'ready',
    // A package the backend could not size counts as a package but adds no
    // bytes, which is better than dropping it from the count entirely.
    bytes: installed.reduce((total, pkg) => total + (pkg.bytes ?? 0), 0),
    count: installed.length,
  };
}

async function modelStorage(): Promise<ModelStorage> {
  const status = await getLiveStatus(readSettings().backendUrl);
  if (status.kind !== 'ready') {
    return status.kind === 'scanning' ? { kind: 'scanning' } : { kind: 'unavailable' };
  }
  return summarizeModels(status.packages);
}

storageRoutes.get('/storage', async (c) => {
  const projects = listProjects(db());
  const totalBytes = projects.reduce((total, project) => total + project.bytes, 0);

  return c.json<StorageUsage>({ totalBytes, projects, models: await modelStorage() });
});
