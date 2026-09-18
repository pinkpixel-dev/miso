/**
 * Changes the sample rate of PCM audio, in pure TypeScript.
 *
 * This exists for one reason: the separation models refuse anything but 44.1
 * kHz, and every take audio.cpp generates is 48 kHz. The refusal is a hard
 * error before any work starts:
 *
 *   HTTP 500 {"message":"HTDemucs prepare() sample rate mismatch: expected 44100, got 48000"}
 *
 * Doing it here rather than by spawning ffmpeg keeps the decision recorded in
 * DOCS/MEMORY.md: Miso runs on a NAS where no media binary is installed, so
 * anything it needs has to travel with the app. 48000 to 44100 reduces to
 * 147:160, so the conversion is exactly rational and there is no quality
 * argument to have about the ratio itself. What is left is the filter, and that
 * is a windowed sinc, which is the ordinary answer.
 *
 * Linear interpolation was not considered. It aliases audibly, and feeding an
 * aliased mix to a separation model is a bad first move for a studio tool.
 */

/**
 * Zero crossings kept either side of each output sample.
 *
 * Sets both quality and cost: the filter is this many taps per side per output
 * sample, so 16 costs 33 multiply-adds per sample per channel. Three minutes of
 * stereo is roughly half a billion of those, which lands in low seconds. Going
 * higher buys stopband rejection nobody will hear through a separation model.
 */
const HALF_TAPS = 16;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const pix = Math.PI * x;
  return Math.sin(pix) / pix;
}

/**
 * A windowed sinc lowpass for the upsampled domain, one tap per input phase.
 *
 * The cutoff is the lower of the two Nyquists, so upsampling keeps the signal
 * whole and downsampling filters before it decimates rather than after, which
 * is the entire point of doing this properly.
 *
 * The `up` factor in the gain compensates for zero insertion: an upsampled
 * signal carries `up - 1` zeros between every real sample, so its passband
 * amplitude falls by that factor and the filter has to give it back.
 */
function buildFilter(up: number, down: number): Float64Array {
  const cutoff = Math.min(1 / up, 1 / down);
  const length = 2 * HALF_TAPS * up + 1;
  const centre = HALF_TAPS * up;
  const taps = new Float64Array(length);

  for (let i = 0; i < length; i += 1) {
    const offset = i - centre;
    // Blackman, which is enough stopband for audio and needs no parameter.
    const phase = (2 * Math.PI * i) / (length - 1);
    const window = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    taps[i] = up * cutoff * sinc(cutoff * offset) * window;
  }

  return taps;
}

/** How many frames come back for a given input length. */
export function resampledLength(frames: number, from: number, to: number): number {
  if (from === to) return frames;
  const divisor = gcd(to, from);
  return Math.floor((frames * (to / divisor)) / (from / divisor));
}

/**
 * Resamples one channel.
 *
 * Reads outside the input are treated as silence rather than clamped to the
 * edge sample. Clamping would hold the first and last values under the filter
 * and bend the very start and end of the track towards them.
 */
function resampleChannel(
  input: Float32Array,
  taps: Float64Array,
  up: number,
  down: number,
  outFrames: number,
): Float32Array {
  const out = new Float32Array(outFrames);
  const centre = HALF_TAPS * up;
  const length = taps.length;

  for (let n = 0; n < outFrames; n += 1) {
    // Position in the notional upsampled signal, where this output sample sits.
    const position = n * down;
    const base = Math.floor(position / up);
    let total = 0;

    for (let i = base - HALF_TAPS; i <= base + HALF_TAPS; i += 1) {
      if (i < 0 || i >= input.length) continue;
      const tap = position - i * up + centre;
      if (tap < 0 || tap >= length) continue;
      total += taps[tap]! * input[i]!;
    }

    out[n] = total;
  }

  return out;
}

/**
 * Resamples every channel to a new rate.
 *
 * The same rate in and out returns the input untouched, which is what makes it
 * safe to call on every source without asking first.
 */
export function resampleChannels(
  channels: Float32Array[],
  from: number,
  to: number,
): Float32Array[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
    throw new Error(`Cannot resample from ${from} to ${to}`);
  }
  if (from === to) return channels;
  if (channels.length === 0) return channels;

  const divisor = gcd(to, from);
  const up = to / divisor;
  const down = from / divisor;

  const taps = buildFilter(up, down);
  const outFrames = resampledLength(channels[0]!.length, from, to);

  return channels.map((channel) => resampleChannel(channel, taps, up, down, outFrames));
}
