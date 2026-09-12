import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import type { Asset } from '../../shared/types.ts';
import type { TaskResult } from '../audiocpp/client.ts';
import { insertAsset } from '../db/assets.ts';
import { readAudioFacts } from '../library/metadata.ts';
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

  return insertAsset(handle, {
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
}

/**
 * Stores every audio output a job produced.
 *
 * A task that names its outputs (the stem routes) writes one asset per name and
 * marks them as stems. Everything else writes the single result. The job id is
 * on each row, which is what links a take back to the prompt that made it.
 */
export async function storeResult(
  handle: Database,
  options: { projectId: string; jobId: string; label: string },
  result: TaskResult,
): Promise<Asset[]> {
  if (result.namedOutputs.length > 0) {
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
