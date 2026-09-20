import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageUsage } from '../../shared/types.ts';
import { insertAsset } from '../db/assets.ts';
import { db } from '../db/index.ts';
import { createProject } from '../db/projects.ts';
import { storageRoutes, summarizeModels } from './storage.ts';

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', storageRoutes);
  return instance;
}

beforeEach(() => {
  db().prepare('DELETE FROM projects').run();
});

function add(projectId: string, id: string, bytes: number): void {
  insertAsset(db(), {
    id,
    projectId,
    kind: 'source',
    label: id,
    filename: `${id}.wav`,
    format: 'wav',
    bytes,
    checksum: 'abc',
  });
}

describe('GET /api/storage', () => {
  it('reports zero when there is nothing stored', async () => {
    const body = (await (await app().request('/api/storage')).json()) as StorageUsage;
    expect(body.totalBytes).toBe(0);
    expect(body.projects).toEqual([]);
  });

  it('totals every project and reports each one', async () => {
    const one = createProject(db(), 'One').id;
    const two = createProject(db(), 'Two').id;
    add(one, 'a1', 100);
    add(one, 'a2', 250);
    add(two, 'a3', 400);

    const body = (await (await app().request('/api/storage')).json()) as StorageUsage;

    expect(body.totalBytes).toBe(750);
    expect(body.projects).toHaveLength(2);
    expect(body.projects.find((p) => p.id === one)?.bytes).toBe(350);
    expect(body.projects.find((p) => p.id === two)?.bytes).toBe(400);
  });

  it('includes a project holding nothing', async () => {
    createProject(db(), 'Empty');
    const body = (await (await app().request('/api/storage')).json()) as StorageUsage;
    expect(body.projects).toHaveLength(1);
    expect(body.totalBytes).toBe(0);
  });

  it('always answers about models, whatever the backend is doing', async () => {
    // Deliberately not asserting which one. This route asks a real backend, and
    // whether one is listening on the configured address depends on what the
    // person running the tests happens to have started. What must hold either
    // way is that the field is there and says one of the three things it can
    // say, so the panel never has to guess.
    const body = (await (await app().request('/api/storage')).json()) as StorageUsage;
    expect(['ready', 'scanning', 'unavailable']).toContain(body.models.kind);
  });
});

describe('what the installed weights add up to', () => {
  it('counts only what is installed', () => {
    const summary = summarizeModels([
      { bytes: 1000, installed: true },
      { bytes: 9999, installed: false },
    ]);

    expect(summary).toEqual({ kind: 'ready', bytes: 1000, count: 1 });
  });

  it('still counts a package the backend could not size', () => {
    // Dropping it would under-report the number of things taking up space.
    const summary = summarizeModels([
      { bytes: 1000, installed: true },
      { bytes: undefined, installed: true },
    ]);

    expect(summary).toEqual({ kind: 'ready', bytes: 1000, count: 2 });
  });

  it('is zero when nothing is installed', () => {
    expect(summarizeModels([{ bytes: 500, installed: false }])).toEqual({
      kind: 'ready',
      bytes: 0,
      count: 0,
    });
  });
});
