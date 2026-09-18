/**
 * Keeping two takes of the same song at the same point in it.
 *
 * Everything here works in seconds and nothing converts a position to a sample
 * index. That is not a stylistic choice. Measured on September 17, 2026 across
 * the 13 derived takes in the development database, a repaint comes back at a
 * different sample rate from its source in 11 of them, 44100 in and 48000 out,
 * while the duration is preserved to within 24 milliseconds. So audio.cpp
 * resamples rather than reinterpreting, the two takes line up in time, and they
 * do not line up in samples. Seconds are the thing both sides agree on.
 *
 * The residual is the reason `clampTo` exists. A take can be a few hundredths
 * of a second shorter than the one it was made from, so the far end of a long
 * take is the one place a position from one side is not a position the other
 * side has.
 */

/** Where the arriving take should be put, and whether it should run. */
export interface FlipPlan {
  /** A position the arriving take actually has. */
  time: number;
  /** False when there is nothing left of the arriving take to play. */
  play: boolean;
}

/** A position inside a take, whatever the caller asked for. */
export function clampTo(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(seconds, duration);
}

/**
 * What to do with the take being flipped to.
 *
 * It lands where the take being flipped away from was, unless that position is
 * past its end, in which case it lands at its end and does not start. Asking a
 * take to play from a point it does not have is how a flip near the end turns
 * into silence with the transport still claiming to run.
 */
export function flipPlan({
  audibleTime,
  playing,
  arrivingDuration,
}: {
  audibleTime: number;
  playing: boolean;
  arrivingDuration: number;
}): FlipPlan {
  const time = clampTo(audibleTime, arrivingDuration);
  return { time, play: playing && time < arrivingDuration };
}

/**
 * Whether the silent side has slipped far enough to be worth moving.
 *
 * Both sides run on their own media clocks, so they drift. Correcting every
 * frame would fight the audio clock and is audible as a stutter the moment a
 * correction lands on the side you can hear. Correcting only past a threshold
 * leaves a flip landing within a tolerance nobody can detect.
 *
 * The default is a fortieth of a second, which is the same order as the worst
 * duration difference measured between a take and the take it was made from.
 * Below that, moving the silent side would be correcting for the takes
 * themselves rather than for drift.
 */
export function driftedTooFar(audibleTime: number, silentTime: number, tolerance = 0.025): boolean {
  if (!Number.isFinite(audibleTime) || !Number.isFinite(silentTime)) return false;
  return Math.abs(audibleTime - silentTime) > tolerance;
}
