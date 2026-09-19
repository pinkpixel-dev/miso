import type { Database } from 'better-sqlite3';
import type { Job, JobState, StudioState } from '../../shared/types.ts';
import { parseStudioState } from '../jobs/studioState.ts';

/**
 * Job rows, their lineage links, and the record of what Miso has staged to a
 * backend.
 *
 * Every function takes the handle rather than reaching for the singleton, so
 * tests run against an in-memory database. This matches db/projects.ts.
 *
 * Params are stored as JSON text. They are written once by the task registry
 * and read back whole, never queried on, so columns per parameter would mean a
 * migration every time a task gains an option.
 */

interface Record_ {
  id: string;
  project_id: string;
  task_id: string;
  model_id: string;
  params: string;
  title: string | null;
  studio: string | null;
  original_prompt: string | null;
  state: string;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  dismissed_at: string | null;
}

export interface NewJob {
  projectId: string;
  taskId: string;
  modelId: string;
  params: Record<string, unknown>;
  /** What the person called the song, if they named it. */
  title?: string;
  /** The guided builder's own state, absent when the plain form wrote the job. */
  studio?: StudioState;
  /** What the person wrote, when an expansion of it is what ran. */
  originalPrompt?: string;
  /** Assets this job reads, by the role the task gives them. */
  inputs?: { assetId: string; role: string }[];
  /**
   * The state to start in. Queued unless said otherwise.
   *
   * Complete is for work the service did itself and has already finished, which
   * today means recombining stems. Such a job must never be queued: the worker
   * drains the queue and would hand it to audio.cpp, which has no route for it
   * and would fail a job whose output already exists.
   */
  state?: 'queued' | 'complete';
}

export function listJobInputs(handle: Database, jobId: string): { assetId: string; role: string }[] {
  const rows = handle
    .prepare('SELECT asset_id, role FROM asset_lineage WHERE job_id = ? ORDER BY role')
    .all(jobId) as { asset_id: string; role: string }[];
  return rows.map((row) => ({ assetId: row.asset_id, role: row.role }));
}

/** A job row on its own is not the whole job. What it read and what
 * it wrote both come from other tables. */
function toJob(handle: Database, record: Record_): Job {
  const outputs = handle
    .prepare('SELECT id FROM assets WHERE job_id = ? ORDER BY created_at, rowid')
    .all(record.id) as { id: string }[];

  let params: Record<string, unknown>;
  try {
    params = JSON.parse(record.params) as Record<string, unknown>;
  } catch {
    // A row whose params are not JSON can still be shown and still has a
    // result. Losing the parameters is better than losing the job.
    params = {};
  }

  // Same reasoning for the builder state, one step further: a job without it
  // simply opens in the plain form instead of the builder.
  //
  // It goes back through the parser rather than being cast, because a row the
  // chip builder wrote holds lists where the builder now wants strings, and the
  // take detail panel reads these rows straight back.
  let studio: StudioState | undefined;
  if (record.studio !== null) {
    try {
      const parsed = parseStudioState(JSON.parse(record.studio));
      studio = parsed.ok ? parsed.value : undefined;
    } catch {
      studio = undefined;
    }
  }

  return {
    id: record.id,
    projectId: record.project_id,
    taskId: record.task_id,
    modelId: record.model_id,
    params,
    title: record.title ?? undefined,
    studio,
    originalPrompt: record.original_prompt ?? undefined,
    state: record.state as JobState,
    error: record.error ?? undefined,
    attempts: record.attempts,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    startedAt: record.started_at ?? undefined,
    finishedAt: record.finished_at ?? undefined,
    dismissedAt: record.dismissed_at ?? undefined,
    outputAssetIds: outputs.map((row) => row.id),
    inputs: listJobInputs(handle, record.id),
  };
}

export function readJob(handle: Database, id: string): Job | undefined {
  const record = handle.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record_ | undefined;
  return record ? toJob(handle, record) : undefined;
}

export function listJobs(handle: Database, projectId: string): Job[] {
  const records = handle
    .prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(projectId) as Record_[];
  return records.map((record) => toJob(handle, record));
}

/**
 * Hides every finished job in a project, and answers with how many moved.
 *
 * This is what clearing the queue does. Anything still queued, staging or
 * running is left alone: hiding work that has not happened yet would take the
 * only progress report off the screen.
 *
 * Nothing is deleted, deliberately. The row is the only record of the prompt,
 * the lyrics and the settings behind a take, and the take detail panel reads it
 * back. A row already hidden is not touched again, so the timestamp keeps
 * saying when the queue was first cleared past it.
 */
export function dismissFinishedJobs(handle: Database, projectId: string): number {
  const result = handle
    .prepare(
      `UPDATE jobs SET dismissed_at = datetime('now')
       WHERE project_id = ? AND dismissed_at IS NULL
         AND state IN ('complete','failed','cancelled')`,
    )
    .run(projectId);
  return result.changes;
}

/** Every job still waiting or in flight, across all projects, oldest first. */
export function listPendingJobs(handle: Database): Job[] {
  const records = handle
    .prepare(
      `SELECT * FROM jobs WHERE state IN ('queued','staging','running')
       ORDER BY created_at, rowid`,
    )
    .all() as Record_[];
  return records.map((record) => toJob(handle, record));
}

