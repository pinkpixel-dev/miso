import { describe, expect, it } from 'vitest';
import { peak, sine } from '../../shared/testSignals.ts';
import {
  applyEdits,
  cutAt,
  decibelsToGain,
  describeEdit,
  durationOf,
  fadeIn,
  fadeOut,
  gain,
  gainToDecibels,
  normalize,
  peakAfterGain,
  peakOf,
  trim,
  type Edit,
} from './edits.ts';

/** A flat signal, which makes a fade's shape readable straight off the samples. */
function flat(frames: number, value = 1): Float32Array[] {
  return [new Float32Array(frames).fill(value)];
}

const RATE = 1000;

describe('decibels', () => {
  it('round trips', () => {
    expect(gainToDecibels(decibelsToGain(-6))).toBeCloseTo(-6, 6);
    expect(decibelsToGain(0)).toBe(1);
  });

  it('halves the amplitude at roughly -6 dB', () => {
    expect(decibelsToGain(-6.0206)).toBeCloseTo(0.5, 4);
  });

  it('calls silence minus infinity rather than a very small number', () => {
    expect(gainToDecibels(0)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('peakOf', () => {
  it('finds the loudest sample in any channel', () => {
    expect(peakOf([Float32Array.from([0.1, -0.2]), Float32Array.from([0.4, 0.3])])).toBeCloseTo(0.4);
  });

  it('reads a negative peak as loud as a positive one', () => {
    expect(peakOf([Float32Array.from([-0.9, 0.2])])).toBeCloseTo(0.9);
  });

  it('is zero for silence and for nothing at all', () => {
    expect(peakOf([new Float32Array(10)])).toBe(0);
    expect(peakOf([])).toBe(0);
  });
});

describe('trim', () => {
  it('keeps the span asked for', () => {
    const [out] = trim(flat(1000), RATE, 0.25, 0.75);
    expect(out!.length).toBe(500);
  });

  it('keeps every channel', () => {
    const stereo = [new Float32Array(1000), new Float32Array(1000)];
    expect(trim(stereo, RATE, 0.1, 0.2)).toHaveLength(2);
  });

  it('hands back the same arrays when it would keep everything', () => {
    const channels = flat(1000);
    expect(trim(channels, RATE, 0, 1)).toBe(channels);
  });

  it('swaps a region that ends before it starts', () => {
    const [out] = trim(flat(1000), RATE, 0.75, 0.25);
    expect(out!.length).toBe(500);
  });

  it('clamps a region that runs off either end', () => {
    const [out] = trim(flat(1000), RATE, -5, 500);
    expect(out!.length).toBe(1000);
  });

  it('gives back nothing for a region of no length', () => {
    const [out] = trim(flat(1000), RATE, 0.5, 0.5);
    expect(out!.length).toBe(0);
  });

  it('does not touch the source', () => {
    const channels = flat(1000);
    trim(channels, RATE, 0.25, 0.75);
    expect(channels[0]!.length).toBe(1000);
  });
});

describe('fadeIn', () => {
  it('starts at silence and ends at full', () => {
    const [out] = fadeIn(flat(1000), RATE, 1, 'linear');
    expect(out![0]).toBeCloseTo(0, 6);
    expect(out![999]).toBeCloseTo(1, 2);
  });

  it('is halfway up at the halfway point when linear', () => {
    const [out] = fadeIn(flat(1000), RATE, 1, 'linear');
    expect(out![500]).toBeCloseTo(0.5, 2);
  });

  it('is quieter at the halfway point when exponential', () => {
    const [linear] = fadeIn(flat(1000), RATE, 1, 'linear');
    const [curved] = fadeIn(flat(1000), RATE, 1, 'exponential');
    expect(curved![500]).toBeLessThan(linear![500]!);
    expect(curved![500]).toBeCloseTo(0.25, 2);
  });

  it('leaves the audio past the fade alone', () => {
    const [out] = fadeIn(flat(1000), RATE, 0.2, 'linear');
    expect(out![500]).toBe(1);
  });

  it('does nothing for a fade of no length', () => {
    const channels = flat(1000);
    expect(fadeIn(channels, RATE, 0, 'linear')).toBe(channels);
    expect(fadeIn(channels, RATE, -1, 'linear')).toBe(channels);
  });

  it('covers the whole track when the fade is longer than it is', () => {
    const [out] = fadeIn(flat(100), RATE, 10, 'linear');
    expect(out![0]).toBeCloseTo(0, 6);
    expect(out![99]).toBeLessThan(1);
  });

  it('does not touch the source', () => {
    const channels = flat(100);
    fadeIn(channels, RATE, 0.05, 'linear');
    expect(channels[0]![0]).toBe(1);
  });
});

describe('fadeOut', () => {
  it('ends at silence and starts at full', () => {
    const [out] = fadeOut(flat(1000), RATE, 1, 'linear');
    expect(out![999]).toBeCloseTo(0, 6);
    expect(out![0]).toBeCloseTo(1, 2);
  });

  it('is halfway down at the halfway point when linear', () => {
    const [out] = fadeOut(flat(1000), RATE, 1, 'linear');
    expect(out![500]).toBeCloseTo(0.5, 2);
  });

  it('leaves the audio before the fade alone', () => {
    const [out] = fadeOut(flat(1000), RATE, 0.2, 'linear');
    expect(out![500]).toBe(1);
  });

  it('does nothing for a fade of no length', () => {
    const channels = flat(1000);
    expect(fadeOut(channels, RATE, 0, 'linear')).toBe(channels);
  });

  it('covers the whole track when the fade is longer than it is', () => {
    const [out] = fadeOut(flat(100), RATE, 10, 'linear');
    expect(out![99]).toBeCloseTo(0, 6);
  });
});

describe('gain', () => {
  it('lifts and drops the level', () => {
    expect(gain(flat(10), 6)[0]![0]).toBeCloseTo(1.995, 2);
    expect(gain(flat(10), -6)[0]![0]).toBeCloseTo(0.501, 2);
  });

  it('hands back the same arrays at unity', () => {
    const channels = flat(10);
    expect(gain(channels, 0)).toBe(channels);
  });

  it('does not clamp past full scale, so that lowering it again undoes it', () => {
    const loud = gain(flat(10), 12);
    expect(peakOf(loud)).toBeGreaterThan(1);
    expect(gain(loud, -12)[0]![0]).toBeCloseTo(1, 5);
  });

  it('leaves silence silent', () => {
    expect(peakOf(gain([new Float32Array(10)], 24))).toBe(0);
  });
});

describe('normalize', () => {
  it('brings a quiet track up to the ceiling', () => {
    const quiet = [sine(100, RATE, 1)].map((c) => c.map((v) => v * 0.1)) as Float32Array[];
    expect(peakOf(normalize(quiet, -1))).toBeCloseTo(decibelsToGain(-1), 3);
  });

  it('brings a loud track down to the ceiling', () => {
    const loud = gain([sine(100, RATE, 1)], 12);
    expect(peakOf(normalize(loud, -1))).toBeCloseTo(decibelsToGain(-1), 3);
  });

  it('never lets the ceiling go above full scale', () => {
    expect(peakOf(normalize([sine(100, RATE, 1)], 6))).toBeLessThanOrEqual(1.0001);
  });

  it('leaves silence alone rather than multiplying it by infinity', () => {
    const silent = [new Float32Array(100)];
    expect(normalize(silent, -1)).toBe(silent);
  });

  it('keeps the shape of the waveform', () => {
    const tone = [sine(100, RATE, 1)];
    const out = normalize(tone, -6);
    // Same wave, one factor quieter. The ratio between any two samples holds.
    expect(out[0]![10]! / out[0]![20]!).toBeCloseTo(tone[0]![10]! / tone[0]![20]!, 4);
  });
});

describe('peakAfterGain', () => {
  it('agrees with actually applying the gain', () => {
    // The whole point of the prediction is that it matches the result. If these
    // two ever disagree, the warning beside the gain box is lying.
    const source = [sine(100, RATE, 1)];
    const before = peakOf(source);

    for (const decibels of [-12, -6, -0.5, 0, 3, 6, 12]) {
      expect(peakAfterGain(before, decibels)).toBeCloseTo(peakOf(gain(source, decibels)), 5);
    }
  });

  it('predicts clipping before it happens', () => {
    const quiet = gain([sine(100, RATE, 1)], -6);
    const peakNow = peakOf(quiet);

    expect(peakAfterGain(peakNow, 3)).toBeLessThan(1);
    expect(peakAfterGain(peakNow, 12)).toBeGreaterThan(1);
    expect(peakOf(gain(quiet, 12))).toBeGreaterThan(1);
  });

  it('leaves silence silent whatever the gain', () => {
    expect(peakAfterGain(0, 24)).toBe(0);
  });
});

describe('applyEdits', () => {
  it('does nothing for an empty chain', () => {
    const channels = flat(100);
    expect(applyEdits(channels, RATE, [])).toBe(channels);
  });

  it('applies in order, and the order matters', () => {
    const source = [sine(100, RATE, 1)];
    const normalizeThenFade: Edit[] = [
      { kind: 'normalize', ceilingDecibels: 0 },
      { kind: 'fadeOut', seconds: 1, curve: 'linear' },
    ];
    const fadeThenNormalize: Edit[] = [
      { kind: 'fadeOut', seconds: 1, curve: 'linear' },
      { kind: 'normalize', ceilingDecibels: 0 },
    ];

    // Fading first leaves a quieter peak for normalize to lift back to the
    // ceiling, so the two orders cannot agree.
    expect(peak(applyEdits(source, RATE, normalizeThenFade)[0]!)).toBeLessThan(
      peak(applyEdits(source, RATE, fadeThenNormalize)[0]!),
    );
  });

  it('runs a whole chain through without losing channels', () => {
    const stereo = [sine(100, RATE, 2), sine(200, RATE, 2)];
    const out = applyEdits(stereo, RATE, [
      { kind: 'trim', start: 0.5, end: 1.5 },
      { kind: 'fadeIn', seconds: 0.1, curve: 'exponential' },
      { kind: 'fadeOut', seconds: 0.1, curve: 'linear' },
      { kind: 'gain', decibels: -3 },
      { kind: 'normalize', ceilingDecibels: -1 },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]!.length).toBe(1000);
    expect(peakOf(out)).toBeCloseTo(decibelsToGain(-1), 3);
  });

  it('leaves the source alone, which is what makes undo work', () => {
    const source = [sine(100, RATE, 1)];
    const before = Float32Array.from(source[0]!);
    const chain: Edit[] = [
      { kind: 'gain', decibels: -6 },
      { kind: 'trim', start: 0, end: 0.5 },
    ];

    applyEdits(source, RATE, chain);
    expect(Array.from(source[0]!)).toEqual(Array.from(before));

    // Rendering the same chain twice gives the same answer, which is the
    // property undo actually relies on.
    expect(Array.from(applyEdits(source, RATE, chain)[0]!)).toEqual(
      Array.from(applyEdits(source, RATE, chain)[0]!),
    );
  });
});

describe('durationOf', () => {
  it('reads the length in seconds', () => {
    expect(durationOf(flat(44_100), 44_100)).toBe(1);
    expect(durationOf([], 44_100)).toBe(0);
  });
});

describe('describeEdit', () => {
  it('says what each edit was', () => {
    expect(describeEdit({ kind: 'trim', start: 1, end: 2.5 })).toBe('Trimmed to 1.00s to 2.50s');
    expect(describeEdit({ kind: 'gain', decibels: 3 })).toBe('Gain +3.0 dB');
    expect(describeEdit({ kind: 'gain', decibels: -3 })).toBe('Gain -3.0 dB');
    expect(describeEdit({ kind: 'fadeIn', seconds: 2, curve: 'exponential' })).toBe(
      'Exponential fade in over 2.00s',
    );
    expect(describeEdit({ kind: 'normalize', ceilingDecibels: -1 })).toBe('Normalized to -1.0 dB');
  });
});

describe('cutAt', () => {
  it('splits into two halves that add back up', () => {
    const [before, after] = cutAt(flat(1000), RATE, 0.4);
    expect(before[0]!.length).toBe(400);
    expect(after[0]!.length).toBe(600);
  });

  it('keeps every channel on both sides', () => {
    const [before, after] = cutAt([new Float32Array(100), new Float32Array(100)], RATE, 0.05);
    expect(before).toHaveLength(2);
    expect(after).toHaveLength(2);
  });

  it('loses no samples and reorders none', () => {
    const source = [sine(100, RATE, 1)];
    const [before, after] = cutAt(source, RATE, 0.3);
    expect([...Array.from(before[0]!), ...Array.from(after[0]!)]).toEqual(
      Array.from(source[0]!),
    );
  });

  it('refuses a cut at either end rather than writing an empty take', () => {
    expect(() => cutAt(flat(1000), RATE, 0)).toThrow('nothing on one side');
    expect(() => cutAt(flat(1000), RATE, 1)).toThrow('nothing on one side');
    expect(() => cutAt(flat(1000), RATE, -5)).toThrow('nothing on one side');
    expect(() => cutAt(flat(1000), RATE, 99)).toThrow('nothing on one side');
  });

  it('does not touch the source', () => {
    const source = [sine(100, RATE, 1)];
    const before = Float32Array.from(source[0]!);
    cutAt(source, RATE, 0.5);
    expect(Array.from(source[0]!)).toEqual(Array.from(before));
  });
});
