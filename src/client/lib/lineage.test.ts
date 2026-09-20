import { describe, expect, it } from 'vitest';
import type { Asset, Job, StudioTask } from '../../shared/types.ts';
import { ancestorsOf, descendantsOf, sourceWasDeleted } from './lineage.ts';

function asset(id: string, label = id): Asset {
  return {
    id,
    projectId: 'p1',
    kind: 'generated',
    label,
    filename: `${id}.wav`,
    format: 'wav',
    bytes: 10,
    checksum: 'abc',
    createdAt: '2026-09-17 10:00:00',
  };
}

function job(
  id: string,
  outputAssetIds: string[],
  inputs: { assetId: string; role: string }[] = [],
  taskId = 'remix.repaint',
): Job {
  return {
    id,
    projectId: 'p1',
    taskId,
    modelId: 'ace_step_turbo_q8_0',
    params: {},
    state: 'complete',
    attempts: 1,
    createdAt: '2026-09-17 10:00:00',
    updatedAt: '2026-09-17 10:04:00',
    outputAssetIds,
    inputs,
  };
}

function task(id: string, inputRoles: string[]): StudioTask {
  return {
    guidedPrompt: true,
    id,
    label: id,
    shortLabel: id,
    summary: id,
    families: ['ace_step'],
    packageIds: [],
    vocals: 'both',
    inputRoles,
    fields: [],
  };
}

describe('ancestorsOf', () => {
  it('finds nothing above a take that was generated from nothing', () => {
    const jobs = [job('j1', ['a1'], [], 'generate.text2music')];
    expect(ancestorsOf('a1', [asset('a1')], jobs)).toEqual([]);
  });

  it('names the take a repaint was made from, and how it was used', () => {
    const jobs = [
      job('j1', ['a1'], [], 'generate.text2music'),
      job('j2', ['a2'], [{ assetId: 'a1', role: 'source' }]),
    ];

    const steps = ancestorsOf('a2', [asset('a1'), asset('a2')], jobs);

    expect(steps).toHaveLength(1);
    expect(steps[0]?.assetId).toBe('a1');
    expect(steps[0]?.role).toBe('source');
    expect(steps[0]?.asset?.label).toBe('a1');
    expect(steps[0]?.job?.id).toBe('j1');
  });

  it('walks a repaint of a repaint all the way up, nearest first', () => {
    const jobs = [
      job('j1', ['a1'], [], 'generate.text2music'),
      job('j2', ['a2'], [{ assetId: 'a1', role: 'source' }]),
      job('j3', ['a3'], [{ assetId: 'a2', role: 'source' }]),
    ];

    const steps = ancestorsOf('a3', [asset('a1'), asset('a2'), asset('a3')], jobs);

    expect(steps.map((step) => step.assetId)).toEqual(['a2', 'a1']);
  });

  it('keeps every input when a job read more than one take', () => {
    const jobs = [
      job('j1', ['a3'], [
        { assetId: 'a1', role: 'source' },
        { assetId: 'a2', role: 'reference' },
      ]),
    ];

    const steps = ancestorsOf('a3', [asset('a1'), asset('a2'), asset('a3')], jobs);

    expect(steps.map((step) => step.assetId)).toEqual(['a1', 'a2']);
    expect(steps.map((step) => step.role)).toEqual(['source', 'reference']);
  });

  it('keeps a step whose take this project cannot see, without an asset', () => {
    const jobs = [job('j2', ['a2'], [{ assetId: 'elsewhere', role: 'source' }])];

    const steps = ancestorsOf('a2', [asset('a2')], jobs);

    expect(steps).toHaveLength(1);
    expect(steps[0]?.assetId).toBe('elsewhere');
    expect(steps[0]?.asset).toBeUndefined();
  });

  it('lists a take reachable by two paths once', () => {
    const jobs = [
      job('j1', ['a1'], [], 'generate.text2music'),
      job('j2', ['a2'], [{ assetId: 'a1', role: 'source' }]),
      job('j3', ['a3'], [{ assetId: 'a1', role: 'source' }]),
      job('j4', ['a4'], [
        { assetId: 'a2', role: 'source' },
        { assetId: 'a3', role: 'reference' },
      ]),
    ];

    const steps = ancestorsOf('a4', [asset('a1'), asset('a2'), asset('a3'), asset('a4')], jobs);

    expect(steps.map((step) => step.assetId)).toEqual(['a2', 'a3', 'a1']);
  });

  it('terminates on a graph that loops', () => {
    const jobs = [
      job('j1', ['a1'], [{ assetId: 'a2', role: 'source' }]),
      job('j2', ['a2'], [{ assetId: 'a1', role: 'source' }]),
    ];

    expect(ancestorsOf('a1', [asset('a1'), asset('a2')], jobs).map((s) => s.assetId)).toEqual([
      'a2',
    ]);
  });
});

