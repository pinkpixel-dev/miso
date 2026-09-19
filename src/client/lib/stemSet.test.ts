import { describe, expect, it } from 'vitest';
import type { Asset, Job } from '../../shared/types.ts';
import { stemSet } from './stemSet.ts';

function asset(id: string, patch: Partial<Asset> = {}): Asset {
  return {
    id,
    projectId: 'p1',
    kind: 'stem',
    label: id,
    filename: `${id}.wav`,
    format: 'wav',
    bytes: 1,
    checksum: 'x',
    createdAt: '2026-09-18T00:00:00Z',
    ...patch,
  } as Asset;
}

function job(id: string, outputAssetIds: string[], inputs: { assetId: string; role: string }[] = []): Job {
  return {
    id,
    projectId: 'p1',
    taskId: 'stems.separate',
    modelId: 'htdemucs_f16',
    params: {},
    state: 'complete',
    attempts: 0,
    createdAt: '2026-09-18T00:00:00Z',
    outputAssetIds,
    inputs,
  } as Job;
}

const vocals = asset('vocals');
const instrumental = asset('instrumental');
const separation = job('sep-1', ['vocals', 'instrumental']);

describe('stemSet', () => {
  it('lists a separation stems in the order it wrote them', () => {
    const set = stemSet(separation, [vocals, instrumental], [separation]);

    expect(set.map((entry) => entry.asset.id)).toEqual(['vocals', 'instrumental']);
    expect(set.every((entry) => entry.convertedFrom === undefined)).toBe(true);
  });

  it('puts a conversion directly under the stem it was made from', () => {
    // The two being compared sit together: mute one, listen to the other.
    const converted = asset('vocals-manthos');
    const conversion = job('vc-1', ['vocals-manthos'], [{ assetId: 'vocals', role: 'source' }]);

    const set = stemSet(separation, [vocals, instrumental, converted], [separation, conversion]);

    expect(set.map((entry) => entry.asset.id)).toEqual([
      'vocals',
      'vocals-manthos',
      'instrumental',
    ]);
    expect(set[1]?.convertedFrom?.id).toBe('vocals');
  });

  it('carries every conversion of one stem', () => {
    const a = asset('vocals-manthos');
    const b = asset('vocals-chocola');

    const set = stemSet(
      separation,
      [vocals, instrumental, a, b],
      [
        separation,
        job('vc-1', ['vocals-manthos'], [{ assetId: 'vocals', role: 'source' }]),
        job('vc-2', ['vocals-chocola'], [{ assetId: 'vocals', role: 'source' }]),
      ],
    );

    expect(set.map((entry) => entry.asset.id)).toEqual([
      'vocals',
      'vocals-manthos',
      'vocals-chocola',
      'instrumental',
    ]);
  });

  it('leaves a mix of this set out of it', () => {
    // A mix is a descendant of every stem that went into it, and a deck of
    // stems plus the mix of those stems is not what this page is for.
    const mix = asset('mix-1', { kind: 'mix' });
    const mixJob = job('mix-job', ['mix-1'], [
      { assetId: 'vocals', role: 'stem' },
      { assetId: 'instrumental', role: 'stem' },
    ]);

    const set = stemSet(separation, [vocals, instrumental, mix], [separation, mixJob]);

    expect(set.map((entry) => entry.asset.id)).toEqual(['vocals', 'instrumental']);
  });

  it('skips an output whose asset is not in the project any more', () => {
    const set = stemSet(separation, [vocals], [separation]);
    expect(set.map((entry) => entry.asset.id)).toEqual(['vocals']);
  });

  it('has nothing to show without a job', () => {
    expect(stemSet(undefined, [vocals], [separation])).toEqual([]);
  });
});
