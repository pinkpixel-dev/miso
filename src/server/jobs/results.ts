import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import type { Asset } from '../../shared/types.ts';
import type { TaskResult } from '../audiocpp/client.ts';
import { insertAsset, setAssetPeaks } from '../db/assets.ts';
import { readAudioFacts } from '../library/metadata.ts';
import { peaksFromWav } from '../library/wavPeaks.ts';
import { assetPath, ensureProjectDir, removeTemp, tempPath } from '../library/storage.ts';

/**
 * Turns what audio.cpp returned into assets on disk.
 *
 * Results arrive inline as base64 inside the JSON response, so by the time this
 * runs the bytes are already in memory and there is nothing to stream. A three
 * minute stereo track is roughly 40 MB of base64, which is why this decoding
 * happens in the service and never in the browser.
 *
 * The file is written and read back before the row is inserted, the same order
 * import uses: a crash between the two leaves a file nothing points at, which
 * gets swept at startup, rather than a row whose file is missing.
 */

/** A stem's own name, when a task returned several outputs at once. */
function labelFor(base: string, outputId: string | undefined): string {
  return outputId === undefined ? base : `${base} (${outputId})`;
}

async function writeOne(
  handle: Database,
  projectId: string,
  jobId: string,
  label: string,
  kind: 'generated' | 'stem',
  base64: string,
): Promise<Asset> {
  await ensureProjectDir(projectId);
  const temp = tempPath(projectId);

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw new Error('The server returned an empty audio payload');

  await writeFile(temp, bytes);

  const facts = await readAudioFacts(temp);
  if (!facts.ok) {
    await removeTemp(temp);
    throw new Error(`The result could not be read as audio. Detected: ${facts.detected}`);
  }

  const id = randomUUID();
  try {
    await rename(temp, assetPath(projectId, id, facts.value.format));
  } catch (error) {
    await removeTemp(temp);
    throw error;
  }

  const asset = insertAsset(handle, {
    id,
    projectId,
    kind,
    label,
    filename: `${label}.${facts.value.format}`,
    format: facts.value.format,
    bytes: bytes.length,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    durationSeconds: facts.value.durationSeconds,
    sampleRate: facts.value.sampleRate,
    channels: facts.value.channels,
    jobId,
  });

  // The waveform is read here because the samples are already in memory. An
  // imported file goes to the browser for this, which has a real decoder, but a
  // generated take is a PCM WAV and sending it back out to be decoded would
  // cost every device that opens the project a 34 MB download to draw a picture
  // of audio the service was holding a moment ago.
  //
  // After the row, not before: peaks are worth less than the take, so a reader
  // that cannot make sense of the samples leaves a complete asset with no
  // waveform and Draw waveform still works.
  if (facts.value.format !== 'wav') return asset;

  const peaks = peaksFromWav(bytes);
  if (!peaks) return asset;

  return setAssetPeaks(handle, id, peaks) ?? asset;
}

/**
 * Stores every audio output a job produced.
 *
 * One output is the take, whatever the server called it. Several are stems.
 *
 * The count is what decides, not whether the outputs were named, because a
 * name is not evidence of a stem. Stable Audio returns its single track under
 * `named_audio_outputs` with the id `audio_0`, and reading that as a stem filed
 * ordinary generations under the Stems heading with a machine id stuck on the
 * end of their name. Two such rows exist in libraries built before 2026-09-18.
 *
 * The job id is on each row, which is what links a take back to the prompt that
 * made it, and what holds a set of stems together.
 */
export async function storeResult(
  handle: Database,
  options: { projectId: string; jobId: string; label: string },
  result: TaskResult,
): Promise<Asset[]> {
  if (result.namedOutputs.length > 1) {
    const assets: Asset[] = [];
    for (const output of result.namedOutputs) {
      assets.push(
        await writeOne(
          handle,
          options.projectId,
          options.jobId,
          labelFor(options.label, output.id),
          'stem',
          output.audio,
        ),
      );
    }
    return assets;
  }

  return [
    await writeOne(handle, options.projectId, options.jobId, options.label, 'generated', result.audio),
  ];
}
