import { resampleChannels } from '../../shared/resample.ts';

/**
 * Encoding MP3 in the browser.
 *
 * MP3 is an export format in Miso and never a working one. A project holds WAV,
 * because separation, voice conversion and the mix route all need audio the
 * service can read and the service has no decoder. This is only for getting a
 * file back out.
 *
 * `@breezystack/lamejs` does the work: a maintained fork of `lamejs`, which is
 * LAME compiled to JavaScript. Every real JavaScript MP3 encoder is a LAME
 * derivative, so the licence question was LGPL either way, and the decision to
 * accept LGPL-3.0 here is recorded in DOCS/MEMORY.md. It is imported
 * dynamically, so it stays out of the main bundle and arrives the first time
 * somebody actually exports an MP3.
 *
 * Nothing here runs on the service. Encoding on the service would block the
 * event loop for seconds at a time, and the browser is already where the audio
 * is by the time anybody has asked for it.
 */

/**
 * The sample rates MP3 can carry.
 *
 * MPEG-1 is the top three, MPEG-2 the middle three, MPEG-2.5 the rest. This
 * matters because Miso holds audio at rates outside the set: RVC answers at
 * 40 kHz, and nothing guarantees every asset in a library sits on a rate MP3
 * happens to support.
 */
const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] as const;

/** What to encode at when the source rate is not one MP3 can carry. */
const FALLBACK_RATE = 44100;

/** Blocks of this many frames, which is one MP3 granule pair and what LAME wants. */
const BLOCK_FRAMES = 1152;

/** The bitrates worth offering, in kbps. */
export const MP3_BITRATES = [128, 192, 256, 320] as const;

export type Mp3Bitrate = (typeof MP3_BITRATES)[number];

/** Good enough that nobody asks, small enough to be worth doing. */
export const DEFAULT_BITRATE: Mp3Bitrate = 320;

/** Whether MP3 can carry this rate, or whether the audio has to move first. */
export function supportsRate(rate: number): boolean {
  return (MP3_RATES as readonly number[]).includes(rate);
}

/**
 * The rate this audio will actually be encoded at.
 *
 * Exported so the interface can say a conversion is going to happen before it
 * happens, rather than leaving somebody to notice afterwards.
 */
export function encodingRate(sourceRate: number): number {
  return supportsRate(sourceRate) ? sourceRate : FALLBACK_RATE;
}

/**
 * Float samples to 16-bit, rounded and clamped.
 *
 * The same treatment `shared/wav.ts` gives them, and for the same reason: an
 * edited or resampled sample can sit a hair outside -1 to 1 where the original
 * never did, and letting that wrap turns a loud moment into a click.
 */
function toInt16(channel: Float32Array, from: number, count: number): Int16Array {
  const out = new Int16Array(count);
  for (let i = 0; i < count; i += 1) {
    const value = Math.round((channel[from + i] ?? 0) * 32768);
    out[i] = Math.max(-32768, Math.min(32767, value));
  }
  return out;
}

/**
 * The library hands back `Int8Array` while its own types say `Uint8Array`.
 *
 * Measured, not assumed. The bytes are correct either way, but they have to be
 * reinterpreted over the same memory rather than copied element by element:
 * a frame header reads as `FF FB` through a `Uint8Array` view and as `-1 -5`
 * through the `Int8Array` the library returns.
 */
function asBytes(chunk: ArrayBufferView): Uint8Array {
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

export interface Mp3Progress {
  fraction: number;
}

export interface Mp3Options {
  bitrate?: Mp3Bitrate;
  onProgress?: (progress: Mp3Progress) => void;
}

/**
 * Encodes audio to an MP3 blob.
 *
 * Mono and stereo only. More than two channels is refused rather than quietly
 * reduced, because silently dropping audio is worse than saying no. Nothing
 * Miso produces has more than two.
 */
export async function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  { bitrate = DEFAULT_BITRATE, onProgress }: Mp3Options = {},
): Promise<Blob> {
  if (channels.length === 0) throw new Error('There is nothing to encode.');
  if (channels.length > 2) {
    throw new Error(`MP3 carries mono or stereo, and this has ${channels.length} channels.`);
  }

  // Moved before anything else, so the encoder is only ever handed a rate it
  // can actually carry.
  const rate = encodingRate(sampleRate);
  const source = rate === sampleRate ? channels : resampleChannels(channels, sampleRate, rate);

  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(source.length, rate, bitrate);

  const frames = source[0]?.length ?? 0;
  const left = source[0]!;
  const right = source[1];
  const parts: Uint8Array[] = [];

  for (let at = 0; at < frames; at += BLOCK_FRAMES) {
    const count = Math.min(BLOCK_FRAMES, frames - at);

    const chunk =
      right === undefined
        ? encoder.encodeBuffer(toInt16(left, at, count))
        : encoder.encodeBuffer(toInt16(left, at, count), toInt16(right, at, count));

    if (chunk.length > 0) parts.push(asBytes(chunk));
    onProgress?.({ fraction: frames === 0 ? 1 : Math.min(1, (at + count) / frames) });
  }

  // Whatever is still held in the encoder, including the last partial frame.
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(asBytes(tail));

  onProgress?.({ fraction: 1 });
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}
