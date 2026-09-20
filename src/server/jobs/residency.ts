import {
  fetchModelsRoot,
  fetchPackageSizes,
  fetchRegisteredModels,
  loadModel,
  unloadModel,
  type ManagementResult,
} from '../audiocpp/client.ts';
import { findPackage } from '../catalog/registry.ts';
import type { ServerTaskKind, TaskDefinition } from '../tasks/registry.ts';

/**
 * Which model is in GPU memory, and what it costs to change that.
 *
 * Loading ACE-Step takes about nine seconds and roughly 13 GB of VRAM, so the
 * expensive mistake here is reloading weights between two jobs that could have
 * shared them. The queue groups jobs by model for that reason, and this module
 * only unloads when the next job genuinely needs a different one.
 *
 * audio.cpp has no unload-everything route, confirmed against a live server:
 * /v1/models/unload-all is not an endpoint. Unloading everything means listing
 * what is registered and unloading each loaded one, which is what unloadAll
 * does below.
 *
 * What is resident is read from the backend before every load, never remembered
 * in this process. A remembered answer is wrong after a restart, wrong when the
 * package changes, and wrong when anything else loaded a model, and each of
 * those ends the same way: two copies of a 13 GB model on a 16 GB card and an
 * allocation failure partway into a generation.
 */

/**
 * Miso names its registrations after the package, so a second job on the same
 * package reuses the first one's registration instead of creating a rival entry
 * pointing at the same weights.
 */
export function registrationId(packageId: string): string {
  return `miso:${packageId}`;
}

export type ResidencyResult =
  | { ok: true }
  | { ok: false; reason: 'not_installed' | 'management_disabled' | 'unreachable' | 'error'; message: string };

function failed(result: Extract<ManagementResult<unknown>, { ok: false }>): ResidencyResult {
  return { ok: false, reason: result.reason, message: result.message };
}

/**
 * Makes sure a package is registered and its weights are in memory.
 *
 * The absolute path matters. A package installs into a variant subdirectory,
 * and pointing the loader at the family directory instead falls back to a
 * safetensors source and fails on a missing file. The path is built from the
 * server's own models root so a container, a NAS, and a workstation all work
 * without Miso being told where anything is.
 */
export async function ensureLoaded(
  baseUrl: string,
  task: TaskDefinition,
  packageId: string,
  /**
   * The runtime kind to register under, already resolved from the staged
   * inputs. Passed in rather than read off the task, because one task can
   * reach routes that live under different kinds.
   */
  serverTask: ServerTaskKind,
): Promise<ResidencyResult> {
  const found = findPackage(packageId);
  if (!found) {
    return { ok: false, reason: 'not_installed', message: `Miso has no package called ${packageId}.` };
  }

  const id = registrationId(packageId);

  const registered = await fetchRegisteredModels(baseUrl);
  if (!registered.ok) return failed(registered);

  const existing = registered.value.find((model) => model.id === id);
  // Loaded is not enough. A registration id is per package, and the kind it was
  // registered under is what decides which routes the backend will accept. Both
  // of Vevo2's singing routes run on one package: returning early on a
  // registration held under `svc` would send `text_to_singing` to it and get
  // `Vevo2 route text_to_singing is not valid for task svc`, after staging, at
  // the point where the job looks like it is working. Loading again over the
  // same id reconfigures it rather than failing.
  if (existing?.loaded && existing.task === serverTask) return { ok: true };

  // Everything else goes first. One model at a time is the only arrangement
  // that fits on a single consumer card, and the backend keeps a model resident
  // until it is told otherwise, so whatever is loaded now would still be there
  // underneath this one.
  for (const model of registered.value) {
    if (!model.loaded || model.id === id) continue;
    const freed = await unloadModel(baseUrl, model.id);
    if (!freed.ok) return failed(freed);
  }

  // Asked before loading, because the loader's own answer to a missing package
  // is a sentence about safetensors sources and a missing model file, which
  // tells a person nothing about what to do next.
  const sizes = await fetchPackageSizes(baseUrl);
  if (!sizes.ok) return failed(sizes);
  if (!sizes.value.scanning && !sizes.value.packages.find((p) => p.id === packageId)?.installed) {
    return {
      ok: false,
      reason: 'not_installed',
      message: `${found.pkg.label} is not installed on this backend yet.`,
    };
  }

  const root = await fetchModelsRoot(baseUrl);
  if (!root.ok) return failed(root);

  const path = `${root.value.replace(/\/+$/, '')}/${found.pkg.directory}`;

  const loaded = await loadModel(baseUrl, {
    id,
    family: found.spec.family,
    path,
    task: serverTask,
    sessionOptions: task.sessionOptions?.(found.pkg),
  });

  return loaded.ok ? { ok: true } : failed(loaded);
}

/** Frees one package's weights. Its registration stays, so it reloads quickly. */
export async function unload(baseUrl: string, packageId: string): Promise<ResidencyResult> {
  const result = await unloadModel(baseUrl, registrationId(packageId));
  return result.ok ? { ok: true } : failed(result);
}

/**
 * Frees every loaded model, one call each.
 *
 * Registrations Miso did not make are unloaded too. A shared backend is not a
 * case Miso supports: it manages residency for the machine, and leaving someone
 * else's weights resident would defeat the reason this is being called.
 */
export async function unloadAll(baseUrl: string): Promise<ResidencyResult> {
  const registered = await fetchRegisteredModels(baseUrl);
  if (!registered.ok) return failed(registered);

  for (const model of registered.value) {
    if (!model.loaded) continue;
    const result = await unloadModel(baseUrl, model.id);
    if (!result.ok) return failed(result);
  }

  return { ok: true };
}
