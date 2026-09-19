/**
 * Summing stems back into one track.
 *
 * audio.cpp separates and nothing in it mixes, so this is Miso's own work. It
 * is only this short because of what a separation returns: every stem is the
 * same length, the same rate and the same channel count as the take it came
 * out of, so there is nothing to line up and nothing to convert. Summing is the
 * whole operation.
 *
 * The gains arrive already resolved. Solo and mute are questions about what you
 * are listening to, and `stemDeck.ts` answers them on the way in, so a muted
 * stem reaches here as a zero rather than as a flag this would have to
 * interpret a second time and possibly differently.
 */

export interface MixSource {
  channels: Float32Array[];
  /** What this stem is played at, 0 to 1, solo and mute already applied. */
  gain: number;
}

export interface MixResult {
  channels: Float32Array[];
  /**
   * How many samples landed outside the range and were held at the edge.
   *
   * Four stems at full fader sum to the take they came from, so clipping here
   * usually means somebody pushed a fader up rather than that anything is
   * wrong. Worth reporting rather than hiding, and not worth refusing over.
   */
  clipped: number;
}

/**
 * Sums stems into one track.
 *
 * Clamped rather than normalised. Normalising would quietly change the level of
 * a mix that did not clip, so the mix you save would not be the mix you heard,
 * which is the one thing this must not do.
 */
export function mixChannels(sources: MixSource[]): MixResult {
  const audible = sources.filter((source) => source.gain > 0 && source.channels.length > 0);
  if (audible.length === 0) return { channels: [new Float32Array(0)], clipped: 0 };

  const channelCount = audible.reduce((most, source) => Math.max(most, source.channels.length), 0);
  const frames = audible.reduce(
    (longest, source) =>
      Math.max(longest, ...source.channels.map((channel) => channel.length)),
    0,
  );

  const out: Float32Array[] = [];
  let clipped = 0;

  for (let c = 0; c < channelCount; c += 1) {
    const channel = new Float32Array(frames);

    for (const source of audible) {
      // A mono stem under a stereo one plays into both sides rather than into
      // the left only, which is what indexing past the end would give.
      const from = source.channels[c] ?? source.channels[source.channels.length - 1];
      if (!from) continue;

      for (let i = 0; i < from.length; i += 1) {
        channel[i] = channel[i]! + from[i]! * source.gain;
      }
    }

    for (let i = 0; i < frames; i += 1) {
      const value = channel[i]!;
      if (value > 1) {
        channel[i] = 1;
        clipped += 1;
      } else if (value < -1) {
        channel[i] = -1;
        clipped += 1;
      }
    }

    out.push(channel);
  }

  return { channels: out, clipped };
}
