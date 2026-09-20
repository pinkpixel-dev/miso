import { readWav, writeWav } from './wav.ts';
import { resampleChannels } from '../../shared/resample.ts';

/**
 * Sample rate conversion for whole WAV files on the service.
 *
 * The resampler itself moved to `shared/resample.ts`, because the workbench
 * converts a file in the browser through the same filter. What stays here is
 * the part that needs a WAV reader, and the WAV reader is the part that never
 * had a reason to leave the service.
 */

/**
 * Rewrites a WAV at a different sample rate.
 *
 * For what comes back from a model rather than what goes into one. RVC answers
 * at 40 kHz whatever it was given, and a conversion has to match the stems it
 * will sit beside, because the mix route refuses a set whose rates disagree.
 *
 * Returns the bytes unchanged when they are already at the target rate, and
 * undefined when they are not a WAV this can read, which is the caller's cue to
 * keep what the model sent rather than to fail. Nothing here can convert an
 * mp3: Miso spawns no media subprocess, by the decision in DOCS/MEMORY.md.
 */
export function convertWavRate(bytes: Buffer, to: number): Buffer | undefined {
  const audio = readWav(bytes);
  if (!audio) return undefined;
  if (audio.sampleRate === to) return bytes;

  return writeWav(resampleChannels(audio.channels, audio.sampleRate, to), to);
}
