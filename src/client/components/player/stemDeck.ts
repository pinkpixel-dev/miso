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

/**
 * Solo exactly one stem and release every other.
 *
 * This is what a stem's own play button does. Hearing one stem on its own is
 * the common reason to touch a mix at all, and doing it through the solo
 * buttons means releasing however many are already lit first.
 *
 * Mutes are left alone. Solo already overrides them while it is on, and they
 * come back when it is released, which is the behaviour the buttons promise.
 */
export function soloOnly(
  controls: Map<string, StemControls>,
  id: string,
  /**
   * Every stem that should end up in the answer, which is not always every
   * stem already in `controls`. A stem missing from the map would otherwise
   * stay unsoloed and keep playing, which reads as a play button that does
   * nothing while the mute button beside it works.
   */
  ids: Iterable<string> = controls.keys(),
): Map<string, StemControls> {
  const next = new Map<string, StemControls>();
  for (const key of ids) {
    next.set(key, { ...(controls.get(key) ?? DEFAULT_CONTROLS), soloed: key === id });
  }
  for (const [key, entry] of controls) {
    if (!next.has(key)) next.set(key, { ...entry, soloed: key === id });
  }
  return next;
}

/** Whether this stem is the only one soloed, which is what its play button shows. */
export function isOnlySolo(controls: Map<string, StemControls>, id: string): boolean {
  let found = false;
  for (const [key, entry] of controls) {
    if (entry.soloed && key !== id) return false;
    if (entry.soloed && key === id) found = true;
  }
  return found;
}

/** Every stem's gain, with the solo question asked once for the set. */
export function gainsFor(controls: Map<string, StemControls>): Map<string, number> {
  const soloing = anySoloed(controls.values());
  const gains = new Map<string, number>();
  for (const [id, entry] of controls) gains.set(id, gainFor(entry, soloing));
  return gains;
}

/**
 * Which stems would be in a mix saved right now, in the order given.
 *
 * Save mix saves what you can hear, which is the right rule and an invisible
 * one: a soloed track and a muted track look different from each other but a
 * button reading "Save mix" looks the same either way. A mix was saved holding
 * one soloed vocal and nothing else because of that, so the page now says what
 * it is about to do before it does it.
 *
 * A stem with no controls yet counts as audible. It is at full volume with
 * nothing soloed, which is what the deck plays and therefore what a mix taken
 * at that moment would hold.
 */
export function audibleIds(controls: Map<string, StemControls>, ids: string[]): string[] {
  const soloing = anySoloed(controls.values());
  return ids.filter((id) => gainFor(controls.get(id) ?? DEFAULT_CONTROLS, soloing) > 0);
}

/** Puts the gains onto the takes that are actually loaded. */
export function applyGains(
  takes: Map<string, SyncedTake>,
  controls: Map<string, StemControls>,
): void {
  // Driven by the takes rather than by the controls, because the takes are
  // what actually make a sound. A loaded stem with no entry in the map used to
  // be skipped entirely, which left it at whatever volume it was placed at and
  // audible through somebody else's solo.
  const soloing = anySoloed(controls.values());

  for (const [id, take] of takes) {
    take.setVolume(gainFor(controls.get(id) ?? DEFAULT_CONTROLS, soloing));
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
