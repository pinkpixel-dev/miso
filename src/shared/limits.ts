import type { AssetFormat } from './types.ts';

/**
 * The three numbers phase 3 enforces in more than one place. They live here so
 * a change lands everywhere at once, including in the message a user reads.
 */

/** 200 MB. Fits a long uncompressed WAV. There is no resumable upload. */
export const MAX_ASSET_BYTES = 200 * 1024 * 1024;

/** Readable by music-metadata and decodable by Web Audio in current browsers. */
export const ACCEPTED_FORMATS: readonly AssetFormat[] = ['wav', 'flac', 'mp3', 'm4a'];

/** Peak buckets per channel. The browser produces exactly this many. */
export const PEAK_BUCKETS = 2048;

export function isAcceptedFormat(value: string): value is AssetFormat {
  return (ACCEPTED_FORMATS as readonly string[]).includes(value);
}
