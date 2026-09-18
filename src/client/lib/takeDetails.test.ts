import { describe, expect, it } from 'vitest';
import type { Job } from '../../shared/types.ts';
import { findProducingJob, stringJobParam } from './takeDetails.ts';

const job: Job = {
  id: 'job-1',
  projectId: 'project-1',
  taskId: 'generate.text2music',
  modelId: 'model-1',
  params: {
    prompt: '  exact prompt\nwith spacing  ',
    lyrics: '[Verse]\nExact lyrics',
    seed: 42,
  },
  dismissedAt: '2026-09-12 12:00:00',
  state: 'complete',
  attempts: 1,
  createdAt: '2026-09-12 11:58:00',
  updatedAt: '2026-09-12 12:00:00',
  outputAssetIds: ['asset-1', 'asset-2'],
  inputs: [],
};

describe('take details', () => {
  it('finds a producing job even when it was cleared from the queue', () => {
    expect(findProducingJob([job], 'asset-1')).toBe(job);
    expect(findProducingJob([job], 'asset-2')).toBe(job);
    expect(findProducingJob([job], 'another-asset')).toBeUndefined();
  });

  it('returns string parameters exactly and rejects other parameter types', () => {
    expect(stringJobParam(job, 'prompt')).toBe('  exact prompt\nwith spacing  ');
    expect(stringJobParam(job, 'lyrics')).toBe('[Verse]\nExact lyrics');
    expect(stringJobParam(job, 'seed')).toBeUndefined();
    expect(stringJobParam(job, 'missing')).toBeUndefined();
  });
});
