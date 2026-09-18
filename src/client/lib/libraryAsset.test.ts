import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, LibraryTake } from '../../shared/types.ts';
import { api } from './api.ts';
import { loadLibraryAsset } from './libraryAsset.ts';

vi.mock('./api.ts', () => ({ api: { getAsset: vi.fn() } }));

const getAsset = vi.mocked(api.getAsset);

const row: LibraryTake = {
  assetId: 'asset-1',
  projectId: 'project-1',
  projectName: 'Late nights',
  label: 'Second pass',
  kind: 'generated',
  format: 'wav',
  bytes: 34_000_000,
  durationSeconds: 94.76,
  createdAt: '2026-09-18T10:00:00.000Z',
  hasPeaks: true,
};

beforeEach(() => {
  getAsset.mockReset();
});

describe('loadLibraryAsset', () => {
  it('answers with the stored take, which is the one that carries peaks', async () => {
    const stored = { id: 'asset-1', peaks: [[0.1, 0.2]] } as unknown as Asset;
    getAsset.mockResolvedValue(stored);

    const loaded = await loadLibraryAsset(row);

    expect(getAsset).toHaveBeenCalledWith('project-1', 'asset-1');
    expect(loaded).toEqual({ asset: stored, error: undefined });
  });

  it('still answers with a playable take when the fetch fails', async () => {
    // A missing waveform is not a reason to refuse to play something.
    getAsset.mockRejectedValue(new Error('offline'));

    const loaded = await loadLibraryAsset(row);

    expect(loaded.error).toBe('offline');
    expect(loaded.asset.id).toBe('asset-1');
    expect(loaded.asset.projectId).toBe('project-1');
    expect(loaded.asset.durationSeconds).toBe(94.76);
    expect(loaded.asset.peaks).toBeUndefined();
  });

  it('names the fallback file after the take and its format', async () => {
    getAsset.mockRejectedValue(new Error('offline'));

    const loaded = await loadLibraryAsset(row);

    expect(loaded.asset.filename).toBe('Second pass.wav');
  });

  it('reports a rejection that was never an Error', async () => {
    getAsset.mockRejectedValue('gone');

    const loaded = await loadLibraryAsset(row);

    expect(loaded.error).toBe('gone');
  });
});
