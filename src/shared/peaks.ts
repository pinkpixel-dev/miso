/**
 * Turning samples into the waveform the library stores.
 *
 * This is shared because two places produce peaks now. A browser decodes an
 * imported file and calls this; the service reads the PCM out of a generated
 * WAV and calls the same function. One bucketing rule means a generated take
 * and an imported one draw the same way, which they would not if each side
 * rounded differently.
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
