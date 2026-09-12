import { PEAK_BUCKETS } from '../../shared/limits.ts';

/**
 * Turns decoded audio into the waveform the service stores.
 *
 * The server has no audio decoder, deliberately, so peaks can only come from a
 * browser. Whichever device imports the file pays the cost once, and every
 * later viewer, including a phone, draws from the stored result without
 * decoding anything.
 *
 * PEAK_BUCKETS is shared with the validator so the browser produces exactly the
 * count it expects. Two copies of that number would drift.
 */

/** Loudest magnitude per bucket, so a trough counts as much as a crest. */
export function bucketPeaks(channels: Float32Array[], buckets: number): number[][] {
  return channels.map((samples) => {
    const out = new Array<number>(buckets).fill(0);
    if (samples.length === 0) return out;

    const perBucket = samples.length / buckets;

    for (let bucket = 0; bucket < buckets; bucket += 1) {
      const start = Math.floor(bucket * perBucket);
      const end = Math.min(
        samples.length,
        Math.max(start + 1, Math.floor((bucket + 1) * perBucket)),
      );

      let loudest = 0;
      for (let i = start; i < end; i += 1) {
        const magnitude = Math.abs(samples[i] ?? 0);
        if (magnitude > loudest) loudest = magnitude;
      }

      // Clamped because a decoder can hand back samples slightly past full
      // scale, and the server rejects anything outside -1 to 1.
      out[bucket] = Math.round(Math.min(1, loudest) * 1000) / 1000;
    }

    return out;
  });
}

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
