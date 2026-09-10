import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, insertAsset, listAssets, readAsset, renameAsset, setAssetPeaks } from './assets.ts';
import { migrate } from './migrate.ts';
import { createProject } from './projects.ts';

let handle: Database.Database;
let projectId: string;

beforeEach(() => {
  handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
  projectId = createProject(handle, 'Demo').id;
});

function add(label: string) {
  return insertAsset(handle, {
    id: randomUUID(),
    projectId,
    kind: 'source',
    label,
    filename: `${label}.wav`,
    format: 'wav',
    bytes: 1000,
    checksum: 'abc123',
    durationSeconds: 12.5,
    sampleRate: 44100,
    channels: 2,
  });
}

describe('assets', () => {
  it('inserts an asset under the id it was given, with no peaks', () => {
    const asset = add('Take 1');
    expect(asset.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(asset.peaks).toBeUndefined();
    expect(asset.durationSeconds).toBe(12.5);
  });

  it('lists assets newest first', () => {
    const first = add('One');
    const second = add('Two');
    expect(listAssets(handle, projectId).map((a) => a.id)).toEqual([second.id, first.id]);
  });

  it('stores peaks as JSON and reads them back as numbers', () => {
    const asset = add('Take 1');
    const updated = setAssetPeaks(handle, asset.id, [[0, 0.5, 1], [0, -0.5, -1]]);
    expect(updated?.peaks).toEqual([[0, 0.5, 1], [0, -0.5, -1]]);
    expect(readAsset(handle, asset.id)?.peaks).toEqual([[0, 0.5, 1], [0, -0.5, -1]]);
  });

  it('renames an asset without touching its filename', () => {
    const asset = add('Take 1');
    const renamed = renameAsset(handle, asset.id, 'Better name');
    expect(renamed?.label).toBe('Better name');
    expect(renamed?.filename).toBe('Take 1.wav');
  });

  it('answers undefined or false for an asset that does not exist', () => {
    expect(readAsset(handle, 'nope')).toBeUndefined();
    expect(renameAsset(handle, 'nope', 'x')).toBeUndefined();
    expect(setAssetPeaks(handle, 'nope', [[0]])).toBeUndefined();
    expect(deleteAsset(handle, 'nope')).toBe(false);
  });

  it('deletes an asset', () => {
    const asset = add('Take 1');
    expect(deleteAsset(handle, asset.id)).toBe(true);
    expect(listAssets(handle, projectId)).toHaveLength(0);
  });
});
