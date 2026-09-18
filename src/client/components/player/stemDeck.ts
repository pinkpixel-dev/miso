import type { SyncedTake } from './compareDeck.ts';
import { clampTo, driftedTooFar } from './compareSync.ts';

/**
 * Several stems of one take, all playing at once.
 *
 * This is the third caller of `SyncedTake` and the second thing in Miso that
 * keeps takes in step, so it is worth saying what it does not share with the
 * compare deck. There, two takes are picked by hand, they can be any two
 * lengths, and exactly one is audible at a time. Here every stem came out of
 * one separation, every one is the same length as the source, and all of them
 * are meant to be heard together. `applyFlip` and its neighbours are written
 * around an audible side and a silent one, which is a distinction that does not
 * exist in a mix.
 *
 * What is shared is what is genuinely the same: the `SyncedTake` shape, the
 * clamp, and the drift threshold. Those are in `compareSync.ts` and are
 * arithmetic either way.
 *
 * The rule the two decks do share: a stem is silenced with volume and never by
 * pausing. A paused stem stops advancing, and unmuting it would then need a
 * seek before it could make a sound.
 */

export interface StemControls {
  /** The fader, 0 to 1. */
  volume: number;
  muted: boolean;
  soloed: boolean;
}

export const DEFAULT_CONTROLS: StemControls = { volume: 1, muted: false, soloed: false };

/** Whether anything at all is soloed, which changes what every other stem does. */
export function anySoloed(controls: Iterable<StemControls>): boolean {
  for (const entry of controls) {
    if (entry.soloed) return true;
  }
  return false;
}

/**
 * What one stem should actually be played at.
 *
 * Solo wins over mute, and it wins in both directions: a soloed stem is heard
 * even if it is also muted, and every stem that is not soloed is silent while
 * anything is. That is what solo means on a desk, and it is why releasing the
 * last solo puts the previous mutes back rather than having thrown them away.
 *
 * The fader still applies to a soloed stem. Solo decides what you hear, not how
 * loud it is.
 */
export function gainFor(controls: StemControls, soloing: boolean): number {
  if (soloing) return controls.soloed ? clampGain(controls.volume) : 0;
  return controls.muted ? 0 : clampGain(controls.volume);
}

function clampGain(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume));
}

/** Every stem's gain, with the solo question asked once for the set. */
export function gainsFor(controls: Map<string, StemControls>): Map<string, number> {
  const soloing = anySoloed(controls.values());
  const gains = new Map<string, number>();
  for (const [id, entry] of controls) gains.set(id, gainFor(entry, soloing));
  return gains;
}

/** Puts the gains onto the takes that are actually loaded. */
export function applyGains(
  takes: Map<string, SyncedTake>,
  controls: Map<string, StemControls>,
): void {
  for (const [id, gain] of gainsFor(controls)) {
    takes.get(id)?.setVolume(gain);
  }
}

/**
 * Start every stem, from wherever the leader is.
 *
 * Followers are put in step before anything starts rather than resumed from
 * where they were left. Four stems left at four slightly different positions
 * and then started together is a mix that is out by a few hundredths of a
 * second, which on a drum track is audible as a flam.
 */
export function playAll({ leader, followers }: { leader: SyncedTake; followers: SyncedTake[] }): void {
  const at = leader.getCurrentTime();

  for (const follower of followers) {
    follower.setTime(clampTo(at, follower.getDuration()));
    if (!follower.isPlaying()) void follower.play();
  }

  if (!leader.isPlaying()) void leader.play();
}

/** Stop every stem, so none advances past the others while paused. */
export function pauseAll(takes: SyncedTake[]): void {
  for (const take of takes) take.pause();
}

/** Move every stem to the same moment, each clamped against its own length. */
export function seekAll(takes: SyncedTake[], seconds: number): void {
  for (const take of takes) take.setTime(clampTo(seconds, take.getDuration()));
}

/**
 * Put any stem that has slipped back in line with the leader.
 *
 * Every stem runs on its own media clock, so four of them drift apart from each
 * other as well as from the leader. Correcting continuously would fight the
 * audio clock on all of them at once, so the same threshold the compare deck
 * uses holds here.
 *
 * Nothing happens while the leader is stopped, because stopped stems cannot
 * drift and a correction under a paused player is a jump on the next press.
 *
 * Answers how many it moved, which is what makes it testable without a DOM.
 */
export function correctFollowers({
  leader,
  followers,
}: {
  leader: SyncedTake;
  followers: SyncedTake[];
}): number {
  if (!leader.isPlaying()) return 0;

  const at = leader.getCurrentTime();
  let moved = 0;

  for (const follower of followers) {
    if (!driftedTooFar(at, follower.getCurrentTime())) continue;
    follower.setTime(clampTo(at, follower.getDuration()));
    if (!follower.isPlaying()) void follower.play();
    moved += 1;
  }

  return moved;
}

/**
 * Put a stem that has just finished loading in step with the rest.
 *
 * Stems of one separation load at their own pace, and the fourth one arriving
 * while the first three already play has to land where they are rather than at
 * the beginning.
 */
export function placeStem({
  arriving,
  leader,
  gain,
}: {
  arriving: SyncedTake;
  /** A stem already loaded, when there is one. */
  leader: SyncedTake | undefined;
  gain: number;
}): void {
  if (leader) {
    const at = clampTo(leader.getCurrentTime(), arriving.getDuration());
    arriving.setTime(at);
    if (leader.isPlaying() && at < arriving.getDuration() && !arriving.isPlaying()) {
      void arriving.play();
    }
  }

  // After the seek, for the reason the compare deck sets volume last: a stem
  // raised before it has been moved is a moment of the wrong position out loud.
  arriving.setVolume(gain);
}
