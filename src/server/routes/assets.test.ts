import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { PEAK_BUCKETS } from '../../shared/limits.ts';
import type { ApiError, Asset } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { createProject } from '../db/projects.ts';
import { assetPath, projectDir } from '../library/storage.ts';
import { assetRoutes } from './assets.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'fixtures');

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', assetRoutes);
  return instance;
}

async function importFile(projectId: string, fixture: string, as = fixture): Promise<Response> {
  const body = await readFile(join(fixtures, fixture));
  return app().request(`/api/projects/${projectId}/assets`, {
    method: 'POST',
    headers: { 'x-miso-filename': encodeURIComponent(as) },
    body,
  });
}

let projectId: string;

beforeEach(() => {
  db().prepare('DELETE FROM projects').run();
  projectId = createProject(db(), 'Demo').id;
});

describe('POST /api/projects/:id/assets', () => {
  it('imports a wav and answers with the asset', async () => {
    const response = await importFile(projectId, 'tone.wav');
    expect(response.status).toBe(201);

    const asset = (await response.json()) as Asset;
    expect(asset.format).toBe('wav');
    expect(asset.filename).toBe('tone.wav');
    expect(asset.label).toBe('tone');
    expect(asset.kind).toBe('source');
    expect(asset.sampleRate).toBe(44100);
    expect(asset.channels).toBe(2);
    expect(asset.peaks).toBeUndefined();
    expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes the file where the derived path says it is', async () => {
    const asset = (await (await importFile(projectId, 'tone.flac')).json()) as Asset;
    expect(existsSync(assetPath(projectId, asset.id, 'flac'))).toBe(true);
  });

  it('rejects a file whose contents are not audio, and leaves nothing behind', async () => {
    const response = await importFile(projectId, 'not-audio.wav');
    expect(response.status).toBe(415);

    const body = (await response.json()) as ApiError;
    expect(body.error).toMatch(/could not be read as audio/i);

    const { readdirSync } = await import('node:fs');
    expect(readdirSync(projectDir(projectId))).toEqual([]);
  });

  it('rejects an extension outside the accepted four before reading a byte', async () => {
    const response = await importFile(projectId, 'tone.wav', 'tone.ogg');
    expect(response.status).toBe(415);
    expect(((await response.json()) as ApiError).error).toMatch(/ogg/i);
  });

  it('requires the filename header', async () => {
    const response = await app().request(`/api/projects/${projectId}/assets`, {
      method: 'POST',
      body: 'x',
    });
    expect(response.status).toBe(400);
  });

  it('answers 404 for a project that does not exist', async () => {
    const body = await readFile(join(fixtures, 'tone.wav'));
    const response = await app().request('/api/projects/nope/assets', {
      method: 'POST',
      headers: { 'x-miso-filename': 'tone.wav' },
      body,
    });
    expect(response.status).toBe(404);
  });

  it('keeps a non-ASCII filename intact', async () => {
    const asset = (await (await importFile(projectId, 'tone.mp3', 'mañana.mp3')).json()) as Asset;
    expect(asset.filename).toBe('mañana.mp3');
    expect(asset.label).toBe('mañana');
  });
});

function channel(value = 0.5): number[] {
  return new Array(PEAK_BUCKETS).fill(value);
}

async function imported(): Promise<Asset> {
  return (await (await importFile(projectId, 'tone.wav')).json()) as Asset;
}

