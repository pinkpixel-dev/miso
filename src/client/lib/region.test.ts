import { describe, expect, it } from 'vitest';
import {
  MIN_REGION_SECONDS,
  clampRegion,
  defaultRegion,
  formatSeconds,
  moveBoundary,
} from './region.ts';

describe('clampRegion', () => {
  it('leaves a region that already fits alone', () => {
    expect(clampRegion({ start: 5, end: 10 }, 20)).toEqual({ start: 5, end: 10 });
  });

  it('pulls both ends inside the track', () => {
    expect(clampRegion({ start: -4, end: 40 }, 20)).toEqual({ start: 0, end: 20 });
  });

  it('reads a backwards region as the two ends having swapped', () => {
    expect(clampRegion({ start: 12, end: 4 }, 20)).toEqual({ start: 4, end: 12 });
  });

  it('opens a region with no length to the shortest one allowed', () => {
    expect(clampRegion({ start: 7, end: 7 }, 20)).toEqual({ start: 7, end: 7.1 });
  });

  it('takes the length off the start when there is no room at the end', () => {
    expect(clampRegion({ start: 20, end: 20 }, 20)).toEqual({ start: 19.9, end: 20 });
  });

  it('gives a track shorter than the minimum region the whole track', () => {
    expect(clampRegion({ start: 0, end: 0 }, 0.05)).toEqual({ start: 0, end: 0.1 });
  });
});

describe('moveBoundary', () => {
  it('moves the edge it was told to and leaves the other', () => {
    expect(moveBoundary({ start: 5, end: 10 }, 'start', 0.1, 20)).toEqual({ start: 5.1, end: 10 });
    expect(moveBoundary({ start: 5, end: 10 }, 'end', -1, 20)).toEqual({ start: 5, end: 9 });
  });

  it('stops a boundary at the minimum rather than letting it cross over', () => {
    const pushed = moveBoundary({ start: 5, end: 10 }, 'start', 99, 20);
    expect(pushed).toEqual({ start: 10 - MIN_REGION_SECONDS, end: 10 });

    const pulled = moveBoundary({ start: 5, end: 10 }, 'end', -99, 20);
    expect(pulled).toEqual({ start: 5, end: 5 + MIN_REGION_SECONDS });
  });

  it('stops at the ends of the track', () => {
    expect(moveBoundary({ start: 0.05, end: 10 }, 'start', -1, 20)).toEqual({ start: 0, end: 10 });
    expect(moveBoundary({ start: 5, end: 19.5 }, 'end', 5, 20)).toEqual({ start: 5, end: 20 });
  });

  it('never returns a region the service would refuse', () => {
    const moves: [side: 'start' | 'end', delta: number][] = [
      ['start', 99],
      ['start', -99],
      ['end', 99],
      ['end', -99],
    ];

    for (const [side, delta] of moves) {
      const moved = moveBoundary({ start: 5, end: 10 }, side, delta, 20);
      expect(moved.end, `${side} by ${delta}`).toBeGreaterThan(moved.start);
      expect(moved.start).toBeGreaterThanOrEqual(0);
      expect(moved.end).toBeLessThanOrEqual(20);
    }
  });
});

describe('defaultRegion', () => {
  it('opens on the middle third of the track', () => {
    expect(defaultRegion(30)).toEqual({ start: 10, end: 20 });
  });

  it('copes with a track whose length is not known yet', () => {
    expect(defaultRegion(0)).toEqual({ start: 0, end: MIN_REGION_SECONDS });
    expect(defaultRegion(Number.NaN)).toEqual({ start: 0, end: MIN_REGION_SECONDS });
  });
});

describe('formatSeconds', () => {
  it('shows tenths, because that is what a nudge moves', () => {
    expect(formatSeconds(0)).toBe('0:00.0');
    expect(formatSeconds(5.14)).toBe('0:05.1');
    expect(formatSeconds(75.5)).toBe('1:15.5');
  });

  it('does not show a negative time', () => {
    expect(formatSeconds(-3)).toBe('0:00.0');
  });
});
