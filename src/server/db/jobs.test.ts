import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, insertAsset } from './assets.ts';
import {
  createJob,
  dismissFinishedJobs,
  failInterruptedJobs,
  listJobInputs,
  listJobs,
  nextQueuedJob,
  readJob,
  forgetStagedPath,
  readStagedPath,
  recordStagedPath,
  requeueJob,
  setJobState,
} from './jobs.ts';
import { migrate } from './migrate.ts';
import { createProject } from './projects.ts';

let handle: Database.Database;
let projectId: string;

function queue(id: string, modelId = 'ace_step_turbo_q8_0') {
  return createJob(handle, id, {
    projectId,
    taskId: 'generate.text2music',
    modelId,
    params: { prompt: 'synth pop' },
  });
}

beforeEach(() => {
  handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
  projectId = createProject(handle, 'Demo').id;
});

describe('jobs', () => {
  it('starts a job queued, with its params kept whole', () => {
    const job = queue('job-1');
    expect(job.state).toBe('queued');
    expect(job.params).toEqual({ prompt: 'synth pop' });
    expect(job.attempts).toBe(0);
    expect(job.startedAt).toBeUndefined();
  });

  it('clears finished jobs by hiding them, and leaves live ones alone', () => {
    queue('done');
    queue('broke');
    queue('waiting');
    setJobState(handle, 'done', 'complete');
    setJobState(handle, 'broke', 'failed');

    expect(dismissFinishedJobs(handle, projectId)).toBe(2);

    const byId = new Map(listJobs(handle, projectId).map((job) => [job.id, job]));
    expect(byId.get('done')?.dismissedAt).toBeDefined();
    expect(byId.get('broke')?.dismissedAt).toBeDefined();
    // Hiding work that has not happened yet would take the only progress
    // report off the screen.
    expect(byId.get('waiting')?.dismissedAt).toBeUndefined();
  });

  it('keeps the row and its params when the queue is cleared', () => {
    queue('done');
    setJobState(handle, 'done', 'complete');
    dismissFinishedJobs(handle, projectId);

    // This is the whole reason clearing hides rather than deletes: the take can
    // still say what made it.
    const job = readJob(handle, 'done');
    expect(job?.params).toEqual({ prompt: 'synth pop' });
    expect(job?.state).toBe('complete');
  });

  it('does not restamp a job the queue was already cleared past', () => {
    queue('done');
    setJobState(handle, 'done', 'complete');
    dismissFinishedJobs(handle, projectId);
    const first = readJob(handle, 'done')?.dismissedAt;

    expect(dismissFinishedJobs(handle, projectId)).toBe(0);
    expect(readJob(handle, 'done')?.dismissedAt).toBe(first);
  });

  it('stamps started_at once and finished_at at the end', () => {
    queue('job-1');

    const staging = setJobState(handle, 'job-1', 'staging');
    expect(staging?.startedAt).toBeDefined();
    expect(staging?.finishedAt).toBeUndefined();

    const running = setJobState(handle, 'job-1', 'running');
    expect(running?.startedAt).toBe(staging?.startedAt);

    const done = setJobState(handle, 'job-1', 'complete');
    expect(done?.finishedAt).toBeDefined();
  });

  it('keeps the reason a job failed', () => {
    queue('job-1');
    const failed = setJobState(handle, 'job-1', 'failed', 'The backend went away');
    expect(failed?.error).toBe('The backend went away');
  });

  it('clears a stale error when a requeued job runs again', () => {
    queue('job-1');
    setJobState(handle, 'job-1', 'failed', 'busy');
    const requeued = requeueJob(handle, 'job-1');
    expect(requeued?.state).toBe('queued');
    expect(requeued?.attempts).toBe(1);

    expect(setJobState(handle, 'job-1', 'running')?.error).toBeUndefined();
  });

  it('records the assets a job read, by role', () => {
    const assetId = 'asset-1';
    insertAsset(handle, {
      id: assetId,
      projectId,
      kind: 'source',
      label: 'Chorus',
      filename: 'chorus.wav',
      format: 'wav',
      bytes: 10,
      checksum: 'abc',
    });

    createJob(handle, 'job-1', {
      projectId,
      taskId: 'generate.text2music',
      modelId: 'ace_step_turbo_q8_0',
      params: {},
      inputs: [{ assetId, role: 'source' }],
    });

    expect(listJobInputs(handle, 'job-1')).toEqual([{ assetId, role: 'source' }]);
  });

  it('carries what a job read on the job itself', () => {
    const assetId = 'asset-1';
    insertAsset(handle, {
      id: assetId,
      projectId,
      kind: 'source',
      label: 'Chorus',
      filename: 'chorus.wav',
      format: 'wav',
      bytes: 10,
      checksum: 'abc',
    });

    createJob(handle, 'job-1', {
      projectId,
      taskId: 'remix.repaint',
      modelId: 'ace_step_turbo_q8_0',
      params: {},
      inputs: [{ assetId, role: 'source' }],
    });

    expect(readJob(handle, 'job-1')?.inputs).toEqual([{ assetId, role: 'source' }]);
  });

  it('gives a job that reads nothing an empty input list', () => {
    queue('job-1');
    expect(readJob(handle, 'job-1')?.inputs).toEqual([]);
  });

  it('loses the input when the take it pointed at is deleted', () => {
    const assetId = 'asset-1';
    insertAsset(handle, {
      id: assetId,
      projectId,
      kind: 'source',
      label: 'Chorus',
      filename: 'chorus.wav',
      format: 'wav',
      bytes: 10,
      checksum: 'abc',
    });

    createJob(handle, 'job-1', {
      projectId,
      taskId: 'remix.repaint',
      modelId: 'ace_step_turbo_q8_0',
      params: {},
      inputs: [{ assetId, role: 'source' }],
    });

    // The lineage row is removed with the asset it points at, so the job cannot
    // say what it read any more. This is the cascade doing what it was told,
    // and it is why the panel reads an empty input list on a task that takes
    // audio as a deleted source rather than as a job that read nothing.
    deleteAsset(handle, assetId);

    expect(readJob(handle, 'job-1')?.inputs).toEqual([]);
  });

  it('lists the assets a job produced', () => {
    queue('job-1');
    insertAsset(handle, {
      id: 'take-1',
      projectId,
      kind: 'generated',
      label: 'synth pop',
      filename: 'synth pop.wav',
      format: 'wav',
      bytes: 10,
      checksum: 'abc',
      jobId: 'job-1',
    });

    expect(readJob(handle, 'job-1')?.outputAssetIds).toEqual(['take-1']);
  });

  it('lists a project newest first', () => {
    queue('job-1');
    queue('job-2');
    expect(listJobs(handle, projectId).map((job) => job.id)).toEqual(['job-2', 'job-1']);
  });
});

