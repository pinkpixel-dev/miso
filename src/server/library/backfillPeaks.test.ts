import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PEAK_BUCKETS } from '../../shared/limits.ts';
import { insertAsset, readAsset, setAssetPeaks } from '../db/assets.ts';
import { migrate } from '../db/migrate.ts';
import { createProject } from '../db/projects.ts';
import { assetPath, projectDir } from './storage.ts';
import { backfillWavPeaks } from './backfillPeaks.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let handle: Database.Database;
let projectId: string;

async function put(id: string, format: 'wav' | 'mp3', fixture: string): Promise<void> {
  await mkdir(projectDir(projectId), { recursive: true });
  await writeFile(assetPath(projectId, id, format), readFileSync(join(fixtures, fixture)));

  insertAsset(handle, {
    id,
    projectId,
    kind: 'generated',
    label: id,
    filename: `${id}.${format}`,
    format,
    bytes: 1,
    checksum: 'x',
  });
}

beforeEach(() => {
  handle = new Database(':memory:');
  migrate(handle);
  projectId = createProject(handle, 'Backfill').id;
});

afterEach(async () => {
  handle.close();
  await rm(projectDir(projectId), { recursive: true, force: true });
});

describe('backfillWavPeaks', () => {
  it('fills in a WAV take that has no waveform', async () => {
    await put('a', 'wav', 'tone.wav');

    expect(await backfillWavPeaks(handle)).toBe(1);
    expect(readAsset(handle, 'a')?.peaks?.[0]).toHaveLength(PEAK_BUCKETS);
  });

  it('leaves a take that already has one alone', async () => {
    await put('a', 'wav', 'tone.wav');
    const mine = [new Array(PEAK_BUCKETS).fill(0.25) as number[]];
    setAssetPeaks(handle, 'a', mine);

    expect(await backfillWavPeaks(handle)).toBe(0);
    expect(readAsset(handle, 'a')?.peaks).toEqual(mine);
  });

  it('ignores formats the browser has to decode', async () => {
    await put('a', 'mp3', 'tone.mp3');

    expect(await backfillWavPeaks(handle)).toBe(0);
    expect(readAsset(handle, 'a')?.peaks).toBeUndefined();
  });

  it('skips a row whose file has gone missing and keeps going', async () => {
    insertAsset(handle, {
      id: 'gone',
      projectId,
      kind: 'generated',
      label: 'gone',
      filename: 'gone.wav',
      format: 'wav',
      bytes: 1,
      checksum: 'x',
    });
    await put('here', 'wav', 'tone.wav');

    expect(await backfillWavPeaks(handle)).toBe(1);
    expect(readAsset(handle, 'gone')?.peaks).toBeUndefined();
    expect(readAsset(handle, 'here')?.peaks).toBeDefined();
  });

  it('finds nothing on a second run', async () => {
    await put('a', 'wav', 'tone.wav');

    expect(await backfillWavPeaks(handle)).toBe(1);
    expect(await backfillWavPeaks(handle)).toBe(0);
  });
});
