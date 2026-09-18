import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../../shared/types.ts';
import { applyFlip, correctDrift } from './compareDeck.ts';
import { flipPlan } from './compareSync.ts';
import { createTakeSurfer } from './createTakeSurfer.ts';

/**
 * Two takes of one song, one of them audible.
 *
 * Instant is the point. A flip that reloads is a flip you wait for, and a
 * compare you wait for is one nobody uses, so both takes are loaded and running
 * and the flip only decides which one you can hear. That costs two streams
 * while comparing, which is why it is armed rather than always on: a take you
 * only wanted to listen to should not quietly fetch a second one.
 *
 * Silencing is done with volume, never by pausing. A paused side stops
 * advancing, so the next flip would have to seek before it could start, which
 * is the wait this whole hook exists to avoid.
 *
 * The other side is a second wavesurfer rather than a bare audio element. That
 * keeps one kind of thing owning position and play state on both sides. Two
 * different mechanisms would mean two position models that have to agree on
 * every flip and every seek, which is the shape of the failure DOCS/ERRORS.md
 * already records for this dock.
 */

/** How often the silent side is checked against the audible one, in ms. */
const SYNC_INTERVAL = 500;

export type CompareSide = 'current' | 'other';

export interface ComparePair {
  armed: boolean;
  /** True while the other take is still loading, after arming. */
  loading: boolean;
  error: string | undefined;
  /** Which take you can hear. */
  side: CompareSide;
  /** Load the other take and hold both. */
  arm: () => void;
  /** Let the other take go. */
  disarm: () => void;
  /** Swap which take is audible, at the same point in the song. */
  flip: () => void;
}

export function useComparePair({
  current,
  other,
  surfer,
  playing,
  container,
}: {
  /** The take the dock is holding. A pair belongs to one, and ends with it. */
  current: Asset | undefined;
  /** The take being compared against, or nothing when there is none to offer. */
  other: Asset | undefined;
  /** The dock's instance, which is always the take the studio is holding. */
  surfer: RefObject<WaveSurfer | undefined>;
  playing: boolean;
  /** Where the other take draws. Hidden, but it must be a real element. */
  container: RefObject<HTMLDivElement | null>;
}): ComparePair {
  const [armed, setArmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [side, setSide] = useState<CompareSide>('current');

  const otherSurfer = useRef<WaveSurfer | undefined>(undefined);
  const sideRef = useRef<CompareSide>('current');
  sideRef.current = side;

  const disarm = useCallback(() => {
    // The dock's own instance is left audible whatever was happening, so
    // letting go of a comparison never leaves the studio silent.
    surfer.current?.setVolume(1);
    otherSurfer.current?.destroy();
    otherSurfer.current = undefined;
    setArmed(false);
    setLoading(false);
    setError(undefined);
    setSide('current');
  }, [surfer]);

  const arm = useCallback(() => {
    if (!other || !container.current || otherSurfer.current) return;

    setArmed(true);
    setLoading(true);
    setError(undefined);

    const instance = createTakeSurfer({
      container: container.current,
      projectId: other.projectId,
      assetId: other.id,
      peaks: other.peaks,
      duration: other.durationSeconds,
      handlers: {
        onReady: (built) => {
          setLoading(false);
          // Silent and in step from the moment it exists, so the first flip is
          // a swap rather than a seek.
          built.setVolume(0);
          const audible = surfer.current;
          if (!audible) return;
          const plan = flipPlan({
            audibleTime: audible.getCurrentTime(),
            playing,
            arrivingDuration: built.getDuration(),
          });
          built.setTime(plan.time);
          if (plan.play) void built.play();
        },
        onError: (message) => {
          // A comparison that cannot load must not take the take you were
          // listening to with it.
          setError(message);
          setLoading(false);
          otherSurfer.current?.destroy();
          otherSurfer.current = undefined;
          setArmed(false);
          setSide('current');
          surfer.current?.setVolume(1);
        },
      },
    });

    otherSurfer.current = instance;
  }, [other, container, surfer, playing]);

  const flip = useCallback(() => {
    const dock = surfer.current;
    const compared = otherSurfer.current;
    if (!dock || !compared) return;

    const goingToOther = sideRef.current === 'current';
    applyFlip({
      leaving: goingToOther ? dock : compared,
      arriving: goingToOther ? compared : dock,
    });

    setSide(goingToOther ? 'other' : 'current');
  }, [surfer]);

  // The audible side drives and the silent side follows. What counts as far
  // enough to correct, and why it is not corrected continuously, is in
  // correctDrift. What is decided here is when the check runs at all: only
  // while a pair is armed and both sides exist.
  useEffect(() => {
    if (!armed || loading) return;

    const timer = setInterval(() => {
      const dock = surfer.current;
      const compared = otherSurfer.current;
      if (!dock || !compared) return;

      correctDrift({
        audible: sideRef.current === 'current' ? dock : compared,
        silent: sideRef.current === 'current' ? compared : dock,
      });
    }, SYNC_INTERVAL);

    return () => clearInterval(timer);
  }, [armed, loading, surfer]);

  // A pair that outlives the takes it was made of is two streams nobody asked
  // for, still fetching and still decoding. It ends when either take changes,
  // and when the dock goes away.
  //
  // Both ids matter, not just the compared one. Two takes repainted from the
  // same source share a parent, so moving between them leaves `other` the same
  // while the dock destroys and rebuilds its own instance underneath. The
  // rebuilt one starts audible, and a pair that still believed the other side
  // was live would have played both at once.
  //
  // Through a ref so that this effect depends on the takes alone. Depending on
  // `disarm` would tear the pair down whenever its identity changed, which is
  // every time the dock's play state does.
  const disarmRef = useRef(disarm);
  disarmRef.current = disarm;

  useEffect(() => {
    return () => disarmRef.current();
  }, [current?.id, other?.id]);

  return { armed, loading, error, side, arm, disarm, flip };
}
