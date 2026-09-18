import { clampTo, driftedTooFar, flipPlan } from './compareSync.ts';

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
  pause: () => void;
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

/**
 * Put a take that has just finished loading into the pair.
 *
 * It lands where the other side already is, so picking a second take while the
 * first one plays drops you into the same moment of the song rather than at the
 * beginning. That is the whole reason somebody opened a compare.
 *
 * The volume is set after the seek, for the same reason `applyFlip` does it in
 * that order: a side raised to full before it has been moved is a moment of the
 * wrong position at full volume.
 *
 * With no other side yet, there is nothing to line up against and the take just
 * waits at its start.
 */
export function placeArrival({
  arriving,
  other,
  audible,
}: {
  arriving: SyncedTake;
  /** The side already loaded, when there is one. */
  other: SyncedTake | undefined;
  /** Whether the arriving take is the one that should be heard. */
  audible: boolean;
}) {
  if (other) {
    const plan = flipPlan({
      audibleTime: other.getCurrentTime(),
      playing: other.isPlaying(),
      arrivingDuration: arriving.getDuration(),
    });
    arriving.setTime(plan.time);
    if (plan.play && !arriving.isPlaying()) void arriving.play();
  }

  arriving.setVolume(audible ? 1 : 0);
}

/**
 * Start both sides.
 *
 * The silent side is put in step before either starts, because it is about to
 * run for real and a side that resumes from where it was left is a side the
 * next flip lands wrong.
 *
 * `correctDrift` cannot do this job. It returns early while the audible side is
 * stopped, which is exactly the state a resume begins from.
 */
export function playBoth({ audible, silent }: { audible: SyncedTake; silent?: SyncedTake }) {
  if (silent) {
    const plan = flipPlan({
      audibleTime: audible.getCurrentTime(),
      playing: true,
      arrivingDuration: silent.getDuration(),
    });
    silent.setTime(plan.time);
    if (plan.play && !silent.isPlaying()) void silent.play();
  }

  if (!audible.isPlaying()) void audible.play();
}

/** Stop both sides, so neither advances past the other while paused. */
export function pauseBoth({ audible, silent }: { audible: SyncedTake; silent?: SyncedTake }) {
  audible.pause();
  silent?.pause();
}

/**
 * Move both sides to the same moment.
 *
 * Each is clamped against its own length rather than a shared one, because two
 * takes picked by hand can be any two lengths. Scrubbing past the end of the
 * shorter one leaves it parked at its end, which is the same thing a flip does
 * there.
 */
export function seekBoth({
  audible,
  silent,
  seconds,
}: {
  audible: SyncedTake;
  silent?: SyncedTake;
  seconds: number;
}) {
  audible.setTime(clampTo(seconds, audible.getDuration()));
  if (silent) silent.setTime(clampTo(seconds, silent.getDuration()));
}
