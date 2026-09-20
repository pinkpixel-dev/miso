import { Hono } from 'hono';
import type { ApiError, SettingsPatch } from '../../shared/types.ts';
import { checkHealth } from '../audiocpp/client.ts';
import { version } from '../config.ts';
import { db } from '../db/index.ts';
import { readSettings, writeSettings } from '../db/settings.ts';
import { assetRoutes } from './assets.ts';
import { midiRoutes } from './midi.ts';
import { catalogRoutes } from './catalog.ts';
import { jobRoutes } from './jobs.ts';
import { lyricsRoutes } from './lyrics.ts';
import { projectRoutes } from './projects.ts';
import { savedRoutes } from './saved.ts';
import { storageRoutes } from './storage.ts';

export const api = new Hono();

/**
 * Is this process able to serve? Nothing more.
 *
 * Deliberately not `/backend/status`, which reaches across the network to
 * audio.cpp. A container orchestrator restarting Miso because the GPU box is
 * slow to start is the wrong reaction to the wrong problem. This answers for
 * Miso alone: the HTTP server is listening and the database opens and reads.
 *
 * The version is here because the first question about a misbehaving container
 * is which image it is running, and that should not need an exec into it.
 */
api.get('/health', (c) => {
  try {
    db().prepare('SELECT 1').get();
  } catch (error) {
    return c.json(
      {
        ok: false,
        version,
        detail: error instanceof Error ? error.message : String(error),
      },
      503,
    );
  }
  return c.json({ ok: true, version });
});

api.get('/settings', (c) => c.json(readSettings()));

api.put('/settings', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);
  }

  // Every setting is text except the engine, which is one of two words. Each
  // one is checked by name rather than the body being passed through, so an
  // unexpected key cannot reach the settings table.
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: SettingsPatch = {};

  const TEXT = [
    'backendUrl',
    'lyricsExternalUrl',
    'lyricsExternalModel',
    'lyricsExternalKey',
    'lyricsLocalUrl',
    'lyricsLocalModel',
  ] as const;

  for (const key of TEXT) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      return c.json<ApiError>({ error: `${key} must be a string` }, 400);
    }
    patch[key] = value;
  }

  if (input.lyricsEngine !== undefined) {
    if (input.lyricsEngine !== 'external' && input.lyricsEngine !== 'local') {
      return c.json<ApiError>({ error: 'lyricsEngine must be external or local' }, 400);
    }
    patch.lyricsEngine = input.lyricsEngine;
  }

  try {
    return c.json(writeSettings(patch));
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
api.route('/', assetRoutes);
api.route('/', storageRoutes);
api.route('/', jobRoutes);
api.route('/', midiRoutes);
api.route('/', lyricsRoutes);
api.route('/', savedRoutes);
