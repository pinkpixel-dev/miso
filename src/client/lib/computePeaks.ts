import { PEAK_BUCKETS } from '../../shared/limits.ts';
import { bucketPeaks } from '../../shared/peaks.ts';

/**
 * Turns decoded audio into the waveform the service stores.
 *
 * This is the path for imported audio, which can be mp3, flac, or m4a, and
 * those need a real decoder. The browser has one. Whichever device imports the
 * file pays the cost once, and every later viewer, including a phone, draws
 * from the stored result without decoding anything.
 *
 * Generated takes do not come through here. They are PCM WAVs the service
 * already holds in memory, so it reads their peaks itself and a take arrives
 * with its waveform already drawn. See server/library/wavPeaks.ts.
 *
 * The bucketing itself is shared with the service, so both produce the same
 * numbers, and PEAK_BUCKETS is shared with the validator so the count is right.
 */

/**
 * Decodes a file and returns its peaks.
 *
 * decodeAudioData needs the whole file in memory as PCM, so a long uncompressed
 * import is heavy and can fail outright on a phone. That is why the file is
 * already uploaded and safe by the time this runs: a failure here costs the
 * waveform, never the asset.
 */
export async function computePeaks(file: File): Promise<number[][]> {
  const bytes = await file.arrayBuffer();

  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser cannot decode audio');

  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(bytes);
    const channels: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i += 1) channels.push(buffer.getChannelData(i));

    return bucketPeaks(channels, PEAK_BUCKETS);
  } finally {
    void context.close();
  }
}
