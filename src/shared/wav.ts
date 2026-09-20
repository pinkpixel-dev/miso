/**
 * Writes the 16 bit PCM WAV that both sides of Miso produce.
 *
 * Only the writer is shared. The reader stayed on the service, in
 * `server/library/wav.ts`, because the browser has never needed it: Web Audio
 * decodes every format Miso accepts, WAV included, so a second WAV parser in
 * the client would be a parser with no caller.
 *
 * The writer is here because both sides do need it. The service writes a
 * resampled take before staging it, and the workbench writes whatever you
 * edited before uploading it. One copy means a file saved from the workbench
 * is byte for byte the kind of WAV the separation path already feeds to
 * audio.cpp.
 *
 * `DataView` rather than `Buffer`, which is the only reason this is a move and
 * not a re-export: `Buffer` is Node only. The service keeps a thin wrapper that
 * hands back a `Buffer` over this same memory, so nothing on that side had to
 * change.
 *
 * The return type names its backing store as an `ArrayBuffer` rather than
 * leaving it as `ArrayBufferLike`, because a `Blob` will not take a view that
 * might be over a `SharedArrayBuffer`, and handing these bytes to a `Blob` is
 * exactly what the browser side does with them.
 */

/** WAVE_FORMAT_PCM. The only thing written here. */
const PCM = 1;

/** Every WAV this writes has the same 44 byte canonical header. */
const HEADER_BYTES = 44;

const BYTES_PER_SAMPLE = 2;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Writes 16 bit PCM, which is what every take in the library already is.
 *
 * Rounding rather than truncating, and clamping at both ends: a resampled
 * sample can land a hair outside -1 to 1 where the original never did, and
 * letting that wrap turns a loud moment into a click.
 */
export function writeWav(channels: Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const count = channels.length;
  if (count === 0) throw new Error('A WAV needs at least one channel');

  const frames = channels[0]!.length;
  const dataBytes = frames * count * BYTES_PER_SAMPLE;
  const out = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(out.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * BYTES_PER_SAMPLE, true);
  view.setUint16(32, count * BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let at = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let c = 0; c < count; c += 1) {
      const value = Math.round((channels[c]![frame] ?? 0) * 32768);
      view.setInt16(at, Math.max(-32768, Math.min(32767, value)), true);
      at += BYTES_PER_SAMPLE;
    }
  }

  return out;
}

/**
 * How many bytes `writeWav` will produce, without producing them.
 *
 * The workbench asks before it encodes, because the import limit is 200 MB and
 * finding that out after building a 300 MB array in a browser tab is the worst
 * order to find it out in.
 */
export function wavByteLength(frames: number, channels: number): number {
  return HEADER_BYTES + frames * channels * BYTES_PER_SAMPLE;
}