export function createJob(handle: Database, id: string, input: NewJob): Job {
  handle.transaction(() => {
    const state = input.state ?? 'queued';

    handle
      .prepare(
        `INSERT INTO jobs (id, project_id, task_id, model_id, params, title, studio, original_prompt, state,
                           started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? = 'complete' THEN datetime('now') END,
                 CASE WHEN ? = 'complete' THEN datetime('now') END)`,
      )
      .run(
        id,
        input.projectId,
        input.taskId,
        input.modelId,
        JSON.stringify(input.params),
        input.title ?? null,
        input.studio === undefined ? null : JSON.stringify(input.studio),
        input.originalPrompt ?? null,
        state,
        state,
        state,
      );

    const link = handle.prepare('INSERT INTO asset_lineage (job_id, asset_id, role) VALUES (?, ?, ?)');
    for (const input_ of input.inputs ?? []) link.run(id, input_.assetId, input_.role);
  })();

  const job = readJob(handle, id);
  if (!job) throw new Error(`Job ${id} vanished immediately after being created`);
  return job;
}

/**
 * Moves a job to a new state.
 *
 * started_at is stamped the first time a job leaves the queue, and finished_at
 * when it reaches a terminal state. Both are written here rather than by each
 * caller, so no path can forget one and leave the elapsed time unreadable.
 */
export function setJobState(
  handle: Database,
  id: string,
  state: JobState,
  error?: string,
): Job | undefined {
  const starting = state === 'staging' || state === 'running';
  const finishing = state === 'complete' || state === 'failed' || state === 'cancelled';

  const result = handle
    .prepare(
      `UPDATE jobs
         SET state = ?,
             error = ?,
             updated_at = datetime('now'),
             started_at = CASE WHEN ? AND started_at IS NULL THEN datetime('now') ELSE started_at END,
             finished_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
       WHERE id = ?`,
    )
    .run(state, error ?? null, starting ? 1 : 0, finishing ? 1 : 0, id);

  return result.changes === 0 ? undefined : readJob(handle, id);
}

/** Puts a job back in the queue after a busy backend refused it. */
export function requeueJob(handle: Database, id: string): Job | undefined {
  const result = handle
    .prepare(
      `UPDATE jobs
         SET state = 'queued', attempts = attempts + 1, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(id);

  return result.changes === 0 ? undefined : readJob(handle, id);
}


/**
 * What Miso has already uploaded to a given backend.
 *
 * Keyed by asset and backend because the same library can be pointed at a
 * different audio.cpp server, and a path from the old one means nothing to the
 * new one. This is what stops eight prompts on the same chorus from uploading
 * that chorus eight times.
 */
export function readStagedPath(
  handle: Database,
  assetId: string,
  serverIdentity: string,
): string | undefined {
  const row = handle
    .prepare('SELECT remote_path FROM staged_uploads WHERE asset_id = ? AND server_identity = ?')
    .get(assetId, serverIdentity) as { remote_path: string } | undefined;
  return row?.remote_path;
}

export function recordStagedPath(
  handle: Database,
  assetId: string,
  serverIdentity: string,
  remotePath: string,
): void {
  handle
    .prepare(
      `INSERT INTO staged_uploads (asset_id, server_identity, remote_path)
       VALUES (?, ?, ?)
       ON CONFLICT (asset_id, server_identity)
       DO UPDATE SET remote_path = excluded.remote_path, created_at = datetime('now')`,
    )
    .run(assetId, serverIdentity, remotePath);
}

/**
 * The next job to run, preferring one that needs the model already in memory.
 *
 * This is the whole of the reordering: a queue of six jobs across two models
 * runs as two groups rather than six weight loads. Order inside a group stays
 * the order they were asked for, so nothing waits forever as long as new jobs
 * for the resident model stop arriving.
 */
export function nextQueuedJob(handle: Database, preferModelId?: string): Job | undefined {
  if (preferModelId !== undefined) {
    const preferred = handle
      .prepare(`SELECT * FROM jobs WHERE state = 'queued' AND model_id = ? ORDER BY created_at, rowid LIMIT 1`)
      .get(preferModelId) as Record_ | undefined;
    if (preferred) return toJob(handle, preferred);
  }

  const record = handle
    .prepare(`SELECT * FROM jobs WHERE state = 'queued' ORDER BY created_at, rowid LIMIT 1`)
    .get() as Record_ | undefined;

  return record ? toJob(handle, record) : undefined;
}

/**
 * Fails every job that was mid-flight when the service stopped.
 *
 * A generation that was running belongs to an HTTP request this process no
 * longer has, and audio.cpp has no way to hand it back. Saying so is better
 * than leaving a job that will never move again.
 */
export function failInterruptedJobs(handle: Database): number {
  return handle
    .prepare(
      `UPDATE jobs
         SET state = 'failed',
             error = 'Miso stopped while this job was running, so its result was lost.',
             updated_at = datetime('now'),
             finished_at = datetime('now')
       WHERE state IN ('staging','running')`,
    )
    .run().changes;
}
