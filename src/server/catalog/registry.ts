import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpec, type ModelSpec, type SpecPackage } from './parse.ts';

/**
 * The vendored specs, read once.
 *
 * They only change when someone runs the vendoring script, so there is nothing
 * to invalidate and no reason to touch the disk again after the first call.
 */

const specsDir = join(dirname(fileURLToPath(import.meta.url)), 'specs');

interface Manifest {
  commit: string;
  files: { name: string }[];
}

let specs: ModelSpec[] | undefined;
let manifest: Manifest | undefined;
let byPackage: Map<string, { spec: ModelSpec; pkg: SpecPackage }> | undefined;

function readManifest(): Manifest {
  manifest ??= JSON.parse(readFileSync(join(specsDir, 'MANIFEST.json'), 'utf8')) as Manifest;
  return manifest;
}

export function loadSpecs(): ModelSpec[] {
  if (specs) return specs;

  const names = readdirSync(specsDir)
    .filter((f) => f.endsWith('.json') && f !== 'MANIFEST.json')
    .sort();

  specs = names
    .map((name) => parseSpec(JSON.parse(readFileSync(join(specsDir, name), 'utf8')), name))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  byPackage = new Map();
  for (const spec of specs) {
    for (const pkg of spec.packages) byPackage.set(pkg.id, { spec, pkg });
  }

  return specs;
}

export function specVersion(): string {
  return readManifest().commit;
}

export function findPackage(id: string): { spec: ModelSpec; pkg: SpecPackage } | undefined {
  loadSpecs();
  return byPackage?.get(id);
}
