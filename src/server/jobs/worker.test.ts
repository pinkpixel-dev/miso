import { describe, expect, it } from 'vitest';
import type { Asset, Job } from '../../shared/types.ts';
import { findTask } from '../tasks/registry.ts';
import { conversionRate, labelFor } from './worker.ts';

const task = findTask('generate.text2music');
if (!task) throw new Error('generate.text2music is missing from the registry');

const separate = findTask('stems.separate');
if (!separate) throw new Error('stems.separate is missing from the registry');

const rvc = findTask('voice.rvc');
if (!rvc) throw new Error('voice.rvc is missing from the registry');

function asset(patch: Partial<Asset>): Asset {
  return {
    id: 'a1',
    projectId: 'p1',
    kind: 'generated',
    label: 'Take 1',
    filename: 'Take 1.wav',
    format: 'wav',
    bytes: 1000,
    checksum: 'f'.repeat(64),
    createdAt: '2026-09-18 10:00:00',
    ...patch,
  };
}

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

  /**
   * Separation has no prompt, so without the source every set of stems in a
   * project is called "Split into stems (vocals)" and no export can be told
   * from another.
   */
  it('names a take with no prompt after what it was made from', () => {
    expect(labelFor(job({ taskId: separate!.id }), separate!, 'Neon Night')).toBe('Neon Night');
  });

  it('still prefers a typed title over the source', () => {
    expect(labelFor(job({ title: 'Stems for the remix' }), separate!, 'Neon Night')).toBe(
      'Stems for the remix',
    );
  });

  it('falls back to the task label when the source has no name', () => {
    expect(labelFor(job({}), separate!, '   ')).toBe(separate!.label);
    expect(labelFor(job({}), separate!, undefined)).toBe(separate!.label);
  });

  it('shortens a source name too long to read in a list', () => {
    const label = labelFor(job({}), separate!, 'x'.repeat(100));
    expect(label).toHaveLength(60);
    expect(label.endsWith('...')).toBe(true);
  });

  /**
   * A conversion reads one stem and hands back one track. Named after its
   * source alone, the two rows would carry the same name in the library and in
   * the stem deck, where the point is hearing one against the other.
   */
  it('adds what a task did to the name of what it read', () => {
    expect(
      labelFor(job({ taskId: rvc!.id, params: { voiceId: 'manthos' } }), rvc!, 'Neon Night (vocals)'),
    ).toBe('Neon Night (vocals) (manthos)');
  });

  it('keeps the suffix when the source name has to be shortened', () => {
    const label = labelFor(job({ params: { voiceId: 'manthos' } }), rvc!, 'x'.repeat(100));
    expect(label).toHaveLength(60);
    expect(label.endsWith('...')).toBe(true);
  });

  it('names a conversion after its source alone when no voice was chosen', () => {
    expect(labelFor(job({}), rvc!, 'Neon Night (vocals)')).toBe('Neon Night (vocals)');
  });
});

/**
 * Separation refuses anything but 44.1 kHz before it starts any work, and every
 * take audio.cpp generates is 48 kHz. Measured 2026-09-18, see
 * src/server/audiocpp/fixtures/README.md.
 */
describe('whether a source is converted before it is staged', () => {
  it('leaves a task that asks for no particular rate alone', () => {
    expect(conversionRate(task!, asset({ sampleRate: 48_000 }))).toBeUndefined();
    expect(conversionRate(task!, asset({ sampleRate: 44_100 }))).toBeUndefined();
  });

  it('converts a 48 kHz take for separation', () => {
    expect(conversionRate(separate!, asset({ sampleRate: 48_000 }))).toBe(44_100);
  });

  it('leaves a take that is already at the right rate', () => {
    // Stable Audio writes at 44.1 kHz, so some takes skip the work entirely.
    expect(conversionRate(separate!, asset({ sampleRate: 44_100 }))).toBeUndefined();
  });

  it('converts when the rate was never recorded rather than trusting it', () => {
    expect(conversionRate(separate!, asset({ sampleRate: undefined }))).toBe(44_100);
  });
});
