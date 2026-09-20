import { describe, expect, it } from 'vitest';
import { EXPORT_FORMATS, needsConversion, withExtension } from './exportAudio.ts';

/**
 * The naming and the decision about whether to do any work at all.
 *
 * The conversion itself is not tested here: it needs a real decoder and a
 * network, and both of those are checked where they live, in `encodeMp3` and
 * `fetchRanged`. What matters here is that the fast path stays fast and that a
 * converted file comes out under a sensible name.
 */

describe('withExtension', () => {
  it('swaps the extension', () => {
    expect(withExtension('Smelly Cats.wav', 'mp3')).toBe('Smelly Cats.mp3');
    expect(withExtension('Smelly Cats.mp3', 'wav')).toBe('Smelly Cats.wav');
  });

  it('only touches the last piece of a dotted name', () => {
    expect(withExtension('take.2.final.flac', 'wav')).toBe('take.2.final.wav');
  });

  it('copes with no extension and with nothing but one', () => {
    expect(withExtension('noextension', 'mp3')).toBe('noextension.mp3');
    expect(withExtension('.mp3', 'wav')).toBe('audio.wav');
  });
});

describe('needsConversion', () => {
  it('is false when the stored format is the one asked for', () => {
    // The whole point: this case stays a plain link handing back stored bytes.
    expect(needsConversion('wav', 'wav')).toBe(false);
    expect(needsConversion('mp3', 'mp3')).toBe(false);
  });

  it('is true for any real change', () => {
    expect(needsConversion('wav', 'mp3')).toBe(true);
    expect(needsConversion('mp3', 'wav')).toBe(true);
    expect(needsConversion('flac', 'wav')).toBe(true);
    expect(needsConversion('m4a', 'mp3')).toBe(true);
  });
});

describe('EXPORT_FORMATS', () => {
  it('offers wav and mp3, and nothing Miso cannot write', () => {
    expect([...EXPORT_FORMATS]).toEqual(['wav', 'mp3']);
  });
});
