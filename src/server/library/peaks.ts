import { PEAK_BUCKETS } from '../../shared/limits.ts';

/**
 * Checks peaks before they are stored.
 *
 * Peaks are the one thing in the library a browser computes and the server
 * takes on trust, so they are checked rather than trusted. A malformed payload
 * is rejected without touching the stored asset, and a payload that is merely
 * enormous is rejected by shape before it can cost memory.
 */

const MAX_CHANNELS = 4;

export type PeaksResult = { ok: true; value: number[][] } | { ok: false; error: string };

export function validatePeaks(input: unknown): PeaksResult {
  if (!Array.isArray(input)) return { ok: false, error: 'Peaks must be an array of channels' };

  if (input.length === 0) return { ok: false, error: 'Peaks must have at least one channel' };
  if (input.length > MAX_CHANNELS) {
    return { ok: false, error: `Peaks cannot have more than ${MAX_CHANNELS} channels` };
  }

  const value: number[][] = [];

  for (const [index, channel] of input.entries()) {
    if (!Array.isArray(channel)) {
      return { ok: false, error: `Channel ${index} is not an array` };
    }
    if (channel.length !== PEAK_BUCKETS) {
      return {
        ok: false,
        error: `Channel ${index} has ${channel.length} values, expected ${PEAK_BUCKETS}`,
      };
    }

    for (const sample of channel) {
      if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < -1 || sample > 1) {
        return { ok: false, error: `Channel ${index} holds a value outside -1 to 1` };
      }
    }

    value.push(channel as number[]);
  }

  return { ok: true, value };
}
