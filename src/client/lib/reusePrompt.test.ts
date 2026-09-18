import { describe, expect, it } from 'vitest';
import type { Job } from '../../shared/types.ts';
import { prefillFromJob } from './reusePrompt.ts';
import { EMPTY_STUDIO } from './studio.ts';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    projectId: 'p1',
    taskId: 'generate.text2music',
    modelId: 'ace_step_turbo_q8_0',
    params: {},
    state: 'complete',
    attempts: 1,
    createdAt: '2026-09-17 10:00:00',
    updatedAt: '2026-09-17 10:04:00',
    outputAssetIds: ['a1'],
    inputs: [],
    ...overrides,
  };
}

const INSTALLED = ['ace_step_turbo_q8_0', 'heartmula_q4'];

describe('prefillFromJob', () => {
  it('reopens a guided job in guided mode with the builder it was written with', () => {
    const studio = {
      style: 'synthwave, warm analogue tape',
      mood: 'wistful',
      vocalMode: 'female' as const,
      vocalStyle: 'airy',
    };

    const prefill = prefillFromJob(job({ studio }), INSTALLED);

    expect(prefill.mode).toBe('guided');
    expect(prefill.builder).toEqual(studio);
  });

  it('reopens a job the form wrote in custom mode, with empty builder boxes', () => {
    const prefill = prefillFromJob(job(), INSTALLED);

    expect(prefill.mode).toBe('custom');
    expect(prefill.builder).toEqual(EMPTY_STUDIO);
  });

  it('brings every recorded param back as text', () => {
    const prefill = prefillFromJob(
      job({ params: { prompt: 'slow dub techno', lyrics: 'one line\nanother' } }),
      INSTALLED,
    );

    expect(prefill.values).toEqual({ prompt: 'slow dub techno', lyrics: 'one line\nanother' });
  });

  it('stringifies numbers, because every box holds text', () => {
    const prefill = prefillFromJob(job({ params: { length: 180, guidance: 7.5 } }), INSTALLED);

    expect(prefill.values).toEqual({ length: '180', guidance: '7.5' });
  });

  it('drops a param no box could hold rather than coercing it', () => {
    const prefill = prefillFromJob(
      job({ params: { prompt: 'kept', shape: { nested: true }, list: [1, 2], flag: true } }),
      INSTALLED,
    );

    expect(prefill.values).toEqual({ prompt: 'kept' });
  });

  it('gives an untitled job an empty title box', () => {
    expect(prefillFromJob(job(), INSTALLED).title).toBe('');
    expect(prefillFromJob(job({ title: 'Night drive' }), INSTALLED).title).toBe('Night drive');
  });

  it('seeds the recorded model when it is still installed', () => {
    const prefill = prefillFromJob(job(), INSTALLED);

    expect(prefill.modelId).toBe('ace_step_turbo_q8_0');
    expect(prefill.missingModelId).toBeUndefined();
  });

  it('names the recorded model instead of seeding it when it is gone', () => {
    const prefill = prefillFromJob(job({ modelId: 'uninstalled_model' }), INSTALLED);

    expect(prefill.modelId).toBeUndefined();
    expect(prefill.missingModelId).toBe('uninstalled_model');
    expect(prefill.values).toEqual({});
  });

  it('still carries the settings when the model is gone', () => {
    const prefill = prefillFromJob(
      job({ modelId: 'uninstalled_model', params: { prompt: 'kept anyway' }, title: 'Kept' }),
      INSTALLED,
    );

    expect(prefill.values).toEqual({ prompt: 'kept anyway' });
    expect(prefill.title).toBe('Kept');
  });
});
