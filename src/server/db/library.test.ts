import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertAsset, listLibraryTakes, setAssetPeaks } from './assets.ts';
import { createJob } from './jobs.ts';
import { migrate } from './migrate.ts';
import { createProject } from './projects.ts';

let handle: Database.Database;
let first: string;
let second: string;

function add(projectId: string, label: string, jobId?: string) {
  return insertAsset(handle, {
    id: randomUUID(),
    projectId,
    kind: jobId === undefined ? 'source' : 'generated',
    label,
    filename: `${label}.wav`,
    format: 'wav',
    bytes: 2000,
    checksum: 'abc123',
    durationSeconds: 30,
    jobId,
  });
}

function job(id: string, projectId: string, params: Record<string, unknown>, title?: string) {
  return createJob(handle, id, {
    projectId,
    taskId: 'generate.text2music',
    modelId: 'ace_step_turbo_q8_0',
    params,
    title,
  });
}

beforeEach(() => {
  handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
  first = createProject(handle, 'Night drive').id;
  second = createProject(handle, 'Demos').id;
});

describe('listLibraryTakes', () => {
  it('reads every project, newest first, with the project name on each take', () => {
    add(first, 'One');
    add(second, 'Two');

    const takes = listLibraryTakes(handle);
    expect(takes.map((take) => take.label)).toEqual(['Two', 'One']);
    expect(takes.map((take) => take.projectName)).toEqual(['Demos', 'Night drive']);
  });

  it('carries the task, the title, the prompt and the lyrics of the job that made a take', () => {
    job('j1', first, { prompt: 'slow shoegaze', lyrics: 'the tide goes out' }, 'Undertow');
    add(first, 'Take 1', 'j1');

    const take = listLibraryTakes(handle)[0];
    expect(take?.taskId).toBe('generate.text2music');
    expect(take?.title).toBe('Undertow');
    expect(take?.prompt).toBe('slow shoegaze');
    expect(take?.lyrics).toBe('the tide goes out');
  });

  it('leaves an imported take without a task, a title or a prompt', () => {
    add(first, 'Imported');

    const take = listLibraryTakes(handle)[0];
    expect(take?.taskId).toBeUndefined();
    expect(take?.title).toBeUndefined();
    expect(take?.prompt).toBeUndefined();
    expect(take?.label).toBe('Imported');
  });

  it('keeps a take whose job params will not parse, and drops only the text', () => {
    job('j2', first, { prompt: 'techno' });
    handle.prepare('UPDATE jobs SET params = ? WHERE id = ?').run('not json', 'j2');
    add(first, 'Survivor', 'j2');

    const take = listLibraryTakes(handle)[0];
    expect(take?.label).toBe('Survivor');
    expect(take?.prompt).toBeUndefined();
  });

  it('reports whether a waveform is stored without sending one', () => {
    const asset = add(first, 'Drawn');
    setAssetPeaks(handle, asset.id, [[0.1, 0.2]]);
    add(first, 'Undrawn');

    const byLabel = new Map(listLibraryTakes(handle).map((take) => [take.label, take]));
    expect(byLabel.get('Drawn')?.hasPeaks).toBe(true);
    expect(byLabel.get('Undrawn')?.hasPeaks).toBe(false);
    expect(Object.keys(byLabel.get('Drawn') ?? {})).not.toContain('peaks');
  });

  it('ignores an empty prompt rather than reporting one', () => {
    job('j3', first, { prompt: '' });
    add(first, 'Blank', 'j3');

    expect(listLibraryTakes(handle)[0]?.prompt).toBeUndefined();
  });
});
