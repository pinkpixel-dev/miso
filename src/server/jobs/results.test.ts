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
import { assetPath, midiPath, projectDir } from '../library/storage.ts';
import { storeArtifacts, storeResult } from './results.ts';
import type { TaskResult } from '../audiocpp/client.ts';

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

/**
 * A TaskResult with the non-audio fields defaulted.
 *
 * Every case here is about audio, and spelling out empty artifacts and an
 * absent transcript in each one would say nothing. Transcription has its own
 * tests where those fields are the point.
 */
function result(fields: Partial<TaskResult> & Pick<TaskResult, 'audio'>): TaskResult {
  return {
    sampleRate: undefined,
    channels: undefined,
    namedOutputs: [],
    artifacts: [],
    text: undefined,
    language: undefined,
    ...fields,
  };
}

describe('storeResult', () => {
  it('writes the audio and links the asset to its job', async () => {
    const [asset] = await storeResult(
      handle,
      { projectId, jobId, label: 'synth pop' },
      result({ audio: tone, sampleRate: 48000, channels: 2, namedOutputs: [] }),
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
      result({
        audio: tone,
        sampleRate: 44100,
        channels: 2,
        namedOutputs: [{ id: 'audio_0', audio: tone }],
      }),
    );

    expect(assets).toHaveLength(1);
    expect(assets[0]?.kind).toBe('generated');
    expect(assets[0]?.label).toBe('Take 1');
  });

  it('writes one stem per named output', async () => {
    const assets = await storeResult(
      handle,
      { projectId, jobId, label: 'Take 1' },
      result({
        audio: tone,
        sampleRate: 48000,
        channels: 2,
        namedOutputs: [
          { id: 'vocals', audio: tone },
          { id: 'drums', audio: tone },
        ],
      }),
    );

    expect(assets.map((asset) => asset.label)).toEqual(['Take 1 (vocals)', 'Take 1 (drums)']);
    expect(assets.every((asset) => asset.kind === 'stem')).toBe(true);
  });

  /**
   * Voice conversion returns one track, and it is a stem. It has to land beside
   * the stems it was converted from, where the mix route can reach it.
   */
  it('files a single output as a stem when the task asks for one', async () => {
    const assets = await storeResult(
      handle,
      { projectId, jobId, label: 'Cool to Be You (vocals) (manthos)', singleKind: 'stem' },
      result({ audio: tone, sampleRate: 40000, channels: 1, namedOutputs: [] }),
    );

    expect(assets).toHaveLength(1);
    expect(assets[0]?.kind).toBe('stem');
  });

  it('writes the result at the rate the task asked for', async () => {
    // RVC answers at 40 kHz and the stems it joins are 44.1 kHz. The fixture is
    // already 44.1, so 48 kHz here is the same conversion in the other
    // direction: what matters is that the row says what was asked for.
    const [asset] = await storeResult(
      handle,
      { projectId, jobId, label: 'converted', singleKind: 'stem', sampleRate: 48000 },
      result({ audio: tone, sampleRate: 44100, channels: 2, namedOutputs: [] }),
    );

    expect(asset?.sampleRate).toBe(48000);
    // The same second of audio, not a second of something shorter.
    expect(asset?.durationSeconds).toBeCloseTo(1, 1);
  });

  it('leaves the result alone when it is already at the rate asked for', async () => {
    const [asset] = await storeResult(
      handle,
      { projectId, jobId, label: 'converted', sampleRate: 44100 },
      result({ audio: tone, sampleRate: 44100, channels: 2, namedOutputs: [] }),
    );

    expect(asset?.sampleRate).toBe(44100);
    expect(asset?.checksum).toBe(
      await import('node:crypto').then((crypto) =>
        crypto.createHash('sha256').update(Buffer.from(tone, 'base64')).digest('hex'),
      ),
    );
  });

  it('refuses a payload that is not audio, and leaves nothing behind', async () => {
    await expect(
      storeResult(
        handle,
        { projectId, jobId, label: 'broken' },
        result({ audio: notAudio, sampleRate: undefined, channels: undefined, namedOutputs: [] }),
      ),
    ).rejects.toThrow(/could not be read as audio/i);

    expect(handle.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 0 });
  });

  it('refuses an empty payload', async () => {
    await expect(
      storeResult(
        handle,
        { projectId, jobId, label: 'empty' },
        result({ audio: '', sampleRate: undefined, channels: undefined, namedOutputs: [] }),
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
      result({ audio: tone, sampleRate: undefined, channels: undefined, namedOutputs: [] }),
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
      result({ audio: odd.toString('base64'), sampleRate: undefined, channels: undefined, namedOutputs: [] }),
    );

    expect(asset).toBeDefined();
    expect(asset?.format).toBe('flac');
    expect(asset?.peaks).toBeUndefined();
  });
});

