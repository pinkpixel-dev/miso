import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError, Job, StudioTask } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { setJobState } from '../db/jobs.ts';
import { createProject } from '../db/projects.ts';
import { jobRoutes } from './jobs.ts';

// The worker is not under test here, and waking it would have the route reach
// for a backend that does not exist in a test run.
vi.mock('../jobs/worker.ts', () => ({ wake: () => undefined }));

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', jobRoutes);
  return instance;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

let projectId: string;

beforeEach(() => {
  db().prepare('DELETE FROM projects').run();
  projectId = createProject(db(), 'Demo').id;
});

const good = {
  taskId: 'generate.text2music',
  modelId: 'ace_step_turbo_q8_0',
  params: { prompt: 'synth pop with a clear vocal' },
};

describe('GET /api/tasks', () => {
  it('describes each task and its fields', async () => {
    const response = await app().request('/api/tasks');
    const tasks = (await response.json()) as StudioTask[];

    const generate = tasks.find((task) => task.id === 'generate.text2music');
    expect(generate?.family).toBe('ace_step');
    expect(generate?.fields.find((field) => field.name === 'prompt')?.required).toBe(true);
  });
});

describe('POST /api/projects/:id/jobs', () => {
  it('queues a job and answers with it', async () => {
    const response = await app().request(`/api/projects/${projectId}/jobs`, json(good));
    expect(response.status).toBe(201);

    const job = (await response.json()) as Job;
    expect(job.state).toBe('queued');
    expect(job.params.durationSeconds).toBe(180);
  });

  it('refuses a task this build does not have', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, taskId: 'generate.nothing' }),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a model from the wrong family and says which family is needed', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, modelId: 'htdemucs_q8_0' }),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).detail).toMatch(/ace_step/);
  });

  it('refuses a job with no prompt', async () => {
    const response = await app().request(`/api/projects/${projectId}/jobs`, json({ ...good, params: {} }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/prompt/i);
  });

  it('refuses a project that does not exist', async () => {
    const response = await app().request('/api/projects/nope/jobs', json(good));
    expect(response.status).toBe(404);
  });

  it('refuses an input with no role', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, inputs: [{ assetId: 'a' }] }),
    );
    expect(response.status).toBe(400);
  });

  it('keeps the song title and the builder state beside the job', async () => {
    const studio = {
      style: 'synthwave, warm analogue tape',
      mood: 'dreamy',
      vocalStyle: 'airy',
      vocalMode: 'female',
    };

    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, title: '  Midnight Drive  ', studio }),
    );
    expect(response.status).toBe(201);

    const created = (await response.json()) as Job;
    expect(created.title).toBe('Midnight Drive');
    expect(created.studio).toEqual(studio);

    // And it survives the round trip through the row rather than only the
    // response the route happened to build.
    const listed = (await (await app().request(`/api/projects/${projectId}/jobs`)).json()) as Job[];
    expect(listed[0]?.title).toBe('Midnight Drive');
    expect(listed[0]?.studio).toEqual(studio);
  });

  it('accepts the builder state the chip builder wrote and answers in the new shape', async () => {
    // The body the old builder posted, and the shape rows in existing
    // databases still hold. Both have to keep working, which is what let the
    // boxes replace the chips without a data migration.
    const legacy = {
      genre: ['Synthwave', 'Lo-Fi'],
      mood: ['Dreamy'],
      customStyle: 'warm analogue tape',
      vocalStyle: 'airy',
      vocalMode: 'female',
    };

    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, studio: legacy }),
    );
    expect(response.status).toBe(201);

    const expected = {
      style: 'Synthwave, Lo-Fi, warm analogue tape',
      mood: 'Dreamy',
      vocalStyle: 'airy',
      vocalMode: 'female',
    };

    const created = (await response.json()) as Job;
    expect(created.studio).toEqual(expected);

    // Read back off the row as well, because that is the path the take detail
    // panel takes and it normalises separately from the write.
    const listed = (await (await app().request(`/api/projects/${projectId}/jobs`)).json()) as Job[];
    expect(listed[0]?.studio).toEqual(expected);
  });

  it('queues a job written from the plain form, with neither of them', async () => {
    const response = await app().request(`/api/projects/${projectId}/jobs`, json(good));
    const job = (await response.json()) as Job;

    expect(job.title).toBeUndefined();
    expect(job.studio).toBeUndefined();
  });

  it('refuses a builder state it cannot trust', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, studio: { vocalMode: 'robot' } }),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/vocal mode/i);
  });

  it('refuses a title longer than a track name', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, title: 'x'.repeat(200) }),
    );
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/projects/:id/jobs/:jobId', () => {
  async function queue(): Promise<Job> {
    const response = await app().request(`/api/projects/${projectId}/jobs`, json(good));
    return (await response.json()) as Job;
  }

  it('cancels a job that has not started', async () => {
    const job = await queue();
    const response = await app().request(`/api/projects/${projectId}/jobs/${job.id}`, { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Job).state).toBe('cancelled');
  });

  it('refuses to cancel a running job and explains why', async () => {
    const job = await queue();
    setJobState(db(), job.id, 'running');

    const response = await app().request(`/api/projects/${projectId}/jobs/${job.id}`, { method: 'DELETE' });
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiError).detail).toMatch(/cannot be interrupted/i);
  });

  it('refuses a job from another project', async () => {
    const job = await queue();
    const other = createProject(db(), 'Other').id;

    const response = await app().request(`/api/projects/${other}/jobs/${job.id}`, { method: 'DELETE' });
    expect(response.status).toBe(404);
  });
});

describe('GET /api/projects/:id/jobs', () => {
  it('lists this project only', async () => {
    await app().request(`/api/projects/${projectId}/jobs`, json(good));
    const other = createProject(db(), 'Other').id;

    const response = await app().request(`/api/projects/${other}/jobs`);
    expect((await response.json()) as Job[]).toEqual([]);
  });
});
