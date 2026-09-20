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
  if (!catalog) return [];

  // Gathered across every family the task names, because separation runs on
  // three of them. `packageIds` is the service's own answer about what it would
  // accept, so it decides membership and the family only decides where to look.
  return catalog.families
    .filter((entry) => task.families.includes(entry.family))
    .flatMap((entry) => entry.packages)
    .filter((pkg) => pkg.installed && task.packageIds.includes(pkg.id))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/**
 * The family a first download should be, named rather than derived.
 *
 * Four families can make music and any of them would work. ACE-Step is the one
 * Miso is built around: it carries the lyrics path and every remix route, so it
 * is the package that makes the most of the application actually usable. If the
 * catalog ever stops carrying it, the rule below falls back to any music family
 * with a recommendation rather than suggesting nothing.
 */
const FIRST_FAMILY = 'ace_step';

/**
 * What to download first, or nothing when that question does not apply.
 *
 * Returns a package only when Miso genuinely cannot make music yet. Three cases
 * give nothing back, and they are different from each other:
 *
 * A catalog that has not finished scanning is not an empty catalog, and neither
 * is one from a backend that cannot be reached. Both would otherwise tell
 * somebody with a full model directory to download a model they already have.
 *
 * A single installed music package is enough. The answer to "what do I do now"
 * stops being "download something" the moment anything can generate.
 */
export function firstRunSuggestion(
  catalog: Catalog | undefined,
): { pkg: CatalogPackage; familyLabel: string } | undefined {
  if (!catalog || catalog.live !== 'ready') return undefined;

  const musical = catalog.families.filter((family) => family.tasks.includes('music'));
  if (musical.some((family) => family.packages.some((pkg) => pkg.installed))) return undefined;

  const preferred = musical.find((family) => family.id === FIRST_FAMILY);
  for (const family of preferred ? [preferred, ...musical] : musical) {
    const pkg = family.packages.find((entry) => entry.recommended);
    if (pkg) return { pkg, familyLabel: family.displayName };
  }

  return undefined;
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