describe('nextQueuedJob', () => {
  it('takes the oldest queued job when nothing is resident', () => {
    queue('job-1');
    queue('job-2');
    expect(nextQueuedJob(handle)?.id).toBe('job-1');
  });

  it('prefers a job that needs the model already in memory', () => {
    queue('job-1', 'ace_step_turbo_q8_0');
    queue('job-2', 'stable_audio_3_small_music_q8_0');
    queue('job-3', 'stable_audio_3_small_music_q8_0');

    expect(nextQueuedJob(handle, 'stable_audio_3_small_music_q8_0')?.id).toBe('job-2');
  });

  it('falls back to the oldest when the resident model has nothing waiting', () => {
    queue('job-1', 'ace_step_turbo_q8_0');
    expect(nextQueuedJob(handle, 'htdemucs_q8_0')?.id).toBe('job-1');
  });

  it('skips jobs that are not queued', () => {
    queue('job-1');
    setJobState(handle, 'job-1', 'cancelled');
    expect(nextQueuedJob(handle)).toBeUndefined();
  });
});

describe('failInterruptedJobs', () => {
  it('fails what was in flight and leaves the rest alone', () => {
    queue('waiting');
    queue('staging');
    queue('running');
    queue('done');
    setJobState(handle, 'staging', 'staging');
    setJobState(handle, 'running', 'running');
    setJobState(handle, 'done', 'complete');

    expect(failInterruptedJobs(handle)).toBe(2);
    expect(readJob(handle, 'staging')?.state).toBe('failed');
    expect(readJob(handle, 'running')?.error).toMatch(/Miso stopped/);
    expect(readJob(handle, 'waiting')?.state).toBe('queued');
    expect(readJob(handle, 'done')?.state).toBe('complete');
  });
});

describe('staged uploads', () => {
  beforeEach(() => {
    insertAsset(handle, {
      id: 'asset-1',
      projectId,
      kind: 'source',
      label: 'Chorus',
      filename: 'chorus.wav',
      format: 'wav',
      bytes: 10,
      checksum: 'abc',
    });
  });

  it('remembers a path per backend', () => {
    recordStagedPath(handle, 'asset-1', 'http://one', '/tmp/a.wav');
    recordStagedPath(handle, 'asset-1', 'http://two', '/tmp/b.wav');

    expect(readStagedPath(handle, 'asset-1', 'http://one')).toBe('/tmp/a.wav');
    expect(readStagedPath(handle, 'asset-1', 'http://two')).toBe('/tmp/b.wav');
  });

  it('has nothing for an asset that was never staged', () => {
    expect(readStagedPath(handle, 'asset-1', 'http://one')).toBeUndefined();
  });

  it('forgets one path so the next job uploads again', () => {
    recordStagedPath(handle, 'asset-1', 'http://one', '/tmp/a.wav');
    forgetStagedPath(handle, 'asset-1', 'http://one');

    expect(readStagedPath(handle, 'asset-1', 'http://one')).toBeUndefined();
  });

  it('forgets a path on one backend without touching the other', () => {
    // A restart strands the paths on one server. The same asset staged to a
    // different address is still where it was said to be.
    recordStagedPath(handle, 'asset-1', 'http://one', '/tmp/a.wav');
    recordStagedPath(handle, 'asset-1', 'http://two', '/tmp/b.wav');

    forgetStagedPath(handle, 'asset-1', 'http://one');

    expect(readStagedPath(handle, 'asset-1', 'http://one')).toBeUndefined();
    expect(readStagedPath(handle, 'asset-1', 'http://two')).toBe('/tmp/b.wav');
  });

  it('forgetting something that was never staged is not an error', () => {
    expect(() => forgetStagedPath(handle, 'asset-1', 'http://one')).not.toThrow();
  });

  it('replaces a path when the same asset is staged again', () => {
    recordStagedPath(handle, 'asset-1', 'http://one', '/tmp/a.wav');
    recordStagedPath(handle, 'asset-1', 'http://one', '/tmp/c.wav');
    expect(readStagedPath(handle, 'asset-1', 'http://one')).toBe('/tmp/c.wav');
  });
});
