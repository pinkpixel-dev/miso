import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
