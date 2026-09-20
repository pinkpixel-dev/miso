import type { Catalog, CatalogFamily, CatalogPackage } from '../../shared/types.ts';
import type { LiveStatus } from '../audiocpp/packageStatus.ts';
import type { InstallRow } from '../db/installs.ts';
import type { ModelSpec } from './parse.ts';
import { isSfxPackage } from './sfx.ts';

/**
 * Vendored specs plus live status plus Miso's own install rows, joined.
 *
 * Pure, because this is where a quiet mistake would show a model as installed
 * when it is not. The vendored specs decide what exists: anything the backend
 * reports that Miso did not vendor is a speech model or a package from a newer
 * audio.cpp, and neither belongs on a music catalog screen.
 */
export function buildCatalog(input: {
  specs: ModelSpec[];
  live: LiveStatus;
  installs: InstallRow[];
  specVersion: string;
  backendUrl: string;
}): Catalog {
  const { specs, live, installs, specVersion, backendUrl } = input;

  const sizes = new Map(live.kind === 'ready' ? live.packages.map((p) => [p.id, p]) : []);
  const byInstall = new Map(installs.map((row) => [row.packageId, row]));

  const families: CatalogFamily[] = specs.flatMap((spec) => {
    const packages: CatalogPackage[] = spec.packages.map((pkg) => {
      const size = sizes.get(pkg.id);
      const install = byInstall.get(pkg.id);

      return {
        id: pkg.id,
        label: pkg.label,
        precision: pkg.precision,
        recommended: pkg.id === spec.recommendedPackageId,
        bytes: size?.bytes,
        installed: size?.installed ?? false,
        install: install
          ? {
              state: install.state,
              phase: install.phase,
              downloadedBytes: install.downloadedBytes,
              totalBytes: install.totalBytes,
              error: install.error,
              startedAt: install.startedAt,
              updatedAt: install.updatedAt,
            }
          : undefined,
      };
    });

    // The recommended package leads the card. The rest keep spec order, which
    // is the order upstream chose to list its precisions in.
    packages.sort((a, b) => Number(b.recommended) - Number(a.recommended));

    const sfx = packages.filter((pkg) => isSfxPackage(pkg.id));
    const rest = packages.filter((pkg) => !isSfxPackage(pkg.id));

    const card = {
      id: spec.family,
      family: spec.family,
      displayName: spec.displayName,
      summary: spec.summary,
      tasks: spec.tasks,
      languages: spec.languages,
      packages,
    };

    // A family that ships both kinds becomes two cards. Only Stable Audio 3
    // does today: its three SFX packages sat behind a disclosure reading "8
    // other versions", which is a good way to own a sound effect model without
    // ever knowing it. A family that is all one kind stays one card, so
    // ControlFoley is not retitled "ControlFoley SFX".
    if (sfx.length === 0 || rest.length === 0) return [card];

    return [
      { ...card, tasks: spec.tasks.filter((task) => task !== 'sfx'), packages: rest },
      {
        ...card,
        id: `${spec.family}:sfx`,
        displayName: `${spec.displayName} SFX`,
        summary: `The sound effect packages of ${spec.displayName}, listed on their own so they are easy to find.`,
        tasks: spec.tasks.filter((task) => task === 'sfx'),
        packages: sfx,
      },
    ];
  });

  return {
    families,
    live: live.kind === 'ready' ? 'ready' : live.kind,
    unavailableReason: live.kind === 'unavailable' ? live.reason : undefined,
    unavailableMessage: live.kind === 'unavailable' ? live.message : undefined,
    specVersion,
    backendUrl,
  };
}
