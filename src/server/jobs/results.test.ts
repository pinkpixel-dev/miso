import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate.ts';
import { createJob } from '../db/jobs.ts';
import { createProject } from '../db/projects.ts';
import { validatePeaks } from '../library/peaks.ts';
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

  /**
   * Stable Audio returns its single track under named_audio_outputs with the id
   * audio_0. Reading a name as evidence of a stem filed ordinary generations
   * under the Stems heading, called "Take 1 (audio_0)". The count decides.
   */
  it('treats a single named output as the take, not a stem', async () => {
    const assets = await storeResult(
      handle,
      { projectId, jobId, label: 'Take 1' },
      {
        audio: tone,
        sampleRate: 44100,
        channels: 2,
        namedOutputs: [{ id: 'audio_0', audio: tone }],
      },
    );

    expect(assets).toHaveLength(1);
    expect(assets[0]?.kind).toBe('generated');
    expect(assets[0]?.label).toBe('Take 1');
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

  it('saves the take with its waveform already drawn', async () => {
    // The samples are in memory here, so sending the take back out to a browser
    // to be decoded would be a download and a decode to draw a picture of audio
    // the service was holding.
    const [asset] = await storeResult(
      handle,
      { projectId, jobId, label: 'drawn' },
      { audio: tone, sampleRate: undefined, channels: undefined, namedOutputs: [] },
    );

    expect(asset?.peaks).toBeDefined();
    expect(validatePeaks(asset?.peaks)).toMatchObject({ ok: true });
    expect(asset?.peaks?.[0]?.some((value) => value > 0)).toBe(true);
  });

  it('still saves a take whose waveform could not be read', async () => {
    // A WAV in a sample format the reader does not handle. The take is worth
    // far more than the picture of it.
    const odd = Buffer.from(readFileSync(join(fixtures, 'tone.flac')));
    const [asset] = await storeResult(
      handle,
      { projectId, jobId, label: 'flac take' },
      { audio: odd.toString('base64'), sampleRate: undefined, channels: undefined, namedOutputs: [] },
    );

    expect(asset).toBeDefined();
    expect(asset?.format).toBe('flac');
    expect(asset?.peaks).toBeUndefined();
  });
});
