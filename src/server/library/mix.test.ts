import { describe, expect, it } from 'vitest';
import { mixChannels } from './mix.ts';

function ramp(values: number[]): Float32Array {
  return Float32Array.from(values);
}

describe('mixChannels', () => {
  it('sums two stems sample by sample', () => {
    const { channels } = mixChannels([
      { channels: [ramp([0.1, 0.2, 0.3])], gain: 1 },
      { channels: [ramp([0.4, 0.4, 0.4])], gain: 1 },
    ]);

    expect([...channels[0]!]).toEqual([
      expect.closeTo(0.5, 5),
      expect.closeTo(0.6, 5),
      expect.closeTo(0.7, 5),
    ]);
  });

  it("applies each stem's gain", () => {
    const { channels } = mixChannels([
      { channels: [ramp([1, 1])], gain: 0.25 },
      { channels: [ramp([1, 1])], gain: 0.5 },
    ]);

    expect(channels[0]![0]).toBeCloseTo(0.75, 5);
  });

  it('leaves a silenced stem out of the mix', () => {
    // A muted stem, or one that is not soloed, arrives here as a zero.
    const { channels } = mixChannels([
      { channels: [ramp([0.5, 0.5])], gain: 1 },
      { channels: [ramp([0.5, 0.5])], gain: 0 },
    ]);

    expect(channels[0]![0]).toBeCloseTo(0.5, 5);
  });

  it('keeps every channel', () => {
    const { channels } = mixChannels([
      { channels: [ramp([0.2]), ramp([0.4])], gain: 1 },
      { channels: [ramp([0.1]), ramp([0.1])], gain: 1 },
    ]);

    expect(channels).toHaveLength(2);
    expect(channels[0]![0]).toBeCloseTo(0.3, 5);
    expect(channels[1]![0]).toBeCloseTo(0.5, 5);
  });

  it('plays a mono stem into both sides of a stereo mix', () => {
    const { channels } = mixChannels([
      { channels: [ramp([0.2]), ramp([0.2])], gain: 1 },
      { channels: [ramp([0.5])], gain: 1 },
    ]);

    expect(channels[0]![0]).toBeCloseTo(0.7, 5);
    expect(channels[1]![0]).toBeCloseTo(0.7, 5);
  });

  it('holds a clipped sample at the edge and counts it', () => {
    const { channels, clipped } = mixChannels([
      { channels: [ramp([0.8, -0.8, 0.1])], gain: 1 },
      { channels: [ramp([0.8, -0.8, 0.1])], gain: 1 },
    ]);

    expect(channels[0]![0]).toBe(1);
    expect(channels[0]![1]).toBe(-1);
    expect(channels[0]![2]).toBeCloseTo(0.2, 5);
    expect(clipped).toBe(2);
  });

  it('does not normalise a mix that fits', () => {
    // The mix you save has to be the mix you heard.
    const { channels, clipped } = mixChannels([
      { channels: [ramp([0.3, 0.3])], gain: 1 },
    ]);

    expect(channels[0]![0]).toBeCloseTo(0.3, 5);
    expect(clipped).toBe(0);
  });

  it('runs to the longest stem', () => {
    const { channels } = mixChannels([
      { channels: [ramp([0.1, 0.1, 0.1, 0.1])], gain: 1 },
      { channels: [ramp([0.2, 0.2])], gain: 1 },
    ]);

    expect(channels[0]).toHaveLength(4);
    expect(channels[0]![0]).toBeCloseTo(0.3, 5);
    expect(channels[0]![3]).toBeCloseTo(0.1, 5);
  });

  it('answers with silence when everything is silenced', () => {
    const { channels, clipped } = mixChannels([
      { channels: [ramp([0.5])], gain: 0 },
      { channels: [ramp([0.5])], gain: 0 },
    ]);

    expect(channels).toHaveLength(1);
    expect(channels[0]).toHaveLength(0);
    expect(clipped).toBe(0);
  });
});
