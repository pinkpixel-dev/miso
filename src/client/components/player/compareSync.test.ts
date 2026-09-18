import { describe, expect, it } from 'vitest';
import { clampTo, driftedTooFar, flipPlan } from './compareSync.ts';

describe('clampTo', () => {
  it('leaves a position the take has alone', () => {
    expect(clampTo(30, 94.76)).toBe(30);
  });

  it('pulls a position past the end back to the end', () => {
    expect(clampTo(94.78, 94.76)).toBe(94.76);
  });

  it('treats a negative position as the start', () => {
    expect(clampTo(-5, 94.76)).toBe(0);
  });

  it('answers zero for a take of unknown length rather than guessing', () => {
    expect(clampTo(30, Number.NaN)).toBe(0);
    expect(clampTo(30, 0)).toBe(0);
  });
});

describe('flipPlan', () => {
  it('lands the arriving take where the leaving one was', () => {
    expect(flipPlan({ audibleTime: 42, playing: true, arrivingDuration: 94.76 })).toEqual({
      time: 42,
      play: true,
    });
  });

  it('keeps the arriving take stopped when the leaving one was stopped', () => {
    expect(flipPlan({ audibleTime: 42, playing: false, arrivingDuration: 94.76 })).toEqual({
      time: 42,
      play: false,
    });
  });

  it('does not start a take with nothing left to play', () => {
    // The source runs 94.78 and the repaint 94.76, which is the real pair
    // measured on September 17, 2026.
    expect(flipPlan({ audibleTime: 94.78, playing: true, arrivingDuration: 94.76 })).toEqual({
      time: 94.76,
      play: false,
    });
  });

  it('starts at the beginning when the leaving position makes no sense', () => {
    expect(flipPlan({ audibleTime: Number.NaN, playing: true, arrivingDuration: 94.76 })).toEqual({
      time: 0,
      play: true,
    });
  });
});

describe('driftedTooFar', () => {
  it('ignores a gap nobody can hear', () => {
    expect(driftedTooFar(30, 30.01)).toBe(false);
  });

  it('notices a gap worth correcting', () => {
    expect(driftedTooFar(30, 30.4)).toBe(true);
  });

  it('measures the gap in both directions', () => {
    expect(driftedTooFar(30, 29.6)).toBe(true);
  });

  it('takes a caller supplied tolerance', () => {
    expect(driftedTooFar(30, 30.1, 0.5)).toBe(false);
  });

  it('says no rather than correcting on a reading it cannot trust', () => {
    expect(driftedTooFar(Number.NaN, 30)).toBe(false);
  });
});
