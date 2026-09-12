import { describe, expect, it } from 'vitest';
import { bucketPeaks } from './peaks.ts';

describe('bucketPeaks', () => {
  it('produces exactly the number of buckets asked for', () => {
    const channel = new Float32Array(10000).fill(0.5);
    expect(bucketPeaks([channel], 2048)[0]).toHaveLength(2048);
  });

  it('keeps one entry per channel', () => {
    const channel = new Float32Array(1000).fill(0.5);
    expect(bucketPeaks([channel, channel], 64)).toHaveLength(2);
  });

  it('takes the loudest magnitude in each bucket', () => {
    const channel = new Float32Array([0, 0.2, 0, 0.9, 0, 0.1, 0, 0.4]);
    expect(bucketPeaks([channel], 2)[0]).toEqual([0.9, 0.4]);
  });

  it('treats a negative trough as loud as a positive peak', () => {
    const channel = new Float32Array([0, -0.8, 0.3, 0]);
    expect(bucketPeaks([channel], 1)[0]).toEqual([0.8]);
  });

  it('rounds to three decimals', () => {
    const channel = new Float32Array([0.123456]);
    expect(bucketPeaks([channel], 1)[0]).toEqual([0.123]);
  });

  it('pads with zeros when there are fewer samples than buckets', () => {
    const result = bucketPeaks([new Float32Array([1, 1])], 8)[0];
    expect(result).toHaveLength(8);
    expect(result?.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('answers all zeros for silence', () => {
    const result = bucketPeaks([new Float32Array(500)], 16)[0];
    expect(result).toEqual(new Array(16).fill(0));
  });

  it('answers all zeros for an empty channel rather than throwing', () => {
    expect(bucketPeaks([new Float32Array(0)], 4)[0]).toEqual([0, 0, 0, 0]);
  });

  it('never exceeds one, even with samples slightly over full scale', () => {
    const channel = new Float32Array([1.4, -1.9]);
    expect(bucketPeaks([channel], 1)[0]).toEqual([1]);
  });
});
