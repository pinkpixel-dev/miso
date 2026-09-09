import { describe, expect, it } from 'vitest';
import { findPackage, loadSpecs, specVersion } from './registry.ts';

describe('registry', () => {
  it('loads every vendored spec, sorted by display name', () => {
    const specs = loadSpecs();
    expect(specs.length).toBeGreaterThan(0);
    const names = specs.map((s) => s.displayName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('returns the same array on a second call', () => {
    expect(loadSpecs()).toBe(loadSpecs());
  });

  it('reports the pinned commit', () => {
    expect(specVersion()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('finds a package and the family it belongs to', () => {
    const first = loadSpecs()[0]?.packages[0];
    expect(first).toBeDefined();
    const found = findPackage(first!.id);
    expect(found?.pkg.id).toBe(first!.id);
    expect(found?.spec.packages).toContain(first);
  });

  it('returns undefined for a package that does not exist', () => {
    expect(findPackage('not_a_package')).toBeUndefined();
  });
});
