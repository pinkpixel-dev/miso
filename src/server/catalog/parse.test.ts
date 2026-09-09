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