/**
 * Transcription is the only task whose result is not audio, so it is the only
 * one that takes this path. The payload is a real, minimal MIDI header rather
 * than arbitrary bytes, because the bytes are what gets downloaded.
 */
describe('storeArtifacts', () => {
  const midi = Buffer.from('MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0', 'binary').toString('base64');

  const events = JSON.stringify([
    { type: 'start', pitch: 60, start_time: 1.5, index: 0, instrument: 'acoustic_piano' },
    { type: 'end', end_time: 2.5, start_event_index: 0 },
  ]);

  function transcription(overrides: Partial<TaskResult> = {}): TaskResult {
    return result({
      audio: '',
      text: events,
      language: 'midi-json',
      artifacts: [
        { id: 'result', kind: 'midi', payload: midi, extension: 'mid', mime: 'audio/midi' },
      ],
      ...overrides,
    });
  }

  async function source(): Promise<string> {
    const [asset] = await storeResult(handle, { projectId, jobId, label: 'Song' }, result({ audio: tone }));
    return asset!.id;
  }

  it('writes the MIDI file and a row that points at it', async () => {
    const sourceAssetId = await source();

    const [artifact] = await storeArtifacts(
      handle,
      { projectId, jobId, sourceAssetId, label: 'Song' },
      transcription(),
    );

    expect(artifact?.filename).toBe('Song.mid');
    expect(artifact?.sourceAssetId).toBe(sourceAssetId);
    expect(artifact?.noteCount).toBe(1);
    await expect(stat(midiPath(projectId, artifact!.id))).resolves.toBeTruthy();
  });

  it('takes the lead-in silence back off the note times', async () => {
    const sourceAssetId = await source();

    const [artifact] = await storeArtifacts(
      handle,
      { projectId, jobId, sourceAssetId, label: 'Song', leadInSeconds: 1 },
      transcription(),
    );

    expect(artifact?.notes).toEqual([{ pitch: 60, start: 0.5, end: 1.5, instrument: 'acoustic_piano' }]);
    expect(artifact?.durationSeconds).toBe(1.5);
  });

  it('keeps the file when the note events cannot be read', async () => {
    // The download is still a transcription. Only the preview is lost.
    const sourceAssetId = await source();

    const [artifact] = await storeArtifacts(
      handle,
      { projectId, jobId, sourceAssetId, label: 'Song' },
      transcription({ text: 'not json' }),
    );

    expect(artifact?.noteCount).toBe(0);
    expect(artifact?.durationSeconds).toBeUndefined();
    await expect(stat(midiPath(projectId, artifact!.id))).resolves.toBeTruthy();
  });

  it('refuses a result with no MIDI in it', async () => {
    const sourceAssetId = await source();

    await expect(
      storeArtifacts(
        handle,
        { projectId, jobId, sourceAssetId, label: 'Song' },
        transcription({ artifacts: [] }),
      ),
    ).rejects.toThrow(/no MIDI file/);
  });

  it('refuses an empty payload rather than writing a zero byte file', async () => {
    const sourceAssetId = await source();

    await expect(
      storeArtifacts(
        handle,
        { projectId, jobId, sourceAssetId, label: 'Song' },
        transcription({
          artifacts: [{ id: 'result', kind: 'midi', payload: '', extension: 'mid', mime: 'audio/midi' }],
        }),
      ),
    ).rejects.toThrow();
  });
});
