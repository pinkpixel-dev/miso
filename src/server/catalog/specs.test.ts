import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findPackage, loadSpecs } from './registry.ts';

const specsDir = join(dirname(fileURLToPath(import.meta.url)), 'specs');

interface Manifest {
  repository: string;
  commit: string;
  vendoredAt: string;
  files: { name: string; sha256: string }[];
}

const manifest = JSON.parse(readFileSync(join(specsDir, 'MANIFEST.json'), 'utf8')) as Manifest;

describe('vendored specs', () => {
  it('pins a real commit rather than a branch', () => {
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('has every file the manifest lists, unmodified', () => {
    for (const file of manifest.files) {
      const bytes = readFileSync(join(specsDir, file.name));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
  });

  it('has no spec file the manifest does not list', () => {
    const onDisk = readdirSync(specsDir)
      .filter((f) => f.endsWith('.json') && f !== 'MANIFEST.json')
      .sort();
    expect(onDisk).toEqual(manifest.files.map((f) => f.name).sort());
  });

  it('vendored a spec whose family id matches its filename', () => {
    for (const file of manifest.files) {
      const spec = JSON.parse(readFileSync(join(specsDir, file.name), 'utf8')) as { family?: string };
      expect(spec.family).toBe(file.name.replace(/\.json$/, ''));
    }
  });
});

describe('package directories', () => {
  it('includes the variant subdirectory for ACE-Step', () => {
    // Pointing the loader at ACE-Step1.5-GGUF instead falls back to a
    // safetensors source and fails. See DOCS/ERRORS.md.
    expect(findPackage('ace_step_turbo_q8_0')?.pkg.directory).toBe('ACE-Step1.5-GGUF/turbo');
    expect(findPackage('ace_step_base_bf16')?.pkg.directory).toBe('ACE-Step1.5-GGUF/base');
  });

  it('uses the target directory for a package whose files sit at its root', () => {
    expect(findPackage('htdemucs_q8_0')?.pkg.directory).toBe('HTDemucs-GGUF');
    expect(findPackage('minimax_music3_q8_0')?.pkg.directory).toBe('MiniMax-Music3-GGUF');
  });

  it('gives every vendored package a directory', () => {
    for (const spec of loadSpecs()) {
      for (const pkg of spec.packages) {
        expect(pkg.directory, `${pkg.id} has no directory`).toMatch(/^[^/].*/);
      }
    }
  });
});
