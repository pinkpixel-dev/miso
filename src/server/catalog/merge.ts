import type { Catalog, CatalogFamily, CatalogPackage } from '../../shared/types.ts';
import type { LiveStatus } from '../audiocpp/packageStatus.ts';
import type { InstallRow } from '../db/installs.ts';
import type { ModelSpec } from './parse.ts';

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

  const families: CatalogFamily[] = specs.map((spec) => {
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

    return {
      family: spec.family,
      displayName: spec.displayName,
      summary: spec.summary,
      tasks: spec.tasks,
      languages: spec.languages,
      packages,
    };
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
