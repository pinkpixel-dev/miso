import { driftedTooFar, flipPlan } from './compareSync.ts';

/**
 * The two things you do to a pair of takes that are playing the same song.
 *
 * `compareSync.ts` decides where the other side should be. This decides what to
 * do about it, which means touching wavesurfer. The split is worth keeping: the
 * plan is arithmetic and testable on its own, and the move is a handful of
 * calls in an order that matters.
 *
 * Neither function owns an instance or a lifetime. They are handed two takes
 * that already exist and are told to act on them. Whoever built those takes is
 * the thing that destroys them, which is the dock for one side of the dock's
 * compare, and the deck for both sides of the compare page.
 *
 * Both take instances rather than refs for the same reason. A ref is how an
 * owner holds something. These are not owners.
 */

/**
 * What either of these needs from a take.
 *
 * Structural rather than `WaveSurfer`, so a test can pass a small fake and so
 * nothing here can quietly start using the rest of the wavesurfer surface.
 */
export interface SyncedTake {
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  setTime: (seconds: number) => void;
  setVolume: (volume: number) => void;
  play: () => Promise<void>;
}

/**
 * Swap which of two takes you can hear.
 *
 * The arriving side is moved into place before either volume changes, so the
 * swap is never audible as a jump. Silencing is done with volume and never by
 * pausing: a paused side stops advancing, and the next flip would then have to
 * seek before it could start, which is the wait this whole feature exists to
 * avoid.
 *
 * The arriving side is only started if it was already meant to be running and
 * has something left to play. `flipPlan` is what decides that.
 */
export function applyFlip({ leaving, arriving }: { leaving: SyncedTake; arriving: SyncedTake }) {
  const plan = flipPlan({
    audibleTime: leaving.getCurrentTime(),
    playing: leaving.isPlaying(),
    arrivingDuration: arriving.getDuration(),
  });

  arriving.setTime(plan.time);
  arriving.setVolume(1);
  leaving.setVolume(0);
  if (plan.play && !arriving.isPlaying()) void arriving.play();
}

/**
 * Put the silent side back where the audible one is, but only if it has slipped
 * far enough to be worth it.
 *
 * The audible side drives and the silent side follows. Correcting continuously
 * would fight the audio clock, and a correction that lands on the side you can
 * hear is a stutter, so `driftedTooFar` holds the threshold.
 *
 * Nothing happens while the audible side is stopped. Two paused takes cannot
 * drift, and moving the silent one under a stopped player would only show up as
 * a jump on the next press.
 *
 * Answers whether it moved anything, which is what makes it testable without a
 * DOM and what a caller can log if this ever needs watching.
 */
export function correctDrift({
  audible,
  silent,
}: {
  audible: SyncedTake;
  silent: SyncedTake;
}): boolean {
  if (!audible.isPlaying()) return false;

  const at = audible.getCurrentTime();
  if (!driftedTooFar(at, silent.getCurrentTime())) return false;

  const plan = flipPlan({
    audibleTime: at,
    playing: true,
    arrivingDuration: silent.getDuration(),
  });

  silent.setTime(plan.time);
  if (plan.play && !silent.isPlaying()) void silent.play();
  return true;
}
