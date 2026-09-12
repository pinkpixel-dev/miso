import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PEAK_BUCKETS } from '../../shared/limits.ts';
import { validatePeaks } from './peaks.ts';
import { peaksFromWav } from './wavPeaks.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Builds a WAV in memory so each sample format can be checked exactly. */
function wav(options: {
  format?: number;
  bits?: number;
  channels?: number;
  frames: number;
  write: (buffer: Buffer, offset: number, frame: number, channel: number) => void;
  extraChunk?: boolean;
}): Buffer {
  const format = options.format ?? 1;
  const bits = options.bits ?? 16;
  const channels = options.channels ?? 1;
  const bytesPerSample = bits / 8;
  const dataSize = options.frames * channels * bytesPerSample;

  const extra = options.extraChunk ? Buffer.alloc(8 + 10) : Buffer.alloc(0);
  if (options.extraChunk) {
    extra.write('LIST', 0, 'ascii');
    extra.writeUInt32LE(10, 4);
  }

  const header = Buffer.alloc(12 + 24 + extra.length + 8);
  let at = 0;
  header.write('RIFF', at, 'ascii');
  header.writeUInt32LE(36 + dataSize, at + 4);
  header.write('WAVE', at + 8, 'ascii');
  at += 12;

  header.write('fmt ', at, 'ascii');
  header.writeUInt32LE(16, at + 4);
  header.writeUInt16LE(format, at + 8);
  header.writeUInt16LE(channels, at + 10);
  header.writeUInt32LE(48000, at + 12);
  header.writeUInt32LE(48000 * channels * bytesPerSample, at + 16);
  header.writeUInt16LE(channels * bytesPerSample, at + 20);
  header.writeUInt16LE(bits, at + 22);
  at += 24;

  extra.copy(header, at);
  at += extra.length;

  header.write('data', at, 'ascii');
  header.writeUInt32LE(dataSize, at + 4);

  const data = Buffer.alloc(dataSize);
  for (let frame = 0; frame < options.frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      options.write(data, (frame * channels + channel) * bytesPerSample, frame, channel);
    }
  }

  return Buffer.concat([header, data]);
}

describe('peaksFromWav', () => {
  it('answers with the bucket count the validator demands', () => {
    const bytes = wav({ frames: 96_000, write: (b, o) => b.writeInt16LE(16384, o) });
    const peaks = peaksFromWav(bytes);

    expect(peaks).toBeDefined();
    expect(peaks).toHaveLength(1);
    expect(peaks?.[0]).toHaveLength(PEAK_BUCKETS);
    expect(validatePeaks(peaks)).toMatchObject({ ok: true });
  });

  it('scales 16-bit samples to full scale', () => {
    const bytes = wav({ frames: 8192, write: (b, o) => b.writeInt16LE(32767, o) });
    expect(peaksFromWav(bytes)?.[0]?.[0]).toBe(1);
  });

  it('reads a trough as loudly as a crest', () => {
    // Every sample is negative. A reader taking the maximum rather than the
    // magnitude would draw silence here.
    const bytes = wav({ frames: 8192, write: (b, o) => b.writeInt16LE(-32768, o) });
    expect(peaksFromWav(bytes)?.[0]?.[0]).toBe(1);
  });

  it('keeps the channels apart', () => {
    const bytes = wav({
      channels: 2,
      frames: 8192,
      write: (b, o, _frame, channel) => b.writeInt16LE(channel === 0 ? 32767 : 0, o),
    });
    const peaks = peaksFromWav(bytes);

    expect(peaks).toHaveLength(2);
    expect(peaks?.[0]?.[0]).toBe(1);
    expect(peaks?.[1]?.[0]).toBe(0);
  });

  it('reads 32-bit float, 24-bit, 32-bit, and 8-bit samples', () => {
    expect(peaksFromWav(wav({ format: 3, bits: 32, frames: 8192, write: (b, o) => b.writeFloatLE(0.5, o) }))?.[0]?.[0]).toBe(0.5);
    expect(peaksFromWav(wav({ bits: 32, frames: 8192, write: (b, o) => b.writeInt32LE(1073741824, o) }))?.[0]?.[0]).toBe(0.5);
    expect(peaksFromWav(wav({ bits: 8, frames: 8192, write: (b, o) => { b[o] = 192; } }))?.[0]?.[0]).toBe(0.5);

    const bits24 = wav({
      bits: 24,
      frames: 8192,
      write: (b, o) => {
        b[o] = 0x00;
        b[o + 1] = 0x00;
        b[o + 2] = 0x40;
      },
    });
    expect(peaksFromWav(bits24)?.[0]?.[0]).toBe(0.5);
  });

  it('sign extends a negative 24-bit sample instead of reading it as loud', () => {
    const bytes = wav({
      bits: 24,
      frames: 8192,
      write: (b, o) => {
        b[o] = 0x00;
        b[o + 1] = 0x00;
        b[o + 2] = 0xc0;
      },
    });
    expect(peaksFromWav(bytes)?.[0]?.[0]).toBe(0.5);
  });

  it('walks past a chunk it does not care about', () => {
    // A reader that assumed the samples start at byte 44 would read this LIST
    // chunk as audio.
    const bytes = wav({ frames: 8192, extraChunk: true, write: (b, o) => b.writeInt16LE(32767, o) });
    expect(peaksFromWav(bytes)?.[0]?.[0]).toBe(1);
  });

  it('reads what is there when the file was cut short of its declared size', () => {
    const full = wav({ frames: 8192, write: (b, o) => b.writeInt16LE(32767, o) });
    expect(peaksFromWav(full.subarray(0, full.length - 4000))?.[0]?.[0]).toBe(1);
  });

  it('gives up quietly on anything it cannot read', () => {
    expect(peaksFromWav(Buffer.alloc(0))).toBeUndefined();
    expect(peaksFromWav(Buffer.from('not a wav at all'))).toBeUndefined();
    expect(peaksFromWav(readFileSync(join(fixtures, 'tone.mp3')))).toBeUndefined();
    // A real WAV in a sample format this does not read.
    expect(peaksFromWav(wav({ bits: 64, format: 3, frames: 64, write: (b, o) => b.writeDoubleLE(0.5, o) }))).toBeUndefined();
  });

  it('reads a WAV written by a real encoder', () => {
    const peaks = peaksFromWav(readFileSync(join(fixtures, 'tone.wav')));

    expect(validatePeaks(peaks)).toMatchObject({ ok: true });
    expect(peaks?.[0]?.some((value) => value > 0)).toBe(true);
  });
});
