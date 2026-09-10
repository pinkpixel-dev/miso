import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataDir } from '../config.ts';
import {
  assetPath,
  ensureProjectDir,
  projectDir,
  removeAsset,
  removeProjectDir,
  sweepTempFiles,
  tempPath,
} from './storage.ts';

afterEach(async () => {
  await removeProjectDir('p1');
  await removeProjectDir('p2');
});

describe('storage paths', () => {
  it('derives an asset path from project, id, and format', () => {
    expect(assetPath('p1', 'a1', 'wav')).toBe(join(dataDir, 'projects', 'p1', 'a1.wav'));
  });

  it('creates a project directory and reports it', async () => {
    const dir = await ensureProjectDir('p1');
    expect(dir).toBe(projectDir('p1'));
    expect(existsSync(dir)).toBe(true);
  });

  it('gives every temp file a distinct name inside the project directory', () => {
    const one = tempPath('p1');
    const two = tempPath('p1');
    expect(one).not.toBe(two);
    expect(one.startsWith(join(projectDir('p1'), '.tmp-'))).toBe(true);
  });

  it('removes one asset file without touching the rest', async () => {
    await ensureProjectDir('p1');
    await writeFile(assetPath('p1', 'a1', 'wav'), 'one');
    await writeFile(assetPath('p1', 'a2', 'wav'), 'two');

    await removeAsset('p1', 'a1', 'wav');

    expect(existsSync(assetPath('p1', 'a1', 'wav'))).toBe(false);
    expect(existsSync(assetPath('p1', 'a2', 'wav'))).toBe(true);
  });

  it('does not throw when removing a file that is already gone', async () => {
    await ensureProjectDir('p1');
    await expect(removeAsset('p1', 'missing', 'wav')).resolves.toBeUndefined();
  });

  it('sweeps temp files and leaves finished assets alone', async () => {
    await ensureProjectDir('p1');
    await ensureProjectDir('p2');
    await writeFile(tempPath('p1'), 'abandoned');
    await writeFile(tempPath('p2'), 'abandoned');
    await writeFile(assetPath('p1', 'a1', 'wav'), 'real');

    const removed = await sweepTempFiles();

    expect(removed).toBe(2);
    expect(await readdir(projectDir('p1'))).toEqual(['a1.wav']);
    expect(existsSync(assetPath('p1', 'a1', 'wav'))).toBe(true);
  });

  it('sweeps nothing when there is no projects directory at all', async () => {
    await mkdir(dataDir, { recursive: true });
    await expect(sweepTempFiles()).resolves.toBeTypeOf('number');
  });
});
