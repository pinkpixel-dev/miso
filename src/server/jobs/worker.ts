import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { runTask, stageAudio } from '../audiocpp/client.ts';
import { readAsset } from '../db/assets.ts';
import { db } from '../db/index.ts';
import {
  failInterruptedJobs,
  listJobInputs,
  nextQueuedJob,
  readStagedPath,
  recordStagedPath,
  requeueJob,
  setJobState,
} from '../db/jobs.ts';
import { readSettings } from '../db/settings.ts';
import { assetPath } from '../library/storage.ts';
import { findTask, validateParams, type TaskDefinition } from '../tasks/registry.ts';
import { ensureLoaded, unload } from './residency.ts';
import { storeResult } from './results.ts';
import type { Job } from '../../shared/types.ts';

/**
 * One worker, one job at a time.
 *
 * There is nothing to gain from a second worker. audio.cpp answers a task
 * request synchronously and refuses a second one with a 503 while it is busy,
 * so concurrency here would only produce retries. The queue exists to make the
 * waiting orderly, not to overlap work.
 *
 * The loop is woken rather than polled. A job posted to the API calls wake(),
 * and the loop then drains everything it can reach before going quiet again.
 */

/** A busy backend is a state to wait out, but not forever. */
const MAX_BUSY_ATTEMPTS = 10;
const FIRST_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 2 * 60 * 1000;

let draining = false;

/** The package whose weights are in GPU memory, as far as this process knows. */
let resident: string | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Doubles from five seconds and stops at two minutes. */
function backoffFor(attempts: number): number {
  return Math.min(FIRST_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * What to call the take this job produces.
 *
 * The prompt is the most useful thing a person can recognize a take by, so its
 * first line becomes the name. A task with no prompt falls back to its own
 * label, which is still better than a bare id.
 */
function labelFor(job: Job, task: TaskDefinition): string {
  const prompt = job.params.prompt;
  if (typeof prompt === 'string' && prompt.trim() !== '') {
    const line = prompt.trim().split('\n')[0] ?? '';
    return line.length > 60 ? `${line.slice(0, 57)}...` : line;
  }
  return task.label;
}

/**
 * Uploads the assets a task reads, and reuses anything already up there.
 *
 * The recorded path is keyed by backend, so pointing Miso at a different
 * audio.cpp server stages afresh instead of sending a path that server has
 * never heard of.
 */
async function stageInputs(
  job: Job,
  task: TaskDefinition,
  baseUrl: string,
): Promise<{ ok: true; staged: Record<string, string> } | { ok: false; message: string }> {
  if (task.inputRoles.length === 0) return { ok: true, staged: {} };

  const inputs = listJobInputs(db(), job.id);
  const staged: Record<string, string> = {};

  for (const role of task.inputRoles) {
    const input = inputs.find((entry) => entry.role === role);
    if (!input) return { ok: false, message: `This job has no ${role} to work from.` };

    const cached = readStagedPath(db(), input.assetId, baseUrl);
    if (cached) {
      staged[role] = cached;
      continue;
    }

    const asset = readAsset(db(), input.assetId);
    if (!asset) return { ok: false, message: `The ${role} this job used is no longer in the library.` };

    const path = assetPath(asset.projectId, asset.id, asset.format);
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;

    const uploaded = await stageAudio(baseUrl, body, asset.filename);
    if (!uploaded.ok) return { ok: false, message: uploaded.message };

    recordStagedPath(db(), input.assetId, baseUrl, uploaded.value);
    staged[role] = uploaded.value;
  }

  return { ok: true, staged };
}

/**
 * Runs one job to a terminal state, or puts it back in the queue.
 *
 * Returns how long to wait before looking at the queue again. Zero means carry
 * straight on, which is every case except a backend that said it was busy.
 */
async function runOne(job: Job): Promise<number> {
  const task = findTask(job.taskId);
  if (!task) {
    setJobState(db(), job.id, 'failed', `This build of Miso has no task called ${job.taskId}.`);
    return 0;
  }

  // The row is validated again rather than trusted. It was written by this
  // service, but it was written by whichever version of it was running then,
  // and a task's fields can change between releases.
  const params = validateParams(task, job.params);
  if (!params.ok) {
    setJobState(db(), job.id, 'failed', `These parameters are no longer valid: ${params.error}`);
    return 0;
  }

  const baseUrl = readSettings().backendUrl;

  // Staging covers everything that has to be true before the model can start:
  // the source audio is on the backend, and the weights are in memory. Both can
  // take a while and both fail for reasons worth naming separately from a
  // failed generation.
  setJobState(db(), job.id, 'staging');

  const staged = await stageInputs(job, task, baseUrl);
  if (!staged.ok) {
    setJobState(db(), job.id, 'failed', staged.message);
    return 0;
  }

  const loaded = await ensureLoaded(baseUrl, task, job.modelId);
  if (!loaded.ok) {
    setJobState(db(), job.id, 'failed', loaded.message);
    return 0;
  }
  resident = job.modelId;

  setJobState(db(), job.id, 'running');

  const result = await runTask(baseUrl, `miso:${job.modelId}`, task.buildRequest(params.value, staged.staged));

  if (!result.ok) {
    if (result.reason === 'busy') {
      if (job.attempts + 1 >= MAX_BUSY_ATTEMPTS) {
        setJobState(
          db(),
          job.id,
          'failed',
          'The backend stayed busy through every retry, so this job was given up on.',
        );
        return 0;
      }
      requeueJob(db(), job.id);
      return backoffFor(job.attempts);
    }

    setJobState(db(), job.id, 'failed', result.message);
    return 0;
  }

  try {
    await storeResult(db(), { projectId: job.projectId, jobId: job.id, label: labelFor(job, task) }, result.value);
    setJobState(db(), job.id, 'complete');
  } catch (error) {
    setJobState(
      db(),
      job.id,
      'failed',
      error instanceof Error ? error.message : 'The result could not be saved',
    );
  }

  return 0;
}

/**
 * Works through the queue until it is empty.
 *
 * Weights are freed only when the next job needs different ones. Leaving a
 * model resident after the last job is deliberate: the next prompt on the same
 * model then starts immediately, and Settings has an unload for when the card
 * is wanted back.
 */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    for (;;) {
      const job = nextQueuedJob(db(), resident);
      if (!job) break;

      if (resident !== undefined && resident !== job.modelId) {
        await unload(readSettings().backendUrl, resident);
        resident = undefined;
      }

      const wait = await runOne(job);
      if (wait > 0) await sleep(wait);
    }
  } catch (error) {
    // A throw here would take the loop down and leave every queued job stuck.
    // Logging and stopping means the next wake() tries again.
    console.error('[jobs] the queue stopped unexpectedly', error);
  } finally {
    draining = false;
  }
}

/** Starts the queue if it is not already working. Safe to call on every new job. */
export function wake(): void {
  void drain();
}

/**
 * Clears out jobs the previous process was in the middle of, then starts.
 *
 * Called once at startup. Anything left staging or running belongs to a process
 * that is gone, and no result is coming back for it.
 */
export function startWorker(): void {
  const interrupted = failInterruptedJobs(db());
  if (interrupted > 0) {
    console.log(`[jobs] failed ${interrupted} job(s) interrupted by a restart`);
  }
  wake();
}
