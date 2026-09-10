import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError, Project, ProjectDetail } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { projectRoutes } from './projects.ts';

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', projectRoutes);
  return instance;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

beforeEach(() => {
  db().prepare('DELETE FROM projects').run();
});

describe('POST /api/projects', () => {
  it('creates a project and answers with it', async () => {
    const response = await app().request('/api/projects', json({ name: 'Demo' }));
    expect(response.status).toBe(201);

    const body = (await response.json()) as Project;
    expect(body.name).toBe('Demo');
    expect(body.assetCount).toBe(0);
  });

  it('refuses a blank name', async () => {
    const response = await app().request('/api/projects', json({ name: '   ' }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/name/i);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await app().request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });

  it('allows two projects with the same name', async () => {
    await app().request('/api/projects', json({ name: 'demo' }));
    const second = await app().request('/api/projects', json({ name: 'demo' }));
    expect(second.status).toBe(201);
  });
});

describe('GET /api/projects', () => {
  it('lists projects newest first', async () => {
    await app().request('/api/projects', json({ name: 'One' }));
    await app().request('/api/projects', json({ name: 'Two' }));

    const body = (await (await app().request('/api/projects')).json()) as Project[];
    expect(body.map((p) => p.name)).toEqual(['Two', 'One']);
  });
});

describe('GET /api/projects/:id', () => {
  it('answers with the project and its assets', async () => {
    const created = (await (await app().request('/api/projects', json({ name: 'Demo' }))).json()) as Project;

    const response = await app().request(`/api/projects/${created.id}`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectDetail;
    expect(body.project.id).toBe(created.id);
    expect(body.assets).toEqual([]);
  });

  it('answers 404 for a project that does not exist', async () => {
    expect((await app().request('/api/projects/nope')).status).toBe(404);
  });
});

describe('PATCH /api/projects/:id', () => {
  it('renames a project', async () => {
    const created = (await (await app().request('/api/projects', json({ name: 'Old' }))).json()) as Project;

    const response = await app().request(`/api/projects/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Project).name).toBe('New');
  });

  it('answers 404 for a project that does not exist', async () => {
    const response = await app().request('/api/projects/nope', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('deletes the project and answers with the remaining list', async () => {
    const kept = (await (await app().request('/api/projects', json({ name: 'Keep' }))).json()) as Project;
    const gone = (await (await app().request('/api/projects', json({ name: 'Go' }))).json()) as Project;

    const response = await app().request(`/api/projects/${gone.id}`, { method: 'DELETE' });
    expect(response.status).toBe(200);

    const body = (await response.json()) as Project[];
    expect(body.map((p) => p.id)).toEqual([kept.id]);
  });

  it('answers 404 for a project that does not exist', async () => {
    expect((await app().request('/api/projects/nope', { method: 'DELETE' })).status).toBe(404);
  });
});
