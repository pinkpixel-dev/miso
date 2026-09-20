import { Hono } from 'hono';
import type { ApiError, Catalog, CleanPartialsResult } from '../../shared/types.ts';
import { cleanPartial, deletePackage, startInstall, stopInstall } from '../audiocpp/client.ts';
import { clearLiveStatusCache, getLiveStatus } from '../audiocpp/packageStatus.ts';
import { buildCatalog } from '../catalog/merge.ts';
import { findPackage, loadSpecs, specVersion } from '../catalog/registry.ts';
import { db } from '../db/index.ts';
import { activeInstalls, listInstalls, recordInstallStarted, updateInstall } from '../db/installs.ts';
import { ensurePollerRunning } from '../installs/poller.ts';
import { readSettings } from '../db/settings.ts';

/**
 * The catalog surface.
 *
 * Every action answers with the whole catalog rather than a status, so the
 * client renders one authoritative state instead of stitching a response into
 * whatever it already had.
 */
export const catalogRoutes = new Hono();

async function currentCatalog(): Promise<Catalog> {
  const backendUrl = readSettings().backendUrl;
  const live = await getLiveStatus(backendUrl);

  return buildCatalog({
    specs: loadSpecs(),
    live,
    installs: listInstalls(db(), backendUrl),
    specVersion: specVersion(),
    backendUrl,
  });
}

catalogRoutes.get('/catalog', async (c) => c.json(await currentCatalog()));

/** Shared by every action: the package must be one Miso vendored a spec for. */
function knownPackage(id: string): boolean {
  return findPackage(id) !== undefined;
}

/**
 * An install already running into the folder this one wants.
 *
 * Two packages of one family usually land in their own folders, and two
 * installs at once are fine. YuE2 is the exception: its five packages all write
 * the same four sidecar files into `Yue2-3B-GGUF/`, and two installs racing
 * each other there fail with `package file already exists`, measured on
 * 2026-09-20. One at a time works every time.
 *
 * Checked by folder rather than by family, because the folder is what the
 * conflict is actually about. A family that someday splits across two folders
 * can still install both at once.
 */
function installBlockedBy(id: string): string | undefined {
  const wanted = findPackage(id)?.pkg.directory;
  if (wanted === undefined) return undefined;

  for (const row of activeInstalls(db())) {
    if (row.packageId === id) continue;
    const found = findPackage(row.packageId);
    if (found?.pkg.directory === wanted) return found.pkg.label;
  }

  return undefined;
}

catalogRoutes.post('/catalog/packages/:id/install', async (c) => {
  const id = c.req.param('id');
  if (!knownPackage(id)) return c.json<ApiError>({ error: `Miso has no spec for the package ${id}` }, 404);

  const blocking = installBlockedBy(id);
  if (blocking !== undefined) {
    return c.json<ApiError>(
      {
        error: `${blocking} is installing into the same folder`,
        detail: 'These two share files, so they have to install one at a time. Try again when it finishes.',
      },
      409,
    );
  }

  const backendUrl = readSettings().backendUrl;
  const result = await startInstall(backendUrl, id);
  if (!result.ok) return c.json<ApiError>({ error: result.message }, 409);

  recordInstallStarted(db(), id, backendUrl);
  ensurePollerRunning(db());
  clearLiveStatusCache();

  return c.json(await currentCatalog());
});

catalogRoutes.post('/catalog/packages/:id/install/stop', async (c) => {
  const id = c.req.param('id');
  if (!knownPackage(id)) return c.json<ApiError>({ error: `Miso has no spec for the package ${id}` }, 404);

  const backendUrl = readSettings().backendUrl;
  const result = await stopInstall(backendUrl, id);
  if (!result.ok) return c.json<ApiError>({ error: result.message }, 409);

  updateInstall(db(), id, backendUrl, { state: 'cancelled' });
  clearLiveStatusCache();

  return c.json(await currentCatalog());
});

/**
 * Sweeps abandoned downloads across every package at once.
 *
 * Nothing in the audio.cpp API reports which packages have a staging directory,
 * so there is no way to offer this per model without guessing. Sweeping them
 * all is the only version that reaches a partial whose install row Miso never
 * had, which is exactly the case a crashed container leaves behind.
 */
catalogRoutes.post('/catalog/partials/clean', async (c) => {
  const backendUrl = readSettings().backendUrl;
  const ids = loadSpecs().flatMap((spec) => spec.packages.map((pkg) => pkg.id));

  const results = await Promise.all(ids.map((id) => cleanPartial(backendUrl, id)));

  const failure = results.find((result) => !result.ok);
  if (failure && !failure.ok) return c.json<ApiError>({ error: failure.message }, 409);

  // A package whose count could not be read still swept. Counting only the
  // ones that answered with a number keeps the total honest and low rather
  // than inventing zeros.
  const removed = results.reduce<number | undefined>((total, result) => {
    if (!result.ok || result.value === undefined) return total;
    return (total ?? 0) + result.value;
  }, undefined);

  clearLiveStatusCache();
  return c.json<CleanPartialsResult>({ removed, catalog: await currentCatalog() });
});

catalogRoutes.delete('/catalog/packages/:id', async (c) => {
  const id = c.req.param('id');
  if (!knownPackage(id)) return c.json<ApiError>({ error: `Miso has no spec for the package ${id}` }, 404);

  const result = await deletePackage(readSettings().backendUrl, id);
  if (!result.ok) return c.json<ApiError>({ error: result.message }, 409);

  clearLiveStatusCache();
  return c.json(await currentCatalog());
});
