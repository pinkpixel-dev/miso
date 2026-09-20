import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogPackage, StudioTask } from '../../shared/types.ts';
import { buildLabel, firstRunSuggestion, installedPackages } from './models.ts';

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
      { id: family, family, displayName: 'ACE-Step', summary: '', tasks: [], languages: [], packages },
    ],
    live: 'ready',
    specVersion: 'test',
    backendUrl: 'http://localhost:8080',
  };
}

function taskOf(packageIds: string[], ...families: string[]): StudioTask {
  return {
    id: 'remix.repaint',
    guidedPrompt: true,
    label: 'Repaint a section',
    shortLabel: 'Repaints',
    summary: '',
    families: families.length > 0 ? families : ['ace_step'],
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

/** A catalog of music families, which is what the first run question is about. */
function musicCatalog(
  families: { id: string; packages: CatalogPackage[]; tasks?: string[] }[],
  live: Catalog['live'] = 'ready',
): Catalog {
  return {
    families: families.map((entry) => ({
      id: entry.id,
      family: entry.id,
      displayName: entry.id.toUpperCase(),
      summary: '',
      tasks: entry.tasks ?? ['music'],
      languages: [],
      packages: entry.packages,
    })),
    live,
    specVersion: 'test',
    backendUrl: 'http://localhost:8080',
  };
}

describe('what to download first', () => {
  const uninstalled = (id: string, recommended: boolean) =>
    pkg(id, { installed: false, recommended });

  it('suggests the recommended ACE-Step package when nothing is installed', () => {
    const catalog = musicCatalog([
      { id: 'ace_step', packages: [uninstalled('ace_a', false), uninstalled('ace_b', true)] },
    ]);

    expect(firstRunSuggestion(catalog)?.pkg.id).toBe('ace_b');
  });

  it('prefers ACE-Step over the other families that can make music', () => {
    const catalog = musicCatalog([
      { id: 'minimax_music3', packages: [uninstalled('mini', true)] },
      { id: 'ace_step', packages: [uninstalled('ace', true)] },
    ]);

    expect(firstRunSuggestion(catalog)?.pkg.id).toBe('ace');
  });

  it('falls back to another music family when ACE-Step is not in the catalog', () => {
    const catalog = musicCatalog([{ id: 'minimax_music3', packages: [uninstalled('mini', true)] }]);

    expect(firstRunSuggestion(catalog)?.pkg.id).toBe('mini');
  });

  it('suggests nothing once anything can make music', () => {
    const catalog = musicCatalog([
      { id: 'ace_step', packages: [uninstalled('ace', true)] },
      { id: 'minimax_music3', packages: [pkg('mini', { installed: true })] },
    ]);

    expect(firstRunSuggestion(catalog)).toBeUndefined();
  });

  it('ignores a family that cannot make music', () => {
    // Separation and voice models are installed the same way and are not an
    // answer to "I cannot generate anything yet".
    const catalog = musicCatalog([
      { id: 'htdemucs', tasks: ['separate'], packages: [pkg('demucs', { installed: true })] },
      { id: 'ace_step', packages: [uninstalled('ace', true)] },
    ]);

    expect(firstRunSuggestion(catalog)?.pkg.id).toBe('ace');
  });

  it('says nothing while the backend is still scanning', () => {
    // A half-read catalog reports everything as absent. Telling somebody with a
    // full model directory to download a model is worse than saying nothing.
    const catalog = musicCatalog([{ id: 'ace_step', packages: [uninstalled('ace', true)] }], 'scanning');

    expect(firstRunSuggestion(catalog)).toBeUndefined();
  });

  it('says nothing when the backend cannot be reached', () => {
    const catalog = musicCatalog(
      [{ id: 'ace_step', packages: [uninstalled('ace', true)] }],
      'unavailable',
    );

    expect(firstRunSuggestion(catalog)).toBeUndefined();
  });

  it('says nothing before the catalog has loaded at all', () => {
    expect(firstRunSuggestion(undefined)).toBeUndefined();
  });
});
