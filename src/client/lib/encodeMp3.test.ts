import { describe, expect, it } from 'vitest';
import { sine } from '../../shared/testSignals.ts';
import {
  DEFAULT_BITRATE,
  MP3_BITRATES,
  encodeMp3,
  encodingRate,
  supportsRate,
} from './encodeMp3.ts';

/**
 * The encoder is real here, not faked. It is pure JavaScript and runs happily
 * under Node, so these tests encode actual audio and read actual bytes back.
 *
 * What they check is the frame header and the shape of the result. Judging an
 * MP3 by comparing samples is not possible, because the format is lossy by
 * design and decoding it again is not what the format is for.
 */

/** The first bytes of every MP3 frame: eleven set bits, then the version. */
async function firstBytes(blob: Blob, count = 2): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, count));
}

describe('supportsRate', () => {
  it('knows the rates MP3 carries', () => {
    for (const rate of [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]) {
      expect(supportsRate(rate)).toBe(true);
    }
  });

  it('knows the ones it does not', () => {
    // 40 kHz is the one that matters: it is what RVC answers at.
    expect(supportsRate(40000)).toBe(false);
    expect(supportsRate(96000)).toBe(false);
    expect(supportsRate(0)).toBe(false);
  });
});

describe('encodingRate', () => {
  it('keeps a rate MP3 can carry', () => {
    expect(encodingRate(44100)).toBe(44100);
    expect(encodingRate(48000)).toBe(48000);
  });

  it('falls back to 44.1 kHz for one it cannot', () => {
    expect(encodingRate(40000)).toBe(44100);
    expect(encodingRate(96000)).toBe(44100);
  });
});

describe('encodeMp3', () => {
  it('writes something that begins with an MP3 frame sync', async () => {
    const blob = await encodeMp3([sine(440, 44100, 0.5)], 44100);
    const [first, second] = await firstBytes(blob);

    // 0xFF then the top three bits of the next byte set: the eleven bit sync
    // word every MP3 frame starts with.
    expect(first).toBe(0xff);
    expect((second! & 0xe0) === 0xe0).toBe(true);
  });

  it('says it is audio/mpeg', async () => {
    const blob = await encodeMp3([sine(440, 44100, 0.2)], 44100);
    expect(blob.type).toBe('audio/mpeg');
  });

  it('encodes stereo as well as mono', async () => {
    const mono = await encodeMp3([sine(440, 44100, 0.5)], 44100);
    const stereo = await encodeMp3([sine(440, 44100, 0.5), sine(660, 44100, 0.5)], 44100);

    expect(mono.size).toBeGreaterThan(0);
    expect(stereo.size).toBeGreaterThan(0);
  });

  it('lands near the size the bitrate implies', async () => {
    // Two seconds at 128 kbps is roughly 32 KB. A wide window, because the
    // encoder adds headers and the last frame is padded, but wrong enough
    // bitrate handling falls well outside it.
    const blob = await encodeMp3([sine(440, 44100, 2)], 44100, { bitrate: 128 });
    expect(blob.size).toBeGreaterThan(20_000);
    expect(blob.size).toBeLessThan(48_000);
  });

  it('gets bigger as the bitrate goes up', async () => {
    const low = await encodeMp3([sine(440, 44100, 1)], 44100, { bitrate: 128 });
    const high = await encodeMp3([sine(440, 44100, 1)], 44100, { bitrate: 320 });
    expect(high.size).toBeGreaterThan(low.size);
  });

  it('accepts every bitrate it offers', async () => {
    for (const bitrate of MP3_BITRATES) {
      const blob = await encodeMp3([sine(440, 44100, 0.2)], 44100, { bitrate });
      expect(blob.size).toBeGreaterThan(0);
    }
    expect(MP3_BITRATES).toContain(DEFAULT_BITRATE);
  });

  it('encodes a rate MP3 cannot carry by moving it first', async () => {
    // 40 kHz, which is what RVC answers at. Without the resample this either
    // fails or plays at the wrong speed.
    const blob = await encodeMp3([sine(440, 40000, 0.5)], 40000);
    const [first] = await firstBytes(blob);
    expect(first).toBe(0xff);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('encodes silence without complaint', async () => {
    const blob = await encodeMp3([new Float32Array(44100)], 44100);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('reports progress that ends at one', async () => {
    const seen: number[] = [];
    await encodeMp3([sine(440, 44100, 1)], 44100, {
      onProgress: (progress) => seen.push(progress.fraction),
    });

    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((f) => f > 0 && f <= 1)).toBe(true);
  });

  it('refuses more than two channels rather than dropping any', async () => {
    const five = Array.from({ length: 5 }, () => new Float32Array(1000));
    await expect(encodeMp3(five, 44100)).rejects.toThrow('mono or stereo');
  });

  it('refuses nothing at all', async () => {
    await expect(encodeMp3([], 44100)).rejects.toThrow('nothing to encode');
  });

  it('does not touch the source samples', async () => {
    const source = [sine(440, 44100, 0.3)];
    const before = Float32Array.from(source[0]!);
    await encodeMp3(source, 44100);
    expect(Array.from(source[0]!)).toEqual(Array.from(before));
  });
});
