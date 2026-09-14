import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogPackage, StudioTask } from '../../shared/types.ts';
import { buildLabel, installedPackages } from './models.ts';

function pkg(id: string, patch: Partial<CatalogPackage> = {}): CatalogPackage {
  return {
    id,
    label: id,
    precision: 'q8_0',
    recommended: false,
    installed: true,
    ...patch,
  };
}

function catalogOf(packages: CatalogPackage[], family = 'ace_step'): Catalog {
  return {
    families: [
      { family, displayName: 'ACE-Step', summary: '', tasks: [], languages: [], packages },
    ],
    live: 'ready',
    specVersion: 'test',
    backendUrl: 'http://localhost:8080',
  };
}

function taskOf(packageIds: string[], family = 'ace_step'): StudioTask {
  return {
    id: 'remix.repaint',
    label: 'Repaint a section',
    summary: '',
    family,
    vocals: 'both',
    packageIds,
    inputRoles: ['source'],
    fields: [],
  };
}

describe('installedPackages', () => {
  it('offers what is installed and declared', () => {
    const catalog = catalogOf([pkg('turbo'), pkg('base')]);
    expect(installedPackages(catalog, taskOf(['turbo', 'base'])).map((p) => p.id)).toEqual([
      'turbo',
      'base',
    ]);
  });

  it('leaves out what is not installed', () => {
    const catalog = catalogOf([pkg('turbo'), pkg('base', { installed: false })]);
    expect(installedPackages(catalog, taskOf(['turbo', 'base'])).map((p) => p.id)).toEqual(['turbo']);
  });

  /**
   * The check that keeps a job from failing after it was queued. Stable Audio
   * ships SFX packages beside its music ones, and a task says which it accepts.
   */
  it('leaves out a package the task does not declare', () => {
    const catalog = catalogOf([pkg('music'), pkg('sfx')]);
    expect(installedPackages(catalog, taskOf(['music'])).map((p) => p.id)).toEqual(['music']);
  });

  it('puts the recommended package first', () => {
    const catalog = catalogOf([pkg('base'), pkg('turbo', { recommended: true })]);
    expect(installedPackages(catalog, taskOf(['base', 'turbo'])).map((p) => p.id)).toEqual([
      'turbo',
      'base',
    ]);
  });

  it('answers with nothing when the family is not in the catalog', () => {
    expect(installedPackages(catalogOf([pkg('turbo')], 'stable_audio'), taskOf(['turbo']))).toEqual(
      [],
    );
    expect(installedPackages(undefined, taskOf(['turbo']))).toEqual([]);
  });
});

describe('buildLabel', () => {
  it('drops the model name the heading already carries', () => {
    expect(buildLabel(pkg('x', { label: 'ACE-Step 1.5 Turbo Q8_0' }), 'ACE-Step 1.5')).toBe(
      'Turbo Q8_0',
    );
  });

  it('keeps the whole label when it does not start with the model name', () => {
    expect(buildLabel(pkg('x', { label: 'Something else' }), 'ACE-Step 1.5')).toBe('Something else');
  });

  it('keeps the whole label rather than leaving nothing behind', () => {
    expect(buildLabel(pkg('x', { label: 'ACE-Step 1.5' }), 'ACE-Step 1.5')).toBe('ACE-Step 1.5');
  });
});
