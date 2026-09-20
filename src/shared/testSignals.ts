/**
 * Signals and measurements for testing audio maths.
 *
 * Only test files import this, so it never reaches a bundle. It exists because
 * three of them now want the same tone generator and the same two ways of
 * measuring what came back: the resampler tests, the workbench edit tests, and
 * the WAV conversion tests on the service.
 *
 * Measuring rather than comparing sample by sample is deliberate. A filter
 * shifts phase and rings at the edges, both of which are correct and both of
 * which break an exact comparison. Level and frequency are what a listener
 * would notice being wrong.
 */

/** A tone, which is the easiest thing to check the level and pitch of. */
export function sine(frequency: number, rate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(rate * seconds));
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sin((2 * Math.PI * frequency * i) / rate);
  return out;
}

/** Peak amplitude, which is what a gain error moves and a phase shift does not. */
export function peak(samples: Float32Array): number {
  let highest = 0;
  for (const value of samples) highest = Math.max(highest, Math.abs(value));
  return highest;
}

/** Root mean square over the steady middle, away from a filter's edges. */
export function middleRms(samples: Float32Array): number {
  const from = Math.floor(samples.length * 0.25);
  const to = Math.floor(samples.length * 0.75);
  let total = 0;
  for (let i = from; i < to; i += 1) total += samples[i]! * samples[i]!;
  return Math.sqrt(total / (to - from));
}

/** Zero crossings per second, which locates the frequency without an FFT. */
export function crossingsPerSecond(samples: Float32Array, rate: number): number {
  const from = Math.floor(samples.length * 0.25);
  const to = Math.floor(samples.length * 0.75);
  let crossings = 0;
  for (let i = from + 1; i < to; i += 1) {
    if (samples[i - 1]! < 0 !== samples[i]! < 0) crossings += 1;
  }
  return crossings / ((to - from) / rate);
}
