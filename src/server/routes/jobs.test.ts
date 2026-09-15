import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError, Job, StudioTask } from '../../shared/types.ts';
import { insertAsset } from '../db/assets.ts';
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

  /**
   * The create column tells a generation task from a remix one by this field
   * alone. Without it on the wire, every remix route shows up in the model
   * list as another model to generate with, because they share a family and
   * draw their fields the same way.
   */
  it('says which tasks read a source track', async () => {
    const response = await app().request('/api/tasks');
    const tasks = (await response.json()) as StudioTask[];

    expect(tasks.find((task) => task.id === 'generate.text2music')?.inputRoles).toEqual([]);
    expect(tasks.find((task) => task.id === 'remix.repaint')?.inputRoles).toEqual(['source']);
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

  it('refuses an input asset that does not exist', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...good, inputs: [{ assetId: randomUUID(), role: 'source' }] }),
    );
    expect(response.status).toBe(404);
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

describe('a job that reads a source track', () => {
  /** A take in a project, long enough to have a middle worth repainting. */
  function take(owner: string, seconds = 20) {
    return insertAsset(db(), {
      id: randomUUID(),
      projectId: owner,
      kind: 'generated',
      label: 'Take 1',
      filename: 'take-1.wav',
      format: 'wav',
      bytes: 1000,
      checksum: 'abc123',
      durationSeconds: seconds,
    });
  }

  const repaint = {
    taskId: 'remix.repaint',
    modelId: 'ace_step_turbo_q8_0',
    params: { prompt: 'a brighter chorus', regionStart: 5, regionEnd: 10 },
  };

  it('queues a repaint and records what it reads', async () => {
    const source = take(projectId);
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...repaint, inputs: [{ assetId: source.id, role: 'source' }] }),
    );

    expect(response.status).toBe(201);
    const job = (await response.json()) as Job;
    expect(job.state).toBe('queued');
    expect(job.params).toMatchObject({ regionStart: 5, regionEnd: 10, strength: 0.5 });
  });

  /**
   * The check that matters most here. Without it a job could name a track from
   * somebody else's project and have the worker stage it to the backend.
   */
  it('refuses a track belonging to another project', async () => {
    const other = createProject(db(), 'Someone else').id;
    const borrowed = take(other);

    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({ ...repaint, inputs: [{ assetId: borrowed.id, role: 'source' }] }),
    );

    expect(response.status).toBe(404);
    // Same answer as a track that does not exist, so a guessed id is not
    // confirmed to be real.
    expect(((await response.json()) as ApiError).error).toMatch(/no track with the id/i);
  });

  it('refuses a repaint with no source named', async () => {
    const response = await app().request(`/api/projects/${projectId}/jobs`, json(repaint));

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/needs a source track/i);
  });

  it('refuses a region that runs past the end of the source', async () => {
    const source = take(projectId, 12);
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({
        ...repaint,
        params: { ...repaint.params, regionStart: 8, regionEnd: 30 },
        inputs: [{ assetId: source.id, role: 'source' }],
      }),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/past the end/i);
  });

  it('refuses an inverted region before it reaches the queue', async () => {
    const source = take(projectId);
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({
        ...repaint,
        params: { ...repaint.params, regionStart: 10, regionEnd: 5 },
        inputs: [{ assetId: source.id, role: 'source' }],
      }),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/end after it starts/i);
  });

  /**
   * The region guard reads `regionEnd` off the validated params by name, so a
   * task carrying no region has to fall straight through it. Repaint was the
   * only remix task when that was written, which made it an assumption rather
   * than a tested rule. Cover is the first task to check it, and the source
   * here is three seconds long, shorter than any region repaint would accept,
   * so a guard that ran anyway would have something to complain about.
   */
  it('lets a remix task with no region past the region guard', async () => {
    const source = take(projectId, 3);
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({
        taskId: 'remix.cover',
        modelId: 'ace_step_turbo_q8_0',
        params: { prompt: 'a softer acoustic version' },
        inputs: [{ assetId: source.id, role: 'source' }],
      }),
    );

    expect(response.status).toBe(201);
    const job = (await response.json()) as Job;
    expect(job.taskId).toBe('remix.cover');
    expect(job.state).toBe('queued');
  });

  it('still needs a source for a cover, the same as a repaint', async () => {
    const response = await app().request(
      `/api/projects/${projectId}/jobs`,
      json({
        taskId: 'remix.cover',
        modelId: 'ace_step_turbo_q8_0',
        params: { prompt: 'a softer acoustic version' },
      }),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/needs a source track/i);
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
