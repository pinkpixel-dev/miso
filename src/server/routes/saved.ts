import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { ApiError, SavedPrompt, SavedPromptKind } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { deleteSaved, listSaved, saveNamed } from '../db/saved.ts';

/**
 * Prompts and lyric sheets kept by name.
 *
 * Saving over a name replaces what was there and answers with the same row,
 * rather than refusing and making somebody invent "warm synthwave 2".
 */
export const savedRoutes = new Hono();

const MAX_NAME = 80;
const MAX_BODY = 20_000;

function readKind(raw: string | undefined): SavedPromptKind | undefined {
  return raw === 'prompt' || raw === 'lyrics' ? raw : undefined;
}

savedRoutes.get('/saved', (c) => {
  const filter = c.req.query('kind');
  if (filter !== undefined && readKind(filter) === undefined) {
    return c.json<ApiError>({ error: 'kind must be prompt or lyrics' }, 400);
  }
  return c.json<SavedPrompt[]>(listSaved(db(), readKind(filter)));
});

savedRoutes.post('/saved', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);
  }

  const { kind, name, body: text } = (body ?? {}) as {
    kind?: unknown;
    name?: unknown;
    body?: unknown;
  };

  const which = typeof kind === 'string' ? readKind(kind) : undefined;
  if (which === undefined) {
    return c.json<ApiError>({ error: 'kind must be prompt or lyrics' }, 400);
  }

  if (typeof name !== 'string' || name.trim() === '') {
    return c.json<ApiError>({ error: 'A name is required' }, 400);
  }
  if (name.trim().length > MAX_NAME) {
    return c.json<ApiError>({ error: `The name cannot be longer than ${MAX_NAME} characters` }, 400);
  }

  if (typeof text !== 'string' || text.trim() === '') {
    return c.json<ApiError>({ error: 'There is nothing to save' }, 400);
  }
  if (text.length > MAX_BODY) {
    return c.json<ApiError>({ error: `This is too long to save, at over ${MAX_BODY} characters` }, 400);
  }

  const saved = saveNamed(db(), randomUUID(), {
    kind: which,
    name: name.trim(),
    body: text.trim(),
  });

  return c.json<SavedPrompt>(saved, 201);
});

savedRoutes.delete('/saved/:id', (c) => {
  const id = c.req.param('id');
  if (!deleteSaved(db(), id)) {
    return c.json<ApiError>({ error: `Nothing saved with the id ${id}` }, 404);
  }
  return c.json<SavedPrompt[]>(listSaved(db()));
});
