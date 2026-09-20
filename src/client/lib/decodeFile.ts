import type { AssetFormat } from '../../shared/types.ts';
import { writeWav } from '../../shared/wav.ts';

/**
 * Turns a file into samples, at the rate the file is actually in.
 *
 * The rate is the whole difficulty. `decodeAudioData` resamples to the rate of
 * the context you call it on, so decoding a 44.1 kHz file in a default 48 kHz
 * context quietly converts it, and converting that back to 44.1 kHz on the way
 * out would resample the same audio twice for no reason at all.
 *
 * So the rate is read first, from the container, and the decode happens in an
 * `OfflineAudioContext` created at that rate, which leaves the samples alone.
 * `music-metadata` does the reading. It was already a dependency for the import
 * route on the service, and its `default` export is browser safe, so this costs
 * no new package. It is imported dynamically because it is only wanted on this
 * one page and it is not small.
 *
 * Both steps are allowed to fail. A container this cannot parse, or a rate a
 * browser will not build a context at, falls back to an ordinary decode and
 * reports the rate it really got, rather than refusing the file. The page says
 * which happened, because a resampled decode is worth knowing about.
 */

export interface DecodedAudio {
  /** One array per channel, at `sampleRate`. */
  channels: Float32Array[];
  /** The rate these samples are really at, whatever the container claimed. */
  sampleRate: number;
  durationSeconds: number;
  /** What the container said it was, when it could be read. */
  container?: string;
  codec?: string;
  /**
   * True when the browser resampled on the way in, because the file's own rate
   * could not be read or could not be used. The samples are still correct, they
   * are just not at the rate the file was written at.
   */
  resampledOnDecode: boolean;
}

/** What the container says, before anything is decoded. */
interface FileFacts {
  sampleRate?: number;
  container?: string;
  codec?: string;
}

function audioContextClass(): typeof AudioContext | undefined {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * Reads the container without decoding it.
 *
 * Everything here is optional on purpose. A file whose tags cannot be parsed is
 * still a file the browser may well decode, so a failure returns nothing rather
 * than throwing.
 */
async function readFacts(file: File): Promise<FileFacts> {
  try {
    const { parseBlob } = await import('music-metadata');
    const metadata = await parseBlob(file, { duration: false });
    return {
      sampleRate: metadata.format.sampleRate,
      container: metadata.format.container,
      codec: metadata.format.codec,
    };
  } catch {
    return {};
  }
}

/** Every channel of a decoded buffer, copied out before the buffer goes away. */
function channelsOf(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i += 1) {
    channels.push(Float32Array.from(buffer.getChannelData(i)));
  }
  return channels;
}

/**
 * Decodes at a named rate, or gives up.
 *
 * The bytes are copied for each attempt because `decodeAudioData` detaches the
 * buffer it is given, so a second attempt on the same one would be handed
 * nothing.
 */
async function decodeAt(bytes: ArrayBuffer, rate: number): Promise<AudioBuffer | undefined> {
  try {
    const context = new OfflineAudioContext(1, 1, rate);
    return await context.decodeAudioData(bytes.slice(0));
  } catch {
    return undefined;
  }
}

/** Decodes at whatever rate the browser prefers, which is the fallback. */
async function decodeAtDeviceRate(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) throw new Error('This browser cannot decode audio');

  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    void context.close();
  }
}

export async function decodeFile(file: File): Promise<DecodedAudio> {
  const bytes = await file.arrayBuffer();
  const facts = await readFacts(file);

  const wanted = facts.sampleRate;
  const native =
    wanted !== undefined && Number.isFinite(wanted) && wanted > 0
      ? await decodeAt(bytes, wanted)
      : undefined;

  const buffer = native ?? (await decodeAtDeviceRate(bytes));

  return {
    channels: channelsOf(buffer),
    sampleRate: buffer.sampleRate,
    durationSeconds: buffer.duration,
    container: facts.container,
    codec: facts.codec,
    // A decode at the file's own rate changed nothing. Anything else may have.
    resampledOnDecode: native === undefined && wanted !== undefined && wanted !== buffer.sampleRate,
  };
}

/**
 * The extension Miso files a saved WAV under.
 *
 * The workbench only ever writes WAV, so this is not a choice, but the upload
 * route checks the extension before it reads a byte and the name has to carry
 * it. Kept beside the decoder because the pair of them is the whole round trip.
 */
export const SAVED_FORMAT: AssetFormat = 'wav';

/**
 * A filename for a saved result, built from what it came from.
 *
 * The suffix says what happened rather than leaving three files called the
 * same thing in one project. An existing `.wav` on the end is replaced rather
 * than stacked, so editing a saved edit does not produce `song.wav.wav`.
 */
export function savedFilename(sourceName: string, suffix: string): string {
  const stem = sourceName.replace(/\.[^.]+$/, '') || 'audio';
  return `${stem} (${suffix}).${SAVED_FORMAT}`;
}

/**
 * The same audio, in a WAV container.
 *
 * Offered when a non-WAV file is imported, because WAV is what the rest of Miso
 * can work with: the service has no decoder, so separation, voice conversion
 * and the mix route all refuse anything else. Converting on the way in is what
 * stops somebody finding that out later, from a job that will not start.
 *
 * The sample rate is left exactly as it was, deliberately. Any WAV works for
 * separation at any rate, because the job worker converts to 44.1 kHz itself
 * before staging. What it cannot do is read the container. So this changes the
 * container and nothing else, and no question about rates has to be asked.
 *
 * Nothing is recovered by doing this. An mp3 is lossy and a WAV of it holds
 * exactly what the mp3 held. It is about what Miso can open, not about quality.
 */
export async function convertToWav(file: File): Promise<File> {
  const decoded = await decodeFile(file);
  const bytes = writeWav(decoded.channels, decoded.sampleRate);

  return new File([bytes], withWavExtension(file.name), { type: 'audio/wav' });
}

/** The same name, carrying the extension the upload route checks for. */
export function withWavExtension(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '') || 'audio';
  return `${stem}.${SAVED_FORMAT}`;
}
