/**
 * The arithmetic behind the region editor.
 *
 * Pure functions rather than logic inside the component, because this is the
 * fiddly part: a boundary can be dragged past its partner, nudged off either
 * end of the track, or typed as nonsense, and all three have to end up with a
 * region the service will accept. There is no DOM test setup in this project,
 * so keeping the rules here is what makes them testable at all.
 */

/** A span of a track, in seconds. */
export interface Region {
  start: number;
  end: number;
}

/**
 * The shortest region worth asking for.
 *
 * The service refuses a region that ends where it starts. This keeps a drag or
 * a nudge from ever producing one, so the refusal is a backstop rather than
 * something people meet by moving a handle too far.
 */
export const MIN_REGION_SECONDS = 0.1;

/** One arrow key press. */
export const NUDGE_SECONDS = 0.1;

/** One arrow key press with shift held. */
export const COARSE_NUDGE_SECONDS = 1;

/** Rounds to the tenth the controls display, so the value and the label agree. */
function tidy(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/**
 * A region that fits inside the track and has some length to it.
 *
 * Order is fixed first, so a start dragged past the end reads as the two having
 * swapped rather than as an error. A track shorter than the minimum region is
 * possible in principle, and it gets the whole track rather than an empty span.
 */
export function clampRegion(region: Region, duration: number): Region {
  const limit = Math.max(0, duration);
  const low = Math.min(region.start, region.end);
  const high = Math.max(region.start, region.end);

  let start = Math.min(Math.max(0, low), limit);
  let end = Math.min(Math.max(0, high), limit);

  if (end - start < MIN_REGION_SECONDS) {
    if (start + MIN_REGION_SECONDS <= limit) {
      end = start + MIN_REGION_SECONDS;
    } else {
      start = Math.max(0, limit - MIN_REGION_SECONDS);
      end = limit;
    }
  }

  return { start: tidy(start), end: tidy(end) };
}

/**
 * Moves one edge and leaves the other alone.
 *
 * A boundary pushed into its partner stops at the minimum length rather than
 * crossing over. Crossing would silently turn a nudge of the start into a
 * change of the end, which is not what the key press said.
 */
export function moveBoundary(
  region: Region,
  side: 'start' | 'end',
  delta: number,
  duration: number,
): Region {
  const limit = Math.max(0, duration);

  if (side === 'start') {
    const ceiling = region.end - MIN_REGION_SECONDS;
    const start = Math.min(Math.max(0, region.start + delta), Math.max(0, ceiling));
    return { start: tidy(start), end: tidy(region.end) };
  }

  const floor = region.start + MIN_REGION_SECONDS;
  const end = Math.max(Math.min(limit, region.end + delta), Math.min(floor, limit));
  return { start: tidy(region.start), end: tidy(end) };
}

/**
 * The region a track opens with: the middle third, or the whole thing when it
 * is too short to have a middle worth speaking of.
 *
 * Opening on a region rather than nothing means the page has something to
 * demonstrate and the form has valid values from the first frame.
 */
export function defaultRegion(duration: number): Region {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: MIN_REGION_SECONDS };
  return clampRegion({ start: duration / 3, end: (duration * 2) / 3 }, duration);
}

/** Seconds as m:ss.t, so a tenth of a second is readable on screen. */
export function formatSeconds(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
