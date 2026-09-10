import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ApiError, Project, ProjectDetail } from '../../shared/types.ts';
import { listAssets } from '../db/assets.ts';
import { db } from '../db/index.ts';
import {
  createProject,
  deleteProject,
  listProjects,
  readProject,
  renameProject,
} from '../db/projects.ts';
import { removeProjectDir } from '../library/storage.ts';

/**
 * Projects.
 *
 * A mutation answers with whatever the client is about to look at. Create gives
 * back the project, because you are about to open it. Delete gives back the
 * list, because you are going back to it. This follows the phase 2 convention
 * that an action answers with state rather than an acknowledgement.
 *
 * Nothing here touches audio.cpp. The library works with the backend down.
 */
export const projectRoutes = new Hono();

const MAX_NAME_LENGTH = 200;

/** Reads a `name` out of a JSON body, or says why it could not. */
async function readName(c: Context): Promise<
  { ok: true; name: string } | { ok: false; response: Response }
> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: c.json<ApiError>({ error: 'Request body must be JSON' }, 400) };
  }

  const { name } = (body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || name.trim() === '') {
    return { ok: false, response: c.json<ApiError>({ error: 'A project needs a name' }, 400) };
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      response: c.json<ApiError>({ error: `A project name cannot be longer than ${MAX_NAME_LENGTH} characters` }, 400),
    };
  }

  return { ok: true, name: name.trim() };
}

projectRoutes.get('/projects', (c) => c.json<Project[]>(listProjects(db())));

projectRoutes.post('/projects', async (c) => {
  const name = await readName(c);
  if (!name.ok) return name.response;

  return c.json<Project>(createProject(db(), name.name), 201);
});

projectRoutes.get('/projects/:id', (c) => {
  const id = c.req.param('id');
  const project = readProject(db(), id);
  if (!project) return c.json<ApiError>({ error: `No project with the id ${id}` }, 404);

  return c.json<ProjectDetail>({ project, assets: listAssets(db(), id) });
});

projectRoutes.patch('/projects/:id', async (c) => {
  const id = c.req.param('id');
  const name = await readName(c);
  if (!name.ok) return name.response;

  const project = renameProject(db(), id, name.name);
  if (!project) return c.json<ApiError>({ error: `No project with the id ${id}` }, 404);

  return c.json<Project>(project);
});

/**
 * The directory goes before the row. A crash between the two leaves rows whose
 * files are gone, which reads as an empty project rather than a broken one, and
 * the reverse would leave files nothing points at.
 */
projectRoutes.delete('/projects/:id', async (c) => {
  const id = c.req.param('id');
  if (!readProject(db(), id)) return c.json<ApiError>({ error: `No project with the id ${id}` }, 404);

  await removeProjectDir(id);
  deleteProject(db(), id);

  return c.json<Project[]>(listProjects(db()));
});
