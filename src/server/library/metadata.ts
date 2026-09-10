import { parseFile } from 'music-metadata';
import type { AssetFormat } from '../../shared/types.ts';
import { isAcceptedFormat } from '../../shared/limits.ts';

/**
 * Duration, sample rate, and channel count, read without a media subprocess.
 *
 * music-metadata is pure JavaScript, so this behaves the same on a workstation
 * and on a NAS. Spawning ffprobe would be more accurate on exotic codecs and
 * would fail entirely wherever ffmpeg is not installed.
 *
 * This is also the format check. The container the parser reports is what
 * decides the format, never the filename, so a .wav that is secretly something
 * else is rejected here rather than stored and played back as noise.
 */

export interface AudioFacts {
  format: AssetFormat;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
}

export type AudioFactsResult = { ok: true; value: AudioFacts } | { ok: false; detected: string };

/**
 * Container strings to Miso formats. Confirmed by the fixture tests rather than
 * assumed. If a real file reports a container that is not here, add it, and add
 * a fixture with it.
 *
 * Observed directly from music-metadata 11.15.0 against the ffmpeg-built
 * fixtures in this directory (WAV, FLAC, MP3 straight-line; M4A muxed by
 * ffmpeg's ipod/mp4 muxer with AAC audio):
 * - WAV reports container "WAVE".
 * - FLAC reports container "FLAC".
 * - MP3 reports container "MPEG".
 * - M4A reports container "M4A/isom/iso2", not a bare "M4A" or "MPEG-4".
 *
 * Only entries that have actually been observed, or that are distinctive
 * enough to prefix-match safely, are kept here. Generic ISO base media brand
 * codes such as "isom" and "mp42" are deliberately absent: an ordinary MP4
 * video with an AAC audio track also reports a container beginning with
 * "isom", and matching on that would silently accept a video file as m4a.
 * "MPEG-4" is likewise absent from the prefix set for a related reason: the
 * string "MPEG-4" itself starts with "MPEG", so keeping "MPEG" loose would
 * misclassify an MP4 container as mp3.
 */
const CONTAINERS: Record<string, AssetFormat> = {
  WAVE: 'wav',
  RIFF: 'wav',
  FLAC: 'flac',
  MPEG: 'mp3',
  'M4A/isom/iso2': 'm4a',
  M4A: 'm4a',
};

/**
 * Keys distinctive enough to prefix-match without risking a false accept.
 * MPEG is deliberately excluded: "MPEG-4" starts with "MPEG", so a loose
 * MPEG prefix would classify an MP4 container as mp3. MPEG is exact-match
 * only, via the CONTAINERS lookup above.
 */
const PREFIX_KEYS: readonly string[] = ['WAVE', 'RIFF', 'FLAC', 'M4A'];

function toFormat(container: string | undefined, codec: string | undefined): AssetFormat | undefined {
  if (container && CONTAINERS[container]) return CONTAINERS[container];

  // Some containers arrive with a trailing space or a version suffix. Fall
  // back to a prefix match against only the distinctive keys, never the
  // generic ones, and never MPEG (see PREFIX_KEYS above).
  const normalised = container?.trim().toUpperCase() ?? '';
  for (const key of PREFIX_KEYS) {
    if (normalised.startsWith(key)) return CONTAINERS[key];
  }

  // The codec fallback only fires once the container has already shown
  // itself to be part of the M4A family. Checking the codec alone would
  // readmit a video file whose container was rejected above but whose audio
  // track happens to be AAC.
  if (normalised.startsWith('M4A') && codec && codec.toUpperCase().includes('AAC')) return 'm4a';

  return undefined;
}

export async function readAudioFacts(path: string): Promise<AudioFactsResult> {
  let parsed;
  try {
    parsed = await parseFile(path);
  } catch (error) {
    return { ok: false, detected: error instanceof Error ? error.message : 'unreadable file' };
  }

  const { container, codec, duration, sampleRate, numberOfChannels } = parsed.format;
  const format = toFormat(container, codec);

  if (!format || !isAcceptedFormat(format)) {
    return { ok: false, detected: container ?? codec ?? 'unknown format' };
  }

  return {
    ok: true,
    value: {
      format,
      durationSeconds: duration,
      sampleRate,
      channels: numberOfChannels,
    },
  };
}
