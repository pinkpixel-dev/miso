import { PEAK_BUCKETS } from '../../shared/limits.ts';
import { bucketPeaks } from '../../shared/peaks.ts';

/**
 * Reads the waveform out of a PCM WAV.
 *
 * This exists because a generated take arrives as a WAV the service already
 * holds in memory. Drawing its waveform in the browser instead means every
 * device that opens the project downloads the whole file and decodes it: three
 * minutes of 48 kHz stereo is 34 MB down the wire and about 70 MB of decoded
 * float to throw away afterwards. Reading it here costs one pass over bytes
 * that are already in hand, and the take arrives with its waveform drawn.
 *
 * This is not an audio decoder and is not the start of one. It reads the sample
 * format audio.cpp writes and nothing else. Imported mp3, flac, and m4a still
 * go to the browser, which has a real decoder, and that split is the reason no
 * decoding dependency is needed on this side.
 *
 * Anything it does not recognise returns undefined, which is not a failure:
 * peaks are nullable, the take is complete without them, and Draw waveform
 * still works. A take with no waveform is worth far less than a generation
 * thrown away over one.
 */

/** WAVE_FORMAT_PCM and WAVE_FORMAT_IEEE_FLOAT, the two audio.cpp writes. */
const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

interface Format {
  format: number;
  channels: number;
  bitsPerSample: number;
}

/**
 * Walks the RIFF chunks for `fmt ` and `data`.
 *
 * Chunks are walked rather than assumed at fixed offsets. A WAV is allowed to
 * carry LIST or fact chunks before its data, and a reader that assumes the
 * samples start at byte 44 reads metadata as audio the moment one appears.
 */
function findChunks(bytes: Buffer): { format: Format; data: Buffer } | undefined {
  if (bytes.length < 12) return undefined;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') return undefined;
  if (bytes.toString('ascii', 8, 12) !== 'WAVE') return undefined;

  let format: Format | undefined;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ' && size >= 16 && body + 16 <= bytes.length) {
      let code = bytes.readUInt16LE(body);
      const channels = bytes.readUInt16LE(body + 2);
      const bitsPerSample = bytes.readUInt16LE(body + 14);

      // An extensible header carries the real format code in its extension.
      if (code === EXTENSIBLE && size >= 40 && body + 26 <= bytes.length) {
        code = bytes.readUInt16LE(body + 24);
      }

      format = { format: code, channels, bitsPerSample };
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
function readSamples(format: Format, data: Buffer): Float32Array[] | undefined {
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

/** The waveform for a WAV, or undefined for anything this cannot read. */
export function peaksFromWav(bytes: Buffer): number[][] | undefined {
  const chunks = findChunks(bytes);
  if (!chunks) return undefined;

  const samples = readSamples(chunks.format, chunks.data);
  if (!samples) return undefined;

  return bucketPeaks(samples, PEAK_BUCKETS);
}
