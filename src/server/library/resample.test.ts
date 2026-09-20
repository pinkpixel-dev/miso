import { describe, expect, it } from 'vitest';
import { middleRms, peak, sine } from '../../shared/testSignals.ts';
import { resampledLength } from '../../shared/resample.ts';
import { convertWavRate } from './resample.ts';
import { readWav, writeWav } from './wav.ts';

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
