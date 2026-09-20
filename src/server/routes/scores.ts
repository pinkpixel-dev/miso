import { Hono } from 'hono';
import type { ApiError, ScoreArtifact } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { readProject } from '../db/projects.ts';
import { listScoreArtifacts } from '../db/scores.ts';

/**
 * Scores, at /api/projects/:id/scores.
 *
 * One route, and a small one, because a score already had everywhere else it
 * needed to be. Downloading one hangs off its take in `assets.ts`, since that
 * is the question a take answers, and storing one is the worker's job. What
 * was missing is the project-wide list, which the create form's score picker
 * reads to offer a score YuE2 wrote earlier as the plan for a new song.
 *
 * There is no POST and no DELETE. A score arrives with the take it planned and
 * leaves with it, which 010 sets up as a cascade rather than something this
 * file has to remember.
 */
export const scoreRoutes = new Hono();

scoreRoutes.get('/projects/:id/scores', (c) => {
  const projectId = c.req.param('id');
  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  return c.json<ScoreArtifact[]>(listScoreArtifacts(db(), projectId));
});
