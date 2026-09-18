import { describe, expect, it } from 'vitest';
import { readWav, writeWav } from './wav.ts';

function tone(frames: number, frequency: number, rate: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = Math.sin((2 * Math.PI * frequency * i) / rate);
  return out;
}

describe('writeWav and readWav', () => {
  it('round trips a stereo signal', () => {
    const left = tone(500, 440, 44_100);
    const right = tone(500, 880, 44_100);

    const audio = readWav(writeWav([left, right], 44_100));

    expect(audio).toBeDefined();
    expect(audio!.sampleRate).toBe(44_100);
    expect(audio!.channels).toHaveLength(2);
    // 16 bit quantisation, so equality is to within one step of 1/32768.
    for (let i = 0; i < left.length; i += 1) {
      expect(audio!.channels[0]![i]).toBeCloseTo(left[i]!, 3);
      expect(audio!.channels[1]![i]).toBeCloseTo(right[i]!, 3);
    }
  });

  it('writes the rate it was given', () => {
    expect(readWav(writeWav([new Float32Array(10)], 48_000))!.sampleRate).toBe(48_000);
    expect(readWav(writeWav([new Float32Array(10)], 44_100))!.sampleRate).toBe(44_100);
  });

  it('clamps rather than wrapping', () => {
    // A resampled sample can ring past full scale. Wrapping would turn the
    // loudest moment in a track into a click.
    const audio = readWav(writeWav([Float32Array.from([1.4, -1.4])], 44_100));
    expect(audio!.channels[0]![0]).toBeCloseTo(1, 2);
    expect(audio!.channels[0]![1]).toBeCloseTo(-1, 2);
  });

  it('refuses to write no channels', () => {
    expect(() => writeWav([], 44_100)).toThrow();
  });

  it('returns undefined for something that is not a WAV', () => {
    expect(readWav(Buffer.from('not a wav at all'))).toBeUndefined();
  });
});
