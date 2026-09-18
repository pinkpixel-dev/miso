import { describe, expect, it } from 'vitest';
import type { Job } from '../../shared/types.ts';
import { findTask } from '../tasks/registry.ts';
import { labelFor } from './worker.ts';

const task = findTask('generate.text2music');
if (!task) throw new Error('generate.text2music is missing from the registry');

function job(patch: Partial<Job>): Job {
  return {
    id: 'j1',
    projectId: 'p1',
    taskId: task!.id,
    modelId: 'ace_step_turbo_q8_0',
    params: {},
    state: 'complete',
    attempts: 0,
    createdAt: '2026-09-12 10:00:00',
    updatedAt: '2026-09-12 10:00:00',
    outputAssetIds: [],
    inputs: [],
    ...patch,
  };
}

describe('what a finished take is called', () => {
  it('uses the title somebody typed', () => {
    const named = job({ title: '  Midnight Drive  ', params: { prompt: 'synthwave, dreamy' } });
    expect(labelFor(named, task)).toBe('Midnight Drive');
  });

  it('falls back to the first line of the prompt', () => {
    expect(labelFor(job({ params: { prompt: 'synthwave, dreamy\nsecond line' } }), task)).toBe(
      'synthwave, dreamy',
    );
  });

  it('shortens a prompt too long to read in a list', () => {
    const label = labelFor(job({ params: { prompt: 'x'.repeat(100) } }), task);
    expect(label).toHaveLength(60);
    expect(label.endsWith('...')).toBe(true);
  });

  it('falls back to the task label when there is neither', () => {
    expect(labelFor(job({}), task)).toBe(task.label);
    expect(labelFor(job({ title: '   ', params: { prompt: '  ' } }), task)).toBe(task.label);
  });
});
