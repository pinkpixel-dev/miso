import { describe, expect, it } from 'vitest';
import type { InstallRow } from '../db/installs.ts';
import type { ModelSpec } from './parse.ts';
import { buildCatalog } from './merge.ts';

const ace: ModelSpec = {
  family: 'ace_step',
  displayName: 'ACE-Step 1.5',
  summary: 'Text to music with lyrics.',
  tasks: ['music', 'edit'],
  languages: ['multilingual'],
  // `files` is empty because buildCatalog never reads it. It is carried on a
  // package for the task registry, which uses it to name component GGUFs.
  packages: [
    {
      id: 'ace_turbo_q8',
      label: 'Turbo Q8',
      precision: 'q8_0',
      directory: 'ACE-Step1.5-GGUF/turbo',
      files: [],
    },
    {
      id: 'ace_turbo_bf16',
      label: 'Turbo BF16',
      precision: 'bf16',
      directory: 'ACE-Step1.5-GGUF/turbo',
      files: [],
    },
  ],
  recommendedPackageId: 'ace_turbo_q8',
};

const base = { specs: [ace], installs: [] as InstallRow[], specVersion: 'abc', backendUrl: 'http://backend' };

describe('buildCatalog', () => {
  it('marks the recommended package', () => {
    const catalog = buildCatalog({ ...base, live: { kind: 'scanning' } });
    const packages = catalog.families[0]?.packages ?? [];
    expect(packages.find((p) => p.recommended)?.id).toBe('ace_turbo_q8');
    expect(packages.filter((p) => p.recommended)).toHaveLength(1);
  });

  it('puts the recommended package first', () => {
    const catalog = buildCatalog({
      ...base,
      specs: [{ ...ace, recommendedPackageId: 'ace_turbo_bf16' }],
      live: { kind: 'scanning' },
    });
    expect(catalog.families[0]?.packages[0]?.id).toBe('ace_turbo_bf16');
  });

  it('carries sizes and installed state across from live data', () => {
    const catalog = buildCatalog({
      ...base,
      live: { kind: 'ready', packages: [{ id: 'ace_turbo_q8', bytes: 6_190_000_000, installed: true }] },
    });
    const pkg = catalog.families[0]?.packages.find((p) => p.id === 'ace_turbo_q8');
    expect(pkg?.bytes).toBe(6_190_000_000);
    expect(pkg?.installed).toBe(true);
  });

  it('reports every family while scanning, with no sizes', () => {
    const catalog = buildCatalog({ ...base, live: { kind: 'scanning' } });
    expect(catalog.live).toBe('scanning');
    expect(catalog.families).toHaveLength(1);
    expect(catalog.families[0]?.packages[0]?.bytes).toBeUndefined();
    expect(catalog.families[0]?.packages[0]?.installed).toBe(false);
  });

  it('reports the reason when live data is unavailable', () => {
    const catalog = buildCatalog({
      ...base,
      live: { kind: 'unavailable', reason: 'management_disabled', message: 'no management' },
    });
    expect(catalog.live).toBe('unavailable');
    expect(catalog.unavailableReason).toBe('management_disabled');
    expect(catalog.unavailableMessage).toBe('no management');
    expect(catalog.families).toHaveLength(1);
  });

  it('attaches an install row to its package', () => {
    const install: InstallRow = {
      packageId: 'ace_turbo_q8',
      backendUrl: 'http://backend',
      state: 'running',
      downloadedBytes: 5,
      totalBytes: 10,
      startedAt: '2026-09-09 10:00:00',
      updatedAt: '2026-09-09 10:00:05',
    };
    const catalog = buildCatalog({ ...base, installs: [install], live: { kind: 'scanning' } });
    expect(catalog.families[0]?.packages[0]?.install?.state).toBe('running');
    expect(catalog.families[0]?.packages[1]?.install).toBeUndefined();
  });

  it('ignores live packages and installs that no vendored spec declares', () => {
    const catalog = buildCatalog({
      ...base,
      live: { kind: 'ready', packages: [{ id: 'some_speech_model', bytes: 1, installed: true }] },
      installs: [
        {
          packageId: 'some_speech_model',
          backendUrl: 'http://backend',
          state: 'running',
          startedAt: 'x',
          updatedAt: 'x',
        },
      ],
    });
    const ids = catalog.families.flatMap((f) => f.packages.map((p) => p.id));
    expect(ids).toEqual(['ace_turbo_q8', 'ace_turbo_bf16']);
  });

  it('echoes the spec version and the backend it describes', () => {
    const catalog = buildCatalog({ ...base, live: { kind: 'scanning' } });
    expect(catalog.specVersion).toBe('abc');
    expect(catalog.backendUrl).toBe('http://backend');
  });
});
