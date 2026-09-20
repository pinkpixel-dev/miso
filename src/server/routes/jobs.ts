import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { ApiError, Asset, Job, StudioTask } from '../../shared/types.ts';
import { findPackage } from '../catalog/registry.ts';
import { readAsset } from '../db/assets.ts';
import { db } from '../db/index.ts';
import { createJob, dismissFinishedJobs, listJobs, readJob, setJobState } from '../db/jobs.ts';
import { readProject } from '../db/projects.ts';
import { readSettings } from '../db/settings.ts';
import { unloadAll } from '../jobs/residency.ts';
import { parseOriginalPrompt, parseStudioState, parseTitle } from '../jobs/studioState.ts';
import { wake } from '../jobs/worker.ts';
import {
  familiesOf,
  familyList,
  findTask,
  listTasks,
  packageRunsTask,
  taskPackageIds,
  validateParams,
} from '../tasks/registry.ts';

/**
 * Tasks and jobs.
 *
 * Posting a job never waits for it. The response is the queued row, and the
 * studio watches the list from there. A generation runs for minutes, so an
 * endpoint that answered with the finished track would be a request nobody can
 * keep open on a phone.
 */
export const jobRoutes = new Hono();

jobRoutes.get('/tasks', (c) =>
  c.json<StudioTask[]>(
    listTasks().map((task) => ({
      id: task.id,
      guidedPrompt: task.guidedPrompt ?? true,
      surface: task.surface,
      label: task.label,
      shortLabel: task.shortLabel,
      summary: task.summary,
      families: familiesOf(task),
      vocals: task.vocals,
      packageIds: taskPackageIds(task),
      inputRoles: task.inputRoles,
      fields: task.fields,
    })),
  ),
);

jobRoutes.get('/projects/:id/jobs', (c) => {
  const projectId = c.req.param('id');
  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }
  return c.json<Job[]>(listJobs(db(), projectId));
});

jobRoutes.post('/projects/:id/jobs', async (c) => {
  const projectId = c.req.param('id');
  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);
  }

  const { taskId, modelId, params, title, studio, originalPrompt, inputs } = (body ?? {}) as {
    taskId?: unknown;
    modelId?: unknown;
    params?: unknown;
    title?: unknown;
    studio?: unknown;
    originalPrompt?: unknown;
    inputs?: unknown;
  };

  if (typeof taskId !== 'string') return c.json<ApiError>({ error: 'taskId is required' }, 400);
  const task = findTask(taskId);
  if (!task) return c.json<ApiError>({ error: `Miso has no task called ${taskId}` }, 400);

  if (typeof modelId !== 'string') return c.json<ApiError>({ error: 'modelId is required' }, 400);
  if (!findPackage(modelId)) {
    return c.json<ApiError>({ error: `Miso has no model package called ${modelId}` }, 400);
  }
  if (!packageRunsTask(task, modelId)) {
    return c.json<ApiError>(
      {
        error: `${modelId} cannot run ${task.label}`,
        detail: `${task.label} needs a ${familyList(task)} model.`,
      },
      400,
    );
  }

  const validated = validateParams(task, params ?? {});
  if (!validated.ok) return c.json<ApiError>({ error: validated.error }, 400);

  const songTitle = parseTitle(title);
  if (!songTitle.ok) return c.json<ApiError>({ error: songTitle.error }, 400);

  const studioState = parseStudioState(studio);
  if (!studioState.ok) return c.json<ApiError>({ error: studioState.error }, 400);

  // The prompt before the assistant expanded it. Recorded only when it differs
  // from what actually ran, because a job that stored the same text twice would
  // claim an enhancement that never happened.
  const written = parseOriginalPrompt(originalPrompt, validated.value.prompt);
  if (!written.ok) return c.json<ApiError>({ error: written.error }, 400);

  // Input assets have to exist and belong to this project. Without the second
  // check a job could name a track from someone else's project and stage it to
  // the backend.
  const wanted = Array.isArray(inputs) ? inputs : [];
  const links: { assetId: string; role: string }[] = [];
  const sources = new Map<string, Asset>();
  for (const entry of wanted) {
    const { assetId, role } = (entry ?? {}) as { assetId?: unknown; role?: unknown };
    if (typeof assetId !== 'string' || typeof role !== 'string') {
      return c.json<ApiError>({ error: 'Every input needs an assetId and a role' }, 400);
    }

    const asset = readAsset(db(), assetId);
    // One answer for a missing track and for one in somebody else's project.
    // Telling them apart would confirm that an id they guessed exists.
    if (!asset || asset.projectId !== projectId) {
      return c.json<ApiError>({ error: `This project has no track with the id ${assetId}` }, 404);
    }

    links.push({ assetId, role });
    sources.set(role, asset);
  }

  // A task that reads audio needs the audio named now. Left to the worker this
  // surfaces as a job that queues, reaches staging, and only then says it had
  // nothing to work from.
  for (const role of task.inputRoles) {
    if (sources.has(role)) continue;
    return c.json<ApiError>(
      {
        error: `${task.label} needs a ${role} track to work from`,
        detail: 'Choose a take to work from and try again.',
      },
      400,
    );
  }

  // The registry validates params without ever seeing an asset row, so this is
  // the only place that knows how long the source actually runs. A region past
  // the end would queue, load weights, and hold the GPU before failing.
  const source = sources.get('source');
  const regionEnd = validated.value.regionEnd;
  if (source?.durationSeconds !== undefined && typeof regionEnd === 'number') {
    if (regionEnd > source.durationSeconds) {
      return c.json<ApiError>(
        {
          error: 'That region runs past the end of the track',
          detail: `${source.label} is ${source.durationSeconds.toFixed(1)} seconds long.`,
        },
        400,
      );
    }
  }

  const job = createJob(db(), randomUUID(), {
    projectId,
    taskId: task.id,
    modelId,
    params: validated.value,
    title: songTitle.value,
    studio: studioState.value,
    originalPrompt: written.value,
    inputs: links,
  });

  wake();

  return c.json<Job>(job, 201);
});

