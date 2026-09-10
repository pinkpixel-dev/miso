import { describe, expect, it } from 'vitest';
import { PEAK_BUCKETS } from '../../shared/limits.ts';
import { validatePeaks } from './peaks.ts';

function channel(value = 0): number[] {
  return new Array(PEAK_BUCKETS).fill(value);
}

describe('validatePeaks', () => {
  it('accepts one mono channel at the expected length', () => {
    const result = validatePeaks([channel(0.5)]);
    expect(result.ok).toBe(true);
  });

  it('accepts two stereo channels', () => {
    expect(validatePeaks([channel(0.5), channel(-0.5)]).ok).toBe(true);
  });

  it('rejects anything that is not an array of arrays', () => {
    expect(validatePeaks(undefined).ok).toBe(false);
    expect(validatePeaks('peaks').ok).toBe(false);
    expect(validatePeaks([1, 2, 3]).ok).toBe(false);
    expect(validatePeaks({ 0: channel() }).ok).toBe(false);
  });

  it('rejects no channels and more channels than audio has', () => {
    expect(validatePeaks([]).ok).toBe(false);
    expect(validatePeaks([channel(), channel(), channel(), channel(), channel()]).ok).toBe(false);
  });

  it('rejects a channel of the wrong length', () => {
    expect(validatePeaks([new Array(PEAK_BUCKETS - 1).fill(0)]).ok).toBe(false);
    expect(validatePeaks([new Array(PEAK_BUCKETS + 1).fill(0)]).ok).toBe(false);
  });

  it('rejects channels of differing lengths', () => {
    expect(validatePeaks([channel(), new Array(PEAK_BUCKETS - 1).fill(0)]).ok).toBe(false);
  });

  it('rejects values that are not finite numbers in range', () => {
    const bad = (value: unknown) => {
      const c = channel();
      c[10] = value as number;
      return validatePeaks([c]).ok;
    };

    expect(bad(Number.NaN)).toBe(false);
    expect(bad(Number.POSITIVE_INFINITY)).toBe(false);
    expect(bad(1.5)).toBe(false);
    expect(bad(-1.5)).toBe(false);
    expect(bad('0.5')).toBe(false);
    expect(bad(null)).toBe(false);
  });

  it('accepts the boundary values exactly', () => {
    const c = channel();
    c[0] = 1;
    c[1] = -1;
    expect(validatePeaks([c]).ok).toBe(true);
  });

  it('says what was wrong', () => {
    const result = validatePeaks([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/channel/i);
  });
});
