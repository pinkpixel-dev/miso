import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate.ts';
import { createJob } from '../db/jobs.ts';
import { createProject } from '../db/projects.ts';
import { assetPath, projectDir } from '../library/storage.ts';
import { storeResult } from './results.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../library/fixtures');
const tone = readFileSync(join(fixtures, 'tone.wav')).toString('base64');
const notAudio = readFileSync(join(fixtures, 'not-audio.wav')).toString('base64');

let handle: Database.Database;
let projectId: string;
let jobId: string;

beforeEach(() => {
  handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
  projectId = createProject(handle, 'Demo').id;
  jobId = 'job-1';
  createJob(handle, jobId, {
    projectId,
    taskId: 'generate.text2music',
    modelId: 'ace_step_turbo_q8_0',
    params: {},
  });
});

afterEach(async () => {
  await rm(projectDir(projectId), { recursive: true, force: true });
});

describe('storeResult', () => {
  it('writes the audio and links the asset to its job', async () => {
    const [asset] = await storeResult(
      handle,
      { projectId, jobId, label: 'synth pop' },
      { audio: tone, sampleRate: 48000, channels: 2, namedOutputs: [] },
    );

    expect(asset?.kind).toBe('generated');
    expect(asset?.label).toBe('synth pop');
    expect(asset?.format).toBe('wav');
    expect(asset?.durationSeconds).toBeGreaterThan(0);
    expect(asset?.checksum).toMatch(/^[0-9a-f]{64}$/);

    if (asset) {
      const file = await stat(assetPath(projectId, asset.id, asset.format));
      expect(file.size).toBe(asset.bytes);
    }
  });

  it('writes one stem per named output', async () => {
    const assets = await storeResult(
      handle,
      { projectId, jobId, label: 'Take 1' },
      {
        audio: tone,
        sampleRate: 48000,
        channels: 2,
        namedOutputs: [
          { id: 'vocals', audio: tone },
          { id: 'drums', audio: tone },
        ],
      },
    );

    expect(assets.map((asset) => asset.label)).toEqual(['Take 1 (vocals)', 'Take 1 (drums)']);
    expect(assets.every((asset) => asset.kind === 'stem')).toBe(true);
  });

  it('refuses a payload that is not audio, and leaves nothing behind', async () => {
    await expect(
      storeResult(
        handle,
        { projectId, jobId, label: 'broken' },
        { audio: notAudio, sampleRate: undefined, channels: undefined, namedOutputs: [] },
      ),
    ).rejects.toThrow(/could not be read as audio/i);

    expect(handle.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 0 });
  });

  it('refuses an empty payload', async () => {
    await expect(
      storeResult(
        handle,
        { projectId, jobId, label: 'empty' },
        { audio: '', sampleRate: undefined, channels: undefined, namedOutputs: [] },
      ),
    ).rejects.toThrow(/empty/i);
  });
});