/**
 * Cancels a job that has not started.
 *
 * A running job is left alone and says so. A GPU call in flight cannot be
 * interrupted from outside the process running it, and a cancel button that
 * quietly did nothing would be worse than one that explains itself.
 */
jobRoutes.delete('/projects/:id/jobs/:jobId', (c) => {
  const projectId = c.req.param('id');
  const jobId = c.req.param('jobId');

  const job = readJob(db(), jobId);
  if (!job || job.projectId !== projectId) {
    return c.json<ApiError>({ error: `No job with the id ${jobId}` }, 404);
  }

  if (job.state !== 'queued') {
    return c.json<ApiError>(
      {
        error: 'This job cannot be cancelled',
        detail:
          job.state === 'staging' || job.state === 'running'
            ? 'It has already started, and a running generation cannot be interrupted.'
            : `It already ${job.state === 'complete' ? 'finished' : job.state}.`,
      },
      409,
    );
  }

  const cancelled = setJobState(db(), jobId, 'cancelled');
  return c.json<Job>(cancelled ?? job);
});

/**
 * Clears the queue.
 *
 * Finished work is hidden rather than deleted, so this answers with the whole
 * list including what it just hid. The client filters on the timestamp, which
 * keeps one shape of job row everywhere and leaves the take detail panel able
 * to read a cleared job's prompt.
 */
jobRoutes.post('/projects/:id/jobs/dismiss', (c) => {
  const projectId = c.req.param('id');
  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  dismissFinishedJobs(db(), projectId);
  return c.json<Job[]>(listJobs(db(), projectId));
});

/** Frees the GPU without stopping the service, for when the card is wanted elsewhere. */
jobRoutes.post('/backend/unload', async (c) => {
  const result = await unloadAll(readSettings().backendUrl);
  if (!result.ok) {
    return c.json<ApiError>({ error: 'The models could not be unloaded', detail: result.message }, 502);
  }
  return c.json({ unloaded: true });
});
