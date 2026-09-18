import { PEAK_BUCKETS } from '../../shared/limits.ts';
import { bucketPeaks } from '../../shared/peaks.ts';
import { findChunks, readSamples } from './wav.ts';

/**
 * Reads the waveform out of a PCM WAV.
 *
 * This exists because a generated take arrives as a WAV the service already
 * holds in memory. Drawing its waveform in the browser instead means every
 * device that opens the project downloads the whole file and decodes it: three
 * minutes of 48 kHz stereo is 34 MB down the wire and about 70 MB of decoded
 * float to throw away afterwards. Reading it here costs one pass over bytes
 * that are already in hand, and the take arrives with its waveform drawn.
 *
 * The WAV itself is read by `wav.ts`, which resampling also uses. Imported mp3,
 * flac, and m4a still go to the browser, which has a real decoder, and that
 * split is the reason no decoding dependency is needed on this side.
 *
 * Anything it does not recognise returns undefined, which is not a failure:
 * peaks are nullable, the take is complete without them, and Draw waveform
 * still works. A take with no waveform is worth far less than a generation
 * thrown away over one.
 */

/** The waveform for a WAV, or undefined for anything this cannot read. */
export function peaksFromWav(bytes: Buffer): number[][] | undefined {
  const chunks = findChunks(bytes);
  if (!chunks) return undefined;

  const samples = readSamples(chunks.format, chunks.data);
  if (!samples) return undefined;

  return bucketPeaks(samples, PEAK_BUCKETS);
}
