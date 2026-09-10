import { Hono } from 'hono';
import type { ApiError, Catalog, CleanPartialsResult } from '../../shared/types.ts';
import { cleanPartial, deletePackage, startInstall, stopInstall } from '../audiocpp/client.ts';
import { clearLiveStatusCache, getLiveStatus } from '../audiocpp/packageStatus.ts';
import { buildCatalog } from '../catalog/merge.ts';
import { findPackage, loadSpecs, specVersion } from '../catalog/registry.ts';
import { db } from '../db/index.ts';
import { listInstalls, recordInstallStarted, updateInstall } from '../db/installs.ts';
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

catalogRoutes.post('/catalog/packages/:id/install', async (c) => {
  const id = c.req.param('id');
  if (!knownPackage(id)) return c.json<ApiError>({ error: `Miso has no spec for the package ${id}` }, 404);

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
