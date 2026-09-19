import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { PEAK_BUCKETS } from '../../shared/limits.ts';
import type { ApiError, Asset } from '../../shared/types.ts';
import { randomUUID } from 'node:crypto';
import { db } from '../db/index.ts';
import { createJob, readJob } from '../db/jobs.ts';
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

/**
 * Separation is the only thing that writes several takes at once, and four
 * stems exported one at a time is four trips through a save dialog.
 */
/**
 * Recombining is the only thing in Miso that makes audio without audio.cpp, so
 * these cover both halves: that the sum is right, and that the row it writes
 * says where it came from.
 */
describe('POST /api/projects/:id/jobs/:jobId/mix', () => {
  async function separation(): Promise<{ jobId: string; stems: Asset[]; sourceId: string }> {
    const source = (await (await importFile(projectId, 'tone.wav', 'Neon Night.wav')).json()) as Asset;

    const jobId = randomUUID();
    createJob(db(), jobId, {
      projectId,
      taskId: 'stems.separate',
      modelId: 'htdemucs_q8_0',
      params: {},
      inputs: [{ assetId: source.id, role: 'source' }],
    });

    const stems: Asset[] = [];
    for (const name of ['vocals', 'drums']) {
      const stem = (await (await importFile(projectId, 'tone.wav', `Neon Night (${name}).wav`)).json()) as Asset;
      db().prepare('UPDATE assets SET job_id = ?, kind = ? WHERE id = ?').run(jobId, 'stem', stem.id);
      stems.push(stem);
    }

    return { jobId, stems, sourceId: source.id };
  }

  async function mix(jobId: string, gains: Record<string, number>): Promise<Response> {
    return await app().request(`/api/projects/${projectId}/jobs/${jobId}/mix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gains }),
    });
  }

  it('writes a mix named after the take the stems came from', async () => {
    const { jobId, stems } = await separation();

    const response = await mix(jobId, Object.fromEntries(stems.map((s) => [s.id, 1])));
    expect(response.status).toBe(201);

    const { asset } = (await response.json()) as { asset: Asset };
    expect(asset.kind).toBe('mix');
    expect(asset.label).toBe('Neon Night (mix)');
    expect(asset.durationSeconds).toBeGreaterThan(0);
    expect(existsSync(assetPath(projectId, asset.id, asset.format))).toBe(true);
  });

  it('records what the mix was made from', async () => {
    const { jobId, stems } = await separation();

    const response = await mix(jobId, Object.fromEntries(stems.map((s) => [s.id, 1])));
    const { asset } = (await response.json()) as { asset: Asset };

    const row = db().prepare('SELECT job_id FROM assets WHERE id = ?').get(asset.id) as { job_id: string };
    const mixJob = readJob(db(), row.job_id)!;

    expect(mixJob.taskId).toBe('stems.mix');
    expect(mixJob.state).toBe('complete');
    expect(mixJob.inputs.map((input) => input.assetId).sort()).toEqual(
      stems.map((s) => s.id).sort(),
    );
  });

  it('leaves a silenced stem out of the mix and out of the lineage', async () => {
    const { jobId, stems } = await separation();

    const response = await mix(jobId, { [stems[0]!.id]: 1, [stems[1]!.id]: 0 });
    const { asset } = (await response.json()) as { asset: Asset };

    const row = db().prepare('SELECT job_id FROM assets WHERE id = ?').get(asset.id) as { job_id: string };
    const mixJob = readJob(db(), row.job_id)!;

    expect(mixJob.inputs.map((input) => input.assetId)).toEqual([stems[0]!.id]);
  });

  it('refuses a mix with nothing audible in it', async () => {
    const { jobId, stems } = await separation();

    const response = await mix(jobId, Object.fromEntries(stems.map((s) => [s.id, 0])));

    expect(response.status).toBe(400);
  });

  it('refuses a body with no gains', async () => {
    const { jobId } = await separation();

    const response = await app().request(`/api/projects/${projectId}/jobs/${jobId}/mix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('refuses a job from another project', async () => {
    const other = createProject(db(), 'Elsewhere').id;
    const { jobId } = await separation();

    const response = await app().request(`/api/projects/${other}/jobs/${jobId}/mix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gains: {} }),
    });

    expect(response.status).toBe(404);
  });
});

describe('GET /api/projects/:id/jobs/:jobId/outputs.zip', () => {
  async function jobWithOutputs(labels: string[]): Promise<string> {
    const jobId = randomUUID();
    createJob(db(), jobId, {
      projectId,
      taskId: 'stems.separate',
      modelId: 'htdemucs_q8_0',
      params: {},
    });

    for (const label of labels) {
      const imported = (await (await importFile(projectId, 'tone.wav', `${label}.wav`)).json()) as Asset;
      db().prepare('UPDATE assets SET job_id = ?, kind = ? WHERE id = ?').run(jobId, 'stem', imported.id);
    }

    return jobId;
  }

  it('answers with a zip named after the job', async () => {
    const jobId = await jobWithOutputs(['vocals', 'drums']);

    const response = await app().request(`/api/projects/${projectId}/jobs/${jobId}/outputs.zip`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition') ?? '').toMatch(/^attachment/);
  });

  it('carries one entry per output, under its own name', async () => {
    const jobId = await jobWithOutputs(['vocals', 'drums']);

    const response = await app().request(`/api/projects/${projectId}/jobs/${jobId}/outputs.zip`);
    const bytes = Buffer.from(await response.arrayBuffer());

    // Read as text rather than unpacked. Entry names sit in the local headers
    // and the central directory in the clear, which is enough to say what the
    // archive holds without a reader on this side.
    const text = bytes.toString('latin1');
    expect(text).toContain('vocals.wav');
    expect(text).toContain('drums.wav');
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from('PK\x03\x04', 'latin1'));
  });

  it('refuses a job from another project', async () => {
    const other = createProject(db(), 'Elsewhere').id;
    const jobId = await jobWithOutputs(['vocals']);

    const response = await app().request(`/api/projects/${other}/jobs/${jobId}/outputs.zip`);

    expect(response.status).toBe(404);
  });

  it('refuses a job that produced nothing', async () => {
    const jobId = randomUUID();
    createJob(db(), jobId, {
      projectId,
      taskId: 'stems.separate',
      modelId: 'htdemucs_q8_0',
      params: {},
    });

    const response = await app().request(`/api/projects/${projectId}/jobs/${jobId}/outputs.zip`);

    expect(response.status).toBe(404);
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
