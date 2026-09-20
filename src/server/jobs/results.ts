import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import type { Asset, MidiArtifact, ScoreArtifact } from '../../shared/types.ts';
import type { TaskArtifact, TaskResult } from '../audiocpp/client.ts';
import { insertAsset, setAssetPeaks } from '../db/assets.ts';
import { insertMidiArtifact } from '../db/midi.ts';
import { insertScoreArtifact } from '../db/scores.ts';
import { readAudioFacts } from '../library/metadata.ts';
import { convertWavRate } from '../library/resample.ts';
import { peaksFromWav } from '../library/wavPeaks.ts';
import { parseMidiNotes, notesDuration } from '../library/midiNotes.ts';
import { assetPath, ensureProjectDir, midiPath, removeTemp, tempPath } from '../library/storage.ts';

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

/**
 * Puts audio on disk and writes the row that points at it.
 *
 * Takes bytes rather than base64 because there are now two callers and only one
 * of them is decoding a response. A mix is summed here in the service and never
 * travels anywhere, so encoding it just to decode it again would be work in
 * both directions for nothing.
 */
export async function storeAudio(
  handle: Database,
  projectId: string,
  jobId: string,
  label: string,
  kind: 'generated' | 'stem' | 'mix',
  bytes: Buffer,
): Promise<Asset> {
  await ensureProjectDir(projectId);
  const temp = tempPath(projectId);

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
 * `singleKind` overrides the first half of that: voice conversion returns one
 * track and it is a stem, because it belongs beside the stems it was converted
 * from and the mix route has to be able to reach it.
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
  options: {
    projectId: string;
    jobId: string;
    label: string;
    singleKind?: 'generated' | 'stem';
    /**
     * The rate to write at, converting first when the model answered at
     * another one. Left out by every task that keeps what it was sent.
     */
    sampleRate?: number;
  },
  result: TaskResult,
): Promise<Asset[]> {
  // A model that answers at its own rate is converted here, where the bytes are
  // already decoded, rather than by whatever later wants them to match. An
  // unreadable payload keeps what the model sent: storeAudio refuses it a
  // moment later with a message about the audio itself, which is the more
  // useful complaint of the two.
  const atRate = (bytes: Buffer): Buffer =>
    options.sampleRate === undefined ? bytes : convertWavRate(bytes, options.sampleRate) ?? bytes;

  if (result.namedOutputs.length > 1) {
    const assets: Asset[] = [];
    for (const output of result.namedOutputs) {
      assets.push(
        await storeAudio(
          handle,
          options.projectId,
          options.jobId,
          labelFor(options.label, output.id),
          'stem',
          atRate(Buffer.from(output.audio, 'base64')),
        ),
      );
    }
    return assets;
  }

  return [
    await storeAudio(
      handle,
      options.projectId,
      options.jobId,
      options.label,
      options.singleKind ?? 'generated',
      atRate(Buffer.from(result.audio, 'base64')),
    ),
  ];
}

/**
 * Puts a transcription's MIDI file on disk and writes the row that points at it.
 *
 * The same order as `storeAudio`, file before row, so a crash between the two
 * leaves a file nothing points at rather than a row with no file.
 *
 * There is no equivalent of `readAudioFacts` here, and nothing is validated
 * past the file being non-empty. music-metadata does not read MIDI, and
 * checking the four byte `MThd` header would be a guess at what the backend
 * meant rather than a fact about it. The `meta` on the artifact is what says
 * this is MIDI, and it comes from the server.
 *
 * `notes` can be empty when the event list could not be read. That is stored
 * rather than refused: the file is still a transcription, it just has no
 * preview.
 */
export async function storeMidi(
  handle: Database,
  options: {
    projectId: string;
    jobId: string;
    sourceAssetId: string;
    label: string;
    /** Silence the worker put in front of the source, taken back off the times. */
    leadInSeconds?: number;
  },
  artifact: TaskArtifact,
  text: string | undefined,
): Promise<MidiArtifact> {
  await ensureProjectDir(options.projectId);

  const bytes = Buffer.from(artifact.payload, 'base64');
  if (bytes.length === 0) throw new Error('The server returned an empty MIDI payload');

  const notes = parseMidiNotes(text, options.leadInSeconds ?? 0);
  const id = randomUUID();

  const temp = tempPath(options.projectId);
  await writeFile(temp, bytes);
  try {
    await rename(temp, midiPath(options.projectId, id));
  } catch (error) {
    await removeTemp(temp);
    throw error;
  }

  return insertMidiArtifact(handle, {
    id,
    projectId: options.projectId,
    sourceAssetId: options.sourceAssetId,
    jobId: options.jobId,
    label: options.label,
    filename: `${options.label}.mid`,
    bytes: bytes.length,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    durationSeconds: notesDuration(notes),
    notes,
  });
}

/**
 * Stores every artifact a job produced.
 *
 * Only MIDI exists today, and only one artifact comes back per run, but the
 * response carries a list and a task that returned two would be stored as two
 * rather than silently losing one.
 */
export async function storeArtifacts(
  handle: Database,
  options: {
    projectId: string;
    jobId: string;
    sourceAssetId: string;
    label: string;
    leadInSeconds?: number;
  },
  result: TaskResult,
): Promise<MidiArtifact[]> {
  const midi = result.artifacts.filter((artifact) => artifact.kind === 'midi');
  if (midi.length === 0) {
    throw new Error('The server finished the transcription but returned no MIDI file');
  }

  const stored: MidiArtifact[] = [];
  for (const artifact of midi) {
    stored.push(await storeMidi(handle, options, artifact, result.text));
  }
  return stored;
}

/**
 * Stores the score a generation left beside its take, when it left one.
 *
 * Unlike `storeArtifacts`, an empty result is not an error. YuE2 returns a
 * score when its planning is on and nothing when it is off, and both are
 * ordinary outcomes of a run somebody asked for. Every other family returns no
 * artifacts at all and passes straight through.
 *
 * The score hangs off the take it was planned for rather than off a source.
 * There is no source: the song was written from words.
 */
export async function storeScores(
  handle: Database,
  options: { projectId: string; jobId: string; assetId: string; label: string },
  result: TaskResult,
): Promise<ScoreArtifact[]> {
  // By extension rather than by kind. The kind on this artifact is `custom`,
  // which says nothing, while the meta carries `extension: abc` and
  // `mime: text/vnd.abc`. Both come from the server.
  const scores = result.artifacts.filter((artifact) => artifact.extension === 'abc');

  const stored: ScoreArtifact[] = [];
  for (const artifact of scores) {
    const abc = Buffer.from(artifact.payload, 'base64').toString('utf8');
    // A score with no text in it is not stored. The take is still a take, and
    // a row pointing at an empty document would draw a download that hands
    // somebody an empty file.
    if (abc.trim() === '') continue;

    stored.push(
      insertScoreArtifact(handle, {
        id: randomUUID(),
        projectId: options.projectId,
        assetId: options.assetId,
        jobId: options.jobId,
        label: options.label,
        filename: `${options.label}.abc`,
        bytes: Buffer.byteLength(abc, 'utf8'),
        checksum: createHash('sha256').update(abc).digest('hex'),
        abc,
      }),
    );
  }

  return stored;
}

