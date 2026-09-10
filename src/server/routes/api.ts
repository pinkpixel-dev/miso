import { Hono } from 'hono';
import type { ApiError } from '../../shared/types.ts';
import { checkHealth } from '../audiocpp/client.ts';
import { readSettings, writeSettings } from '../db/settings.ts';
import { catalogRoutes } from './catalog.ts';
import { projectRoutes } from './projects.ts';

export const api = new Hono();

api.get('/settings', (c) => c.json(readSettings()));

api.put('/settings', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);
  }

  const { backendUrl } = (body ?? {}) as { backendUrl?: unknown };
  if (backendUrl !== undefined && typeof backendUrl !== 'string') {
    return c.json<ApiError>({ error: 'backendUrl must be a string' }, 400);
  }

  try {
    return c.json(writeSettings({ backendUrl }));
  } catch (error) {
    return c.json<ApiError>(
      { error: 'Could not save settings', detail: error instanceof Error ? error.message : undefined },
      400,
    );
  }
});

/**
 * Reports on the configured backend. Takes an optional ?url= so the settings
 * screen can test an address before saving it.
 */
api.get('/backend/status', async (c) => {
  const override = c.req.query('url');
  const url = override?.trim() ? override.trim().replace(/\/+$/, '') : readSettings().backendUrl;
  return c.json(await checkHealth(url));
});

api.route('/', catalogRoutes);
api.route('/', projectRoutes);
