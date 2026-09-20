import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSpec } from './parse.ts';

const specsDir = join(dirname(fileURLToPath(import.meta.url)), 'specs');

function loadSpec(name: string): unknown {
  return JSON.parse(readFileSync(join(specsDir, name), 'utf8'));
}

describe('parseSpec', () => {
  it('reads the fields the catalog renders', () => {
    const spec = parseSpec(loadSpec('ace_step.json'), 'ace_step.json');

    expect(spec.family).toBe('ace_step');
    expect(spec.displayName.length).toBeGreaterThan(0);
    expect(spec.summary.length).toBeGreaterThan(0);
    expect(spec.tasks.length).toBeGreaterThan(0);
    expect(spec.languages).toEqual(['50+ languages']);
    expect(spec.packages.length).toBeGreaterThan(0);
    expect(spec.packages[0]?.id).toMatch(/\S/);
    expect(spec.packages[0]?.precision).toMatch(/\S/);
    expect(spec.recommendedPackageId).toBe('ace_step_turbo_bf16');
  });

  it('names the file when the family id does not match it', () => {
    expect(() => parseSpec({ ...(loadSpec('ace_step.json') as object), family: 'wrong' }, 'ace_step.json')).toThrow(
      /ace_step\.json/,
    );
  });

  it('rejects a document that is not a spec', () => {
    expect(() => parseSpec({ hello: true }, 'broken.json')).toThrow(/broken\.json/);
  });

  it('falls back to the display name when the spec carries no description', () => {
    const raw = loadSpec('ace_step.json') as Record<string, unknown>;
    delete raw.description;
    const spec = parseSpec(raw, 'ace_step.json');
    expect(spec.summary).toBe(spec.displayName);
  });

  it('leaves recommendedPackageId undefined when the spec has no ui.recommended_package', () => {
    const raw = loadSpec('ace_step.json') as Record<string, unknown>;
    delete raw.ui;
    const spec = parseSpec(raw, 'ace_step.json');
    expect(spec.recommendedPackageId).toBeUndefined();
  });

  it('parses a spec that has no schema_version field, like ace_step and stable_audio', () => {
    const raw = loadSpec('ace_step.json') as Record<string, unknown>;
    expect(raw.schema_version).toBeUndefined();
    expect(() => parseSpec(raw, 'ace_step.json')).not.toThrow();
  });

  it('accepts language entries that are not language codes', () => {
    const spec = parseSpec(loadSpec('bs_roformer.json'), 'bs_roformer.json');
    expect(spec.languages).toEqual(['language_agnostic']);
  });

  it('parses every vendored spec', () => {
    const manifest = JSON.parse(readFileSync(join(specsDir, 'MANIFEST.json'), 'utf8')) as {
      files: { name: string }[];
    };
    for (const file of manifest.files) {
      expect(() => parseSpec(loadSpec(file.name), file.name)).not.toThrow();
    }
  });
});

describe('the directory a package installs into', () => {
  /**
   * The loader is handed this path, so getting it wrong is a failed load with a
   * message about safetensors sources rather than about the path. See
   * DOCS/ERRORS.md.
   */
  it('keeps the variant subdirectory when the weights live in one', () => {
    // ACE-Step installs into ACE-Step1.5-GGUF/turbo, and pointing at the parent
    // falls back to a safetensors source and fails on a missing file.
    const spec = parseSpec(loadSpec('ace_step.json'), 'ace_step.json');
    const turbo = spec.packages.find((pkg) => pkg.id === 'ace_step_turbo_bf16');
    expect(turbo?.directory).toBe('ACE-Step1.5-GGUF/turbo');
  });

  it('ignores sidecars that sort before the weights', () => {
    // YuE2 lists four configs under sidecars/ before its GGUF at the package
    // root. Reading the first entry pointed the loader at Yue2-3B-GGUF/sidecars.
    const spec = parseSpec(loadSpec('yue2.json'), 'yue2.json');
    for (const pkg of spec.packages) {
      expect(pkg.directory).toBe('Yue2-3B-GGUF');
    }
  });

  it('uses the target directory when the weights sit at the package root', () => {
    const spec = parseSpec(loadSpec('minimax_music3.json'), 'minimax_music3.json');
    expect(spec.packages[0]?.directory).toBe('MiniMax-Music3-GGUF');
  });

  it('falls back to the first file when a package ships no gguf', () => {
    // Nothing vendored is like this today. A safetensors package should still
    // resolve to something rather than failing to parse.
    const spec = parseSpec(
      {
        family: 'made_up',
        display_name: 'Made Up',
        packages: [
          {
            id: 'made_up_st',
            precision: 'f32',
            target_directory: 'Made-Up',
            files: ['weights/model.safetensors'],
          },
        ],
      },
      'made_up.json',
    );
    expect(spec.packages[0]?.directory).toBe('Made-Up/weights');
  });
});

