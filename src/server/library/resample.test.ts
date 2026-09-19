import { describe, expect, it } from 'vitest';
import { convertWavRate, resampleChannels, resampledLength } from './resample.ts';
import { readWav, writeWav } from './wav.ts';

/** Peak amplitude, which is what a gain error moves and a phase shift does not. */
function peak(samples: Float32Array): number {
  let highest = 0;
  for (const value of samples) highest = Math.max(highest, Math.abs(value));
  return highest;
}

/** Root mean square over the steady middle, away from the filter's edges. */
function middleRms(samples: Float32Array): number {
  const from = Math.floor(samples.length * 0.25);
  const to = Math.floor(samples.length * 0.75);
  let total = 0;
  for (let i = from; i < to; i += 1) total += samples[i]! * samples[i]!;
  return Math.sqrt(total / (to - from));
}

function sine(frequency: number, rate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(rate * seconds));
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sin((2 * Math.PI * frequency * i) / rate);
  return out;
}

/** Zero crossings per second, which locates the frequency without an FFT. */
function crossingsPerSecond(samples: Float32Array, rate: number): number {
  const from = Math.floor(samples.length * 0.25);
  const to = Math.floor(samples.length * 0.75);
  let crossings = 0;
  for (let i = from + 1; i < to; i += 1) {
    if (samples[i - 1]! < 0 !== samples[i]! < 0) crossings += 1;
  }
  return crossings / ((to - from) / rate);
}

describe('resampledLength', () => {
  it('holds the duration across the rate change', () => {
    // One second of 48 kHz is one second of 44.1 kHz.
    expect(resampledLength(48_000, 48_000, 44_100)).toBe(44_100);
    expect(resampledLength(44_100, 44_100, 48_000)).toBe(48_000);
  });

  it('returns the input length when nothing changes', () => {
    expect(resampledLength(1234, 44_100, 44_100)).toBe(1234);
  });
});

describe('resampleChannels', () => {
  it('returns the same arrays when the rate already matches', () => {
    const channels = [sine(1000, 44_100, 0.1)];
    expect(resampleChannels(channels, 44_100, 44_100)).toBe(channels);
  });

  it('keeps every channel', () => {
    const stereo = [sine(440, 48_000, 0.2), sine(660, 48_000, 0.2)];
    const out = resampleChannels(stereo, 48_000, 44_100);
    expect(out).toHaveLength(2);
    expect(out[0]!.length).toBe(resampledLength(stereo[0]!.length, 48_000, 44_100));
  });

  it('holds the level of a tone', () => {
    // A gain error is the failure this catches: the zero insertion in a
    // polyphase conversion costs a factor of `up` unless the filter gives it
    // back, and that mistake is silent until something sounds quiet.
    const input = sine(1000, 48_000, 0.5);
    const [output] = resampleChannels([input], 48_000, 44_100);
    expect(middleRms(output!)).toBeCloseTo(middleRms(input), 2);
  });

  it('holds the frequency of a tone', () => {
    const input = sine(1000, 48_000, 0.5);
    const [output] = resampleChannels([input], 48_000, 44_100);
    // Within one percent of 2000 crossings per second for a 1 kHz sine.
    expect(crossingsPerSecond(output!, 44_100)).toBeGreaterThan(1980);
    expect(crossingsPerSecond(output!, 44_100)).toBeLessThan(2020);
  });

  it('holds a constant level', () => {
    const input = new Float32Array(48_000).fill(0.5);
    const [output] = resampleChannels([input], 48_000, 44_100);
    expect(middleRms(output!)).toBeCloseTo(0.5, 2);
  });

  it('leaves silence silent', () => {
    const [output] = resampleChannels([new Float32Array(48_000)], 48_000, 44_100);
    expect(peak(output!)).toBe(0);
  });

  it('does not overshoot on a full scale tone', () => {
    // Ringing above 1.0 is expected from a sinc filter and is why writeWav
    // clamps. What would be wrong is a large overshoot, which means the filter
    // gain is off rather than the ripple being ordinary.
    const input = sine(1000, 48_000, 0.3);
    const [output] = resampleChannels([input], 48_000, 44_100);
    expect(peak(output!)).toBeLessThan(1.05);
  });

  it('upsamples as well as it downsamples', () => {
    const input = sine(1000, 44_100, 0.5);
    const [output] = resampleChannels([input], 44_100, 48_000);
    expect(middleRms(output!)).toBeCloseTo(middleRms(input), 2);
    expect(crossingsPerSecond(output!, 48_000)).toBeGreaterThan(1980);
    expect(crossingsPerSecond(output!, 48_000)).toBeLessThan(2020);
  });

  it('refuses a rate that is not a rate', () => {
    expect(() => resampleChannels([new Float32Array(10)], 0, 44_100)).toThrow();
    expect(() => resampleChannels([new Float32Array(10)], 48_000, Number.NaN)).toThrow();
  });
});

describe('convertWavRate', () => {
  it('rewrites a WAV at the rate asked for', () => {
    // 40 kHz is what RVC answers at, and 44.1 kHz is what the stems it has to
    // sit beside are. The ratio is 441:400.
    const bytes = writeWav([sine(440, 40_000, 0.5)], 40_000);
    const converted = convertWavRate(bytes, 44_100);

    expect(converted).toBeDefined();
    const audio = readWav(converted!);
    expect(audio?.sampleRate).toBe(44_100);
    expect(audio?.channels[0]?.length).toBe(resampledLength(20_000, 40_000, 44_100));
  });

  it('keeps the tone through the conversion', () => {
    const bytes = writeWav([sine(440, 40_000, 0.5)], 40_000);
    const audio = readWav(convertWavRate(bytes, 44_100)!);

    // Same wave at a new rate. A gain error or an aliased mess moves this.
    expect(middleRms(audio!.channels[0]!)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(peak(audio!.channels[0]!)).toBeLessThan(1.05);
  });

  it('hands back the same bytes when the rate already matches', () => {
    const bytes = writeWav([sine(440, 44_100, 0.2)], 44_100);
    expect(convertWavRate(bytes, 44_100)).toBe(bytes);
  });

  it('gives up on something it cannot read as a WAV', () => {
    // The caller keeps what the model sent, and storeAudio refuses it a moment
    // later with a message about the audio rather than about the rate.
    expect(convertWavRate(Buffer.from('not audio'), 44_100)).toBeUndefined();
  });
});
