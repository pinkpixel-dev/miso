import { describe, expect, it } from 'vitest';
import { SAVED_FORMAT, savedFilename, withWavExtension } from './decodeFile.ts';

/**
 * Only the naming is tested here. Decoding needs a real Web Audio
 * implementation, and there is no jsdom in this project by choice, so the
 * decode path is checked by using it rather than by a test that would have to
 * fake the thing under test.
 */

describe('savedFilename', () => {
  it('keeps the stem and says what happened', () => {
    expect(savedFilename('Smelly Cats.mp3', 'converted')).toBe('Smelly Cats (converted).wav');
  });

  it('does not stack an extension it already had', () => {
    expect(savedFilename('take.wav', 'trimmed')).toBe('take (trimmed).wav');
  });

  it('copes with a name that is all extension, or none', () => {
    expect(savedFilename('.mp3', 'converted')).toBe('audio (converted).wav');
    expect(savedFilename('noextension', 'converted')).toBe('noextension (converted).wav');
  });

  it('leaves a dotted name alone apart from the last piece', () => {
    expect(savedFilename('take.2.final.flac', 'trimmed')).toBe('take.2.final (trimmed).wav');
  });

  it('writes the format the upload route checks for', () => {
    expect(SAVED_FORMAT).toBe('wav');
    expect(savedFilename('x.mp3', 'y').endsWith(`.${SAVED_FORMAT}`)).toBe(true);
  });
});

describe('withWavExtension', () => {
  it('puts a wav extension on, whatever was there', () => {
    expect(withWavExtension('Smelly Cats.mp3')).toBe('Smelly Cats.wav');
    expect(withWavExtension('take.flac')).toBe('take.wav');
    expect(withWavExtension('take.m4a')).toBe('take.wav');
  });

  it('leaves a wav alone apart from rewriting the same extension', () => {
    expect(withWavExtension('take.wav')).toBe('take.wav');
  });

  it('only touches the last piece of a dotted name', () => {
    expect(withWavExtension('take.2.final.mp3')).toBe('take.2.final.wav');
  });

  it('copes with no extension and with nothing but one', () => {
    expect(withWavExtension('noextension')).toBe('noextension.wav');
    expect(withWavExtension('.mp3')).toBe('audio.wav');
  });

  it('writes the extension the upload route checks for', () => {
    expect(withWavExtension('x.mp3').endsWith(`.${SAVED_FORMAT}`)).toBe(true);
  });
});
