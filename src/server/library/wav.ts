/**
 * Reads and writes the PCM WAV that audio.cpp speaks.
 *
 * This is not an audio decoder and is not the start of one. It reads the sample
 * formats audio.cpp writes and nothing else, which is the same limit
 * `wavPeaks.ts` has always had: imported mp3, flac and m4a go to the browser,
 * which has a real decoder, and that split is why no decoding dependency is
 * needed on this side.
 *
 * It lives apart from `wavPeaks.ts` because two callers now want the samples.
 * Peaks wants them to draw a picture. Resampling wants them to write a new
 * file. Both want the same chunk walk, and one copy of it is easier to trust
 * than two.
 */

/** WAVE_FORMAT_PCM and WAVE_FORMAT_IEEE_FLOAT, the two audio.cpp writes. */
const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

export interface WavFormat {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export interface WavAudio {
  /** One array per channel, scaled to -1 to 1. */
  channels: Float32Array[];
  sampleRate: number;
}

/**
 * Walks the RIFF chunks for `fmt ` and `data`.
 *
 * Chunks are walked rather than assumed at fixed offsets. A WAV is allowed to
 * carry LIST or fact chunks before its data, and a reader that assumes the
 * samples start at byte 44 reads metadata as audio the moment one appears.
 */
export function findChunks(bytes: Buffer): { format: WavFormat; data: Buffer } | undefined {
  if (bytes.length < 12) return undefined;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') return undefined;
  if (bytes.toString('ascii', 8, 12) !== 'WAVE') return undefined;

  let format: WavFormat | undefined;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ' && size >= 16 && body + 16 <= bytes.length) {
      let code = bytes.readUInt16LE(body);
      const channels = bytes.readUInt16LE(body + 2);
      const sampleRate = bytes.readUInt32LE(body + 4);
      const bitsPerSample = bytes.readUInt16LE(body + 14);

      // An extensible header carries the real format code in its extension.
      if (code === EXTENSIBLE && size >= 40 && body + 26 <= bytes.length) {
        code = bytes.readUInt16LE(body + 24);
      }

      format = { format: code, channels, sampleRate, bitsPerSample };
    }

    if (id === 'data') {
      if (!format) return undefined;
      // A truncated file still has usable audio up to where it stops, and the
      // declared size can exceed what is actually here.
      const end = Math.min(bytes.length, body + size);
      return { format, data: bytes.subarray(body, end) };
    }

    // Chunks are word aligned, so an odd size is followed by a pad byte.
    offset = body + size + (size % 2);
  }

  return undefined;
}

/** Deinterleaves to one array per channel, scaled to -1 to 1. */
export function readSamples(format: WavFormat, data: Buffer): Float32Array[] | undefined {
  const { channels, bitsPerSample } = format;
  if (channels < 1 || channels > 4) return undefined;

  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample === 0) return undefined;

  const frames = Math.floor(data.length / (bytesPerSample * channels));
  if (frames === 0) return undefined;

  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) out.push(new Float32Array(frames));

  const stride = bytesPerSample * channels;

  for (let frame = 0; frame < frames; frame += 1) {
    const base = frame * stride;

    for (let c = 0; c < channels; c += 1) {
      const at = base + c * bytesPerSample;
      let value: number;

      if (format.format === FLOAT && bitsPerSample === 32) {
        value = data.readFloatLE(at);
      } else if (format.format === PCM && bitsPerSample === 16) {
        value = data.readInt16LE(at) / 32768;
      } else if (format.format === PCM && bitsPerSample === 24) {
        // No readInt24, so the three bytes are assembled and sign extended.
        const raw = data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16);
        value = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608;
      } else if (format.format === PCM && bitsPerSample === 32) {
        value = data.readInt32LE(at) / 2147483648;
      } else if (format.format === PCM && bitsPerSample === 8) {
        // 8-bit WAV samples are unsigned, centred on 128.
        value = (data[at]! - 128) / 128;
      } else {
        return undefined;
      }

      out[c]![frame] = value;
    }
  }

  return out;
}

/** A PCM WAV as channels and a rate, or undefined for anything this cannot read. */
export function readWav(bytes: Buffer): WavAudio | undefined {
  const chunks = findChunks(bytes);
  if (!chunks) return undefined;

  const channels = readSamples(chunks.format, chunks.data);
  if (!channels) return undefined;

  return { channels, sampleRate: chunks.format.sampleRate };
}

/**
 * Writes 16 bit PCM, which is what every take in the library already is.
 *
 * Rounding rather than truncating, and clamping at both ends: a resampled
 * sample can land a hair outside -1 to 1 where the original never did, and
 * letting that wrap turns a loud moment into a click.
 */
export function writeWav(channels: Float32Array[], sampleRate: number): Buffer {
  const count = channels.length;
  if (count === 0) throw new Error('A WAV needs at least one channel');

  const frames = channels[0]!.length;
  const bytesPerSample = 2;
  const dataBytes = frames * count * bytesPerSample;
  const out = Buffer.alloc(44 + dataBytes);

  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(PCM, 20);
  out.writeUInt16LE(count, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * count * bytesPerSample, 28);
  out.writeUInt16LE(count * bytesPerSample, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(dataBytes, 40);

  let at = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let c = 0; c < count; c += 1) {
      const value = Math.round((channels[c]![frame] ?? 0) * 32768);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), at);
      at += bytesPerSample;
    }
  }

  return out;
}