describe('descendantsOf', () => {
  it('finds nothing below a take nothing was made from', () => {
    const jobs = [job('j1', ['a1'], [], 'generate.text2music')];
    expect(descendantsOf('a1', [asset('a1')], jobs)).toEqual([]);
  });

  it('lists every take made directly from this one', () => {
    const jobs = [
      job('j1', ['a1'], [], 'generate.text2music'),
      job('j2', ['a2'], [{ assetId: 'a1', role: 'source' }]),
      job('j3', ['a3'], [{ assetId: 'a1', role: 'source' }]),
    ];

    const steps = descendantsOf('a1', [asset('a1'), asset('a2'), asset('a3')], jobs);

    expect(steps.map((step) => step.assetId)).toEqual(['a2', 'a3']);
    expect(steps.map((step) => step.job?.id)).toEqual(['j2', 'j3']);
  });

  it('carries the role this take had in the job that read it', () => {
    const jobs = [job('j2', ['a2'], [{ assetId: 'a1', role: 'reference' }])];

    expect(descendantsOf('a1', [asset('a1'), asset('a2')], jobs)[0]?.role).toBe('reference');
  });

  it('stops at one level rather than returning the whole subtree', () => {
    const jobs = [
      job('j2', ['a2'], [{ assetId: 'a1', role: 'source' }]),
      job('j3', ['a3'], [{ assetId: 'a2', role: 'source' }]),
    ];

    const steps = descendantsOf('a1', [asset('a1'), asset('a2'), asset('a3')], jobs);

    expect(steps.map((step) => step.assetId)).toEqual(['a2']);
  });

  it('lists each produced take once when a job wrote several', () => {
    const jobs = [job('j2', ['a2', 'a3'], [{ assetId: 'a1', role: 'source' }])];

    const steps = descendantsOf('a1', [asset('a1'), asset('a2'), asset('a3')], jobs);

    expect(steps.map((step) => step.assetId)).toEqual(['a2', 'a3']);
  });
});

describe('sourceWasDeleted', () => {
  const tasks = [task('remix.repaint', ['source']), task('generate.text2music', [])];

  it('is true for a task that reads audio and has no inputs left', () => {
    expect(sourceWasDeleted(job('j1', ['a1'], []), tasks)).toBe(true);
  });

  it('is false while the source is still there', () => {
    expect(sourceWasDeleted(job('j1', ['a1'], [{ assetId: 'a0', role: 'source' }]), tasks)).toBe(
      false,
    );
  });

  it('is false for a task that never reads anything', () => {
    expect(sourceWasDeleted(job('j1', ['a1'], [], 'generate.text2music'), tasks)).toBe(false);
  });

  it('is false for an imported take, which has no job at all', () => {
    expect(sourceWasDeleted(undefined, tasks)).toBe(false);
  });

  it('is false for a task this build no longer has, because it cannot be known', () => {
    expect(sourceWasDeleted(job('j1', ['a1'], [], 'remix.gone'), tasks)).toBe(false);
  });
});
