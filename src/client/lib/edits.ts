/**
 * What the workbench does to audio, as arithmetic over samples.
 *
 * The page holds the decoded source and an ordered list of these, and rendering
 * means applying the list to the source. That is why nothing here mutates its
 * input: undo drops the last entry and renders the whole list again from the
 * source, which only works if the source is still the source.
 *
 * Keeping a rendered buffer per undo step would be simpler and costs far too
 * much memory. Five minutes of 48 kHz stereo float is 115 MB, and that is one
 * step. A list of these is a few hundred bytes and gives unlimited undo.
 *
 * Positions are in seconds rather than frames, for the same reason
 * `compareSync.ts` uses seconds: a frame index means nothing without the rate
 * it was counted at, and the rate of what you are editing is not the rate you
 * are going to save at.
 */

/** How a fade gets from silence to full, or back. */
export type FadeCurve = 'linear' | 'exponential';

/**
 * One thing done to the audio.
 *
 * Sample rate is deliberately not in here. It is the one expensive operation,
 * seconds rather than milliseconds, and it has no interaction with where a fade
 * goes, so it is a property of the file being written rather than an edit.
 * Keeping it out means undoing a fade does not re-run the sinc filter.
 */
export type Edit =
  | { kind: 'trim'; start: number; end: number }
  | { kind: 'fadeIn'; seconds: number; curve: FadeCurve }
  | { kind: 'fadeOut'; seconds: number; curve: FadeCurve }
  | { kind: 'gain'; decibels: number }
  | { kind: 'normalize'; ceilingDecibels: number };

/** Below this, a float sample is silence as far as any of this is concerned. */
const SILENT = 1e-6;

/** Decibels to the factor you multiply a sample by. */
export function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20);
}

/** The factor back to decibels. Silence has no decibel value, so it reads as -Infinity. */
export function gainToDecibels(gain: number): number {
  return gain < SILENT ? Number.NEGATIVE_INFINITY : 20 * Math.log10(gain);
}

/** The loudest sample anywhere in the audio, which is what clipping is about. */
export function peakOf(channels: Float32Array[]): number {
  let highest = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const value = Math.abs(channel[i]!);
      if (value > highest) highest = value;
    }
  }
  return highest;
}

/** How long the audio is, which every control on the page needs. */
export function durationOf(channels: Float32Array[], sampleRate: number): number {
  return (channels[0]?.length ?? 0) / sampleRate;
}

/** Seconds to a frame index that is certainly inside the audio. */
function frameAt(seconds: number, sampleRate: number, frames: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(frames, Math.round(seconds * sampleRate)));
}

/**
 * Keeps the span between two points and throws the rest away.
 *
 * A region that ends before it starts is swapped rather than refused, because
 * the page can hand one over after a drag and a silent swap is what the region
 * editor already does.
 */
export function trim(
  channels: Float32Array[],
  sampleRate: number,
  start: number,
  end: number,
): Float32Array[] {
  const frames = channels[0]?.length ?? 0;
  const a = frameAt(start, sampleRate, frames);
  const b = frameAt(end, sampleRate, frames);
  const from = Math.min(a, b);
  const to = Math.max(a, b);

  if (from === 0 && to === frames) return channels;
  return channels.map((channel) => channel.slice(from, to));
}

/**
 * Cuts the audio in two at a point, keeping both sides.
 *
 * Not an `Edit`, because everything on the chain takes audio and gives back
 * audio, and this gives back two. It is what the split action runs, after the
 * chain and after the rate change, so each half is a clean cut through audio
 * that has already been through the filter once.
 *
 * A cut at either end throws rather than quietly producing an empty half. A
 * take with no samples in it is not a useful thing to write into a project.
 */
export function cutAt(
  channels: Float32Array[],
  sampleRate: number,
  seconds: number,
): [Float32Array[], Float32Array[]] {
  const frames = channels[0]?.length ?? 0;
  const at = frameAt(seconds, sampleRate, frames);

  if (at === 0 || at === frames) {
    throw new Error('The cut is at one end, so a split would leave nothing on one side.');
  }

  return [
    channels.map((channel) => channel.slice(0, at)),
    channels.map((channel) => channel.slice(at)),
  ];
}

/** The gain a fade is at, a fraction of the way through it. */
function fadeGain(progress: number, curve: FadeCurve): number {
  const t = Math.max(0, Math.min(1, progress));
  // A square law, which is the ordinary "exponential" fade: it leaves silence
  // slowly and arrives quickly, which sounds more even than a straight line
  // because hearing is not linear in amplitude.
  return curve === 'exponential' ? t * t : t;
}

