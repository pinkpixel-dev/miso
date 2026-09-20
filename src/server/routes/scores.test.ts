import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError, ScoreArtifact } from '../../shared/types.ts';
import { insertAsset } from '../db/assets.ts';
import { db } from '../db/index.ts';
import { createProject } from '../db/projects.ts';
import { insertScoreArtifact } from '../db/scores.ts';
import { scoreRoutes } from './scores.ts';

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', scoreRoutes);
  return instance;
}

let projectId: string;

function take(id: string): string {
  insertAsset(db(), {
    id,
    projectId,
    kind: 'generated',
    label: id,
    filename: `${id}.wav`,
    format: 'wav',
    bytes: 1,
    checksum: 'x',
  });
  return id;
}

function score(id: string, assetId: string, label: string, abc: string): ScoreArtifact {
  return insertScoreArtifact(db(), {
    id,
    projectId,
    assetId,
    label,
    filename: `${label}.abc`,
    bytes: Buffer.byteLength(abc, 'utf8'),
    checksum: 'x',
    abc,
  });
}

beforeEach(() => {
  db().prepare('DELETE FROM score_artifacts').run();
  db().prepare('DELETE FROM assets').run();
  db().prepare('DELETE FROM projects').run();
  projectId = createProject(db(), 'Scores').id;
});

describe('the project score list', () => {
  it('answers with an empty list for a project that has never planned anything', async () => {
    const response = await app().request(`/api/projects/${projectId}/scores`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('carries the ABC itself, so the picker can fill the box without a second request', async () => {
    const abc = 'X:1\nM:4/4\nK:C\nc4c4g4g4|\n';
    score('s1', take('a1'), 'Night Drive', abc);

    const rows = (await (await app().request(`/api/projects/${projectId}/scores`)).json()) as ScoreArtifact[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 's1', label: 'Night Drive', abc, assetId: 'a1' });
  });

  it('lists the newest first', async () => {
    score('old', take('a1'), 'First', 'X:1');
    score('new', take('a2'), 'Second', 'X:1');

    const rows = (await (await app().request(`/api/projects/${projectId}/scores`)).json()) as ScoreArtifact[];

    expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('keeps one project out of another one', async () => {
    const other = createProject(db(), 'Elsewhere').id;
    score('mine', take('a1'), 'Mine', 'X:1');

    const rows = (await (await app().request(`/api/projects/${other}/scores`)).json()) as ScoreArtifact[];

    expect(rows).toEqual([]);
  });

  it('says so when the project does not exist, rather than answering with nothing', async () => {
    const response = await app().request('/api/projects/nope/scores');

    expect(response.status).toBe(404);
    expect(((await response.json()) as ApiError).error).toContain('nope');
  });

  it('loses a score when the take it planned is deleted', async () => {
    // The cascade in 010, checked rather than assumed: a plan for a song that
    // no longer exists means nothing, and a picker offering it would hand YuE2
    // the melody of a deleted take.
    score('s1', take('a1'), 'Night Drive', 'X:1');
    db().prepare('DELETE FROM assets WHERE id = ?').run('a1');

    const rows = (await (await app().request(`/api/projects/${projectId}/scores`)).json()) as ScoreArtifact[];

    expect(rows).toEqual([]);
  });
});
