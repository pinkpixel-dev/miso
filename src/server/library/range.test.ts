import { describe, expect, it } from 'vitest';
import { parseRange } from './range.ts';

const SIZE = 1000;

describe('parseRange', () => {
  it('returns the whole file when there is no Range header', () => {
    expect(parseRange(undefined, SIZE)).toEqual({ kind: 'whole' });
  });

  it('returns the whole file for a header it does not understand', () => {
    expect(parseRange('items=0-10', SIZE)).toEqual({ kind: 'whole' });
    expect(parseRange('bytes=', SIZE)).toEqual({ kind: 'whole' });
    expect(parseRange('nonsense', SIZE)).toEqual({ kind: 'whole' });
  });

  it('reads a closed range inclusively', () => {
    expect(parseRange('bytes=0-99', SIZE)).toEqual({ kind: 'partial', start: 0, end: 99 });
    expect(parseRange('bytes=100-199', SIZE)).toEqual({ kind: 'partial', start: 100, end: 199 });
  });

  it('reads an open ended range as running to the last byte', () => {
    expect(parseRange('bytes=500-', SIZE)).toEqual({ kind: 'partial', start: 500, end: 999 });
  });

  it('reads a suffix range as the last N bytes', () => {
    expect(parseRange('bytes=-100', SIZE)).toEqual({ kind: 'partial', start: 900, end: 999 });
  });

  it('clamps a suffix longer than the file to the whole file', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  it('clamps an end past the last byte', () => {
    expect(parseRange('bytes=900-5000', SIZE)).toEqual({ kind: 'partial', start: 900, end: 999 });
  });

  it('calls a start past the end of the file unsatisfiable', () => {
    expect(parseRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=5000-6000', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('calls a backwards range unsatisfiable', () => {
    expect(parseRange('bytes=500-100', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('calls a zero length suffix unsatisfiable', () => {
    expect(parseRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('serves the single byte of a one byte file', () => {
    expect(parseRange('bytes=0-', 1)).toEqual({ kind: 'partial', start: 0, end: 0 });
  });

  it('calls any range on an empty file unsatisfiable', () => {
    expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});