/** Rises from silence to full over the first stretch of the audio. */
export function fadeIn(
  channels: Float32Array[],
  sampleRate: number,
  seconds: number,
  curve: FadeCurve,
): Float32Array[] {
  const frames = channels[0]?.length ?? 0;
  const over = frameAt(seconds, sampleRate, frames);
  if (over <= 0) return channels;

  return channels.map((channel) => {
    const out = Float32Array.from(channel);
    for (let i = 0; i < over; i += 1) out[i] = channel[i]! * fadeGain(i / over, curve);
    return out;
  });
}

/** Falls from full to silence over the last stretch of the audio. */
export function fadeOut(
  channels: Float32Array[],
  sampleRate: number,
  seconds: number,
  curve: FadeCurve,
): Float32Array[] {
  const frames = channels[0]?.length ?? 0;
  const over = frameAt(seconds, sampleRate, frames);
  if (over <= 0) return channels;

  const from = frames - over;
  return channels.map((channel) => {
    const out = Float32Array.from(channel);
    for (let i = from; i < frames; i += 1) {
      out[i] = channel[i]! * fadeGain((frames - 1 - i) / over, curve);
    }
    return out;
  });
}

/**
 * Multiplies everything by one factor.
 *
 * Nothing is clamped here. A gain that pushes past full scale is allowed to
 * stay past it in float, so that lowering it again gets the original back
 * rather than the flattened tops of what clipping would already have done.
 * `writeWav` is what clamps, once, at the point the samples become a file.
 */
export function gain(channels: Float32Array[], decibels: number): Float32Array[] {
  if (decibels === 0) return channels;
  const factor = decibelsToGain(decibels);

  return channels.map((channel) => {
    const out = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i += 1) out[i] = channel[i]! * factor;
    return out;
  });
}

/**
 * Brings the loudest sample up, or down, to a chosen ceiling.
 *
 * Peak normalization, not loudness normalization. It says nothing about how
 * loud the result sounds, only where the tallest sample lands, which is the
 * honest thing to offer without a loudness measure behind it.
 *
 * Silence comes back untouched. Scaling it would mean multiplying zero by
 * infinity to reach the ceiling, and a silent take is not a problem to fix.
 */
export function normalize(channels: Float32Array[], ceilingDecibels: number): Float32Array[] {
  const highest = peakOf(channels);
  if (highest < SILENT) return channels;

  const ceiling = decibelsToGain(Math.min(0, ceilingDecibels));
  return gain(channels, gainToDecibels(ceiling / highest));
}

/** Applies one edit. */
function applyEdit(
  channels: Float32Array[],
  sampleRate: number,
  edit: Edit,
): Float32Array[] {
  switch (edit.kind) {
    case 'trim':
      return trim(channels, sampleRate, edit.start, edit.end);
    case 'fadeIn':
      return fadeIn(channels, sampleRate, edit.seconds, edit.curve);
    case 'fadeOut':
      return fadeOut(channels, sampleRate, edit.seconds, edit.curve);
    case 'gain':
      return gain(channels, edit.decibels);
    case 'normalize':
      return normalize(channels, edit.ceilingDecibels);
  }
}

/**
 * Applies the whole chain, in order.
 *
 * Order is the point. A normalize before a fade and a normalize after one are
 * different results, and the list is what records which one you asked for.
 */
export function applyEdits(
  channels: Float32Array[],
  sampleRate: number,
  edits: readonly Edit[],
): Float32Array[] {
  let out = channels;
  for (const edit of edits) out = applyEdit(out, sampleRate, edit);
  return out;
}

/** What an edit is called in the list of what is currently applied. */
export function describeEdit(edit: Edit): string {
  switch (edit.kind) {
    case 'trim':
      return `Trimmed to ${edit.start.toFixed(2)}s to ${edit.end.toFixed(2)}s`;
    case 'fadeIn':
      return `${edit.curve === 'linear' ? 'Linear' : 'Exponential'} fade in over ${edit.seconds.toFixed(2)}s`;
    case 'fadeOut':
      return `${edit.curve === 'linear' ? 'Linear' : 'Exponential'} fade out over ${edit.seconds.toFixed(2)}s`;
    case 'gain':
      return `Gain ${edit.decibels > 0 ? '+' : ''}${edit.decibels.toFixed(1)} dB`;
    case 'normalize':
      return `Normalized to ${edit.ceilingDecibels.toFixed(1)} dB`;
  }
}
