import type { Catalog, CatalogPackage, StudioTask } from '../../shared/types.ts';

/**
 * The installed packages a task can actually run on, best first.
 *
 * Two screens ask this question now: the create column, which asks it of every
 * generation task at once, and the remix page, which asks it of one task. They
 * have to answer it the same way, because a package the studio offers and the
 * service refuses is a job that fails after it was queued.
 *
 * A task is only offered the packages it declares. Stable Audio ships SFX
 * packages beside its music ones, and those belong to a task the studio reaches
 * elsewhere, so `packageIds` leaves them out and the service would refuse them
 * anyway.
 *
 * The recommended package leads, because it is the one the model authors
 * suggest and the one most people should take.
 */
export function installedPackages(catalog: Catalog | undefined, task: StudioTask): CatalogPackage[] {
  const family = catalog?.families.find((entry) => entry.family === task.family);
  if (!family) return [];

  return family.packages
    .filter((pkg) => pkg.installed && task.packageIds.includes(pkg.id))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/**
 * A package label with the model name taken off the front.
 *
 * Every option sits under a heading naming its model, so the full catalog name
 * repeats that heading and pushes the part that actually differs off the end of
 * the box. Falls back to the whole label when it does not start with the model
 * name, which is better than showing a fragment of one.
 */
export function buildLabel(pkg: CatalogPackage, modelLabel: string): string {
  if (!pkg.label.startsWith(modelLabel)) return pkg.label;
  const rest = pkg.label.slice(modelLabel.length).trim();
  return rest === '' ? pkg.label : rest;
}