describe('PUT /api/projects/:id/assets/:assetId/peaks', () => {
  it('stores peaks and answers with the asset carrying them', async () => {
    const asset = await imported();

    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}/peaks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ peaks: [channel(), channel(-0.5)] }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Asset;
    expect(body.peaks).toHaveLength(2);
    expect(body.peaks?.[0]).toHaveLength(PEAK_BUCKETS);
  });

  it('rejects malformed peaks and leaves the stored asset untouched', async () => {
    const asset = await imported();

    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}/peaks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ peaks: [[1, 2, 3]] }),
    });

    expect(response.status).toBe(400);

    const after = await app().request(`/api/projects/${projectId}/assets/${asset.id}/peaks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ peaks: [channel()] }),
    });
    expect(((await after.json()) as Asset).peaks).toHaveLength(1);
  });

  it('answers 404 for an asset that does not exist', async () => {
    const response = await app().request(`/api/projects/${projectId}/assets/nope/peaks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ peaks: [channel()] }),
    });
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id/assets/:assetId', () => {
  it('renames the label and leaves the filename alone', async () => {
    const asset = await imported();

    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Verse idea' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Asset;
    expect(body.label).toBe('Verse idea');
    expect(body.filename).toBe('tone.wav');
  });

  it('refuses a blank label', async () => {
    const asset = await imported();
    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: '  ' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/projects/:id/assets/:assetId', () => {
  it('removes the file and answers with what is left', async () => {
    const kept = await imported();
    const gone = (await (await importFile(projectId, 'tone.flac')).json()) as Asset;

    const response = await app().request(`/api/projects/${projectId}/assets/${gone.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Asset[];
    expect(body.map((a) => a.id)).toEqual([kept.id]);
    expect(existsSync(assetPath(projectId, gone.id, 'flac'))).toBe(false);
    expect(existsSync(assetPath(projectId, kept.id, 'wav'))).toBe(true);
  });

  it('answers 404 for an asset that does not exist', async () => {
    const response = await app().request(`/api/projects/${projectId}/assets/nope`, { method: 'DELETE' });
    expect(response.status).toBe(404);
  });
});

describe('GET /api/projects/:id/assets/:assetId/audio', () => {
  it('serves the whole file when nothing was asked for', async () => {
    const asset = await imported();
    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}/audio`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(Number(response.headers.get('content-length'))).toBe(asset.bytes);
  });

  it('serves a partial range with the right headers', async () => {
    const asset = await imported();
    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}/audio`, {
      headers: { range: 'bytes=0-99' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes 0-99/${asset.bytes}`);
    expect(Number(response.headers.get('content-length'))).toBe(100);

    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(100);
  });

  it('answers 416 for a range past the end of the file', async () => {
    const asset = await imported();
    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}/audio`, {
      headers: { range: `bytes=${asset.bytes + 10}-` },
    });

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${asset.bytes}`);
  });

  it('answers 404 for an asset that does not exist', async () => {
    const response = await app().request(`/api/projects/${projectId}/assets/nope/audio`);
    expect(response.status).toBe(404);
  });
});

describe('GET /api/projects/:id/assets/:assetId/download', () => {
  it('serves the file as an attachment under its original name', async () => {
    const asset = (await (await importFile(projectId, 'tone.mp3', 'mañana.mp3')).json()) as Asset;
    const response = await app().request(`/api/projects/${projectId}/assets/${asset.id}/download`);

    expect(response.status).toBe(200);

    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/^attachment/);
    expect(disposition).toContain("filename*=UTF-8''ma%C3%B1ana.mp3");
  });
});

describe('POST /api/projects/:id/assets/:assetId/peaks/read', () => {
  it('reads a stored WAV without the browser fetching anything', async () => {
    const asset = await imported();

    const response = await app().request(
      `/api/projects/${projectId}/assets/${asset.id}/peaks/read`,
      { method: 'POST' },
    );
    expect(response.status).toBe(200);

    const updated = (await response.json()) as Asset;
    expect(updated.peaks?.[0]).toHaveLength(PEAK_BUCKETS);
    expect(updated.peaks?.[0]?.some((value) => value > 0)).toBe(true);
  });

  it('refuses a format only a browser can decode, and says so', async () => {
    const asset = (await (await importFile(projectId, 'tone.mp3')).json()) as Asset;

    const response = await app().request(
      `/api/projects/${projectId}/assets/${asset.id}/peaks/read`,
      { method: 'POST' },
    );
    expect(response.status).toBe(415);
    expect(((await response.json()) as ApiError).detail).toMatch(/browser/i);
  });

  it('answers 404 for an asset that is not in this project', async () => {
    const response = await app().request(`/api/projects/${projectId}/assets/nope/peaks/read`, {
      method: 'POST',
    });
    expect(response.status).toBe(404);
  });
});
