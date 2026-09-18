import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../../shared/types.ts';
import {
  applyFlip,
  correctDrift,
  pauseBoth,
  placeArrival,
  playBoth,
  seekBoth,
} from './compareDeck.ts';
import { createTakeSurfer } from './createTakeSurfer.ts';

/**
 * Two takes picked by hand, both loaded, one of them audible.
 *
 * The dock's `useComparePair` and this hook are two callers of one engine, not
 * two engines. Everything that touches audio lives in `compareDeck.ts` and is
 * shared. What differs is ownership and what the person asked for:
 *
 * The dock owns one instance and borrows the other. It builds the take you are
 * listening to as part of being the dock, so the pair can only add a second.
 * Here both sides are picked, so both are built and destroyed here.
 *
 * There is also no arming. Arming exists in the dock because loading a second
 * take is a cost nobody asked for when they only pressed play. On this page
 * picking the second take is the asking, so a pick loads.
 *
 * Neither take is ever paused to silence it. That is the same rule the dock
 * follows and for the same reason: a paused side stops advancing, and the next
 * flip would have to seek before it could start.
 */

/** How often the silent side is checked against the audible one, in ms. */
const SYNC_INTERVAL = 500;

export type DeckSide = 'a' | 'b';

export interface DeckSideState {
  /** True from the moment a take is picked until its waveform is ready. */
  loading: boolean;
  error: string | undefined;
  ready: boolean;
}

export interface CompareDeck {
  a: DeckSideState;
  b: DeckSideState;
  /** Which take you can hear. */
  audible: DeckSide;
  /** True once both sides are loaded, which is when a flip means anything. */
  comparable: boolean;
  playing: boolean;
  /** Where the audible take is, in seconds. */
  elapsed: number;
  /** Swap which take is audible, at the same point in the song. */
  flip: () => void;
  playPause: () => void;
  seek: (seconds: number) => void;
}

/**
 * One side's instance, rebuilt when its take changes and destroyed with it.
 *
 * Called twice, unconditionally, which is what keeps two sides from turning
 * into two copies of this effect. What it deliberately does not do is decide
 * anything about the pair: it reports that a take is ready and the deck places
 * it, because placing needs to know about the other side.
 */
function useDeckSide({
  asset,
  container,
  onReady,
  onPlayingChange,
  onFinish,
  onTime,
}: {
  asset: Asset | undefined;
  container: RefObject<HTMLDivElement | null>;
  onReady: RefObject<(instance: WaveSurfer) => void>;
  onPlayingChange: RefObject<(playing: boolean) => void>;
  onFinish: RefObject<() => void>;
  onTime: RefObject<(seconds: number) => void>;
}): { state: DeckSideState; surfer: RefObject<WaveSurfer | undefined> } {
  const surfer = useRef<WaveSurfer | undefined>(undefined);
  const [state, setState] = useState<DeckSideState>({
    loading: false,
    error: undefined,
    ready: false,
  });

  // Peaks are read through a ref rather than depended on. Every refetch hands
  // back an array equal to the last one and not the same object, so depending
  // on it rebuilds the instance and cuts playback off. This is the fix recorded
  // in DOCS/ERRORS.md for the dock, and it applies here for the same reason.
  const peaks = useRef(asset?.peaks);
  peaks.current = asset?.peaks;
  const hasPeaks = asset?.peaks !== undefined;

  const assetId = asset?.id;
  const projectId = asset?.projectId;
  const duration = asset?.durationSeconds;

  useEffect(() => {
    if (!container.current || assetId === undefined || projectId === undefined) {
      setState({ loading: false, error: undefined, ready: false });
      return;
    }

    setState({ loading: true, error: undefined, ready: false });

    const instance = createTakeSurfer({
      container: container.current,
      projectId,
      assetId,
      peaks: peaks.current,
      duration,
      handlers: {
        onReady: (built) => {
          setState({ loading: false, error: undefined, ready: true });
          onReady.current(built);
        },
        onPlay: () => onPlayingChange.current(true),
        onPause: () => onPlayingChange.current(false),
        onFinish: () => onFinish.current(),
        onTime: (time) => onTime.current(time),
        // A side that cannot load must not take the other one with it. One good
        // take and one broken one is a page that plays the good one and says
        // what happened to the other.
        onError: (message) => {
          setState({ loading: false, error: message, ready: false });
        },
      },
    });

    surfer.current = instance;

    return () => {
      instance.destroy();
      surfer.current = undefined;
    };
  }, [
    assetId,
    projectId,
    hasPeaks,
    duration,
    container,
    onReady,
    onPlayingChange,
    onFinish,
    onTime,
  ]);

  return { state, surfer };
}

export function useCompareDeck({
  a,
  b,
  containerA,
  containerB,
}: {
  a: Asset | undefined;
  b: Asset | undefined;
  containerA: RefObject<HTMLDivElement | null>;
  containerB: RefObject<HTMLDivElement | null>;
}): CompareDeck {
  const [audible, setAudible] = useState<DeckSide>('a');
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const audibleRef = useRef<DeckSide>(audible);
  audibleRef.current = audible;

  // Each side's handlers reach the deck through refs so that nothing about the
  // pair becomes a dependency of the effect that builds an instance. A handler
  // that changed identity when the audible side did would rebuild both takes on
  // every flip, which is the failure DOCS/ERRORS.md records for the dock.
  const readyA = useRef<(instance: WaveSurfer) => void>(() => {});
  const readyB = useRef<(instance: WaveSurfer) => void>(() => {});
  const playingA = useRef<(next: boolean) => void>(() => {});
  const playingB = useRef<(next: boolean) => void>(() => {});
  const finishedA = useRef<() => void>(() => {});
  const finishedB = useRef<() => void>(() => {});
  const timeA = useRef<(seconds: number) => void>(() => {});
  const timeB = useRef<(seconds: number) => void>(() => {});

  const sideA = useDeckSide({
    asset: a,
    container: containerA,
    onReady: readyA,
    onPlayingChange: playingA,
    onFinish: finishedA,
    onTime: timeA,
  });
  const sideB = useDeckSide({
    asset: b,
    container: containerB,
    onReady: readyB,
    onPlayingChange: playingB,
    onFinish: finishedB,
    onTime: timeB,
  });

  /**
   * The instance you can hear, and the one you cannot.
   *
   * Read straight from each side's own ref rather than from a copy kept here.
   * A mirror would be a second answer to the same question, and the two would
   * disagree for exactly as long as it takes a render to run.
   */
  const sides = useCallback(
    () => ({
      audible: audibleRef.current === 'a' ? sideA.surfer.current : sideB.surfer.current,
      silent: audibleRef.current === 'a' ? sideB.surfer.current : sideA.surfer.current,
    }),
    [sideA.surfer, sideB.surfer],
  );

  readyA.current = (built) => {
    placeArrival({
      arriving: built,
      other: sideB.surfer.current,
      audible: audibleRef.current === 'a',
    });
    if (audibleRef.current === 'a') setElapsed(built.getCurrentTime());
  };
  readyB.current = (built) => {
    placeArrival({
      arriving: built,
      other: sideA.surfer.current,
      audible: audibleRef.current === 'b',
    });
    if (audibleRef.current === 'b') setElapsed(built.getCurrentTime());
  };

  /*
    Only the audible side reports the transport, and that matters in one case
    that is easy to miss.

    Two takes picked by hand can be any two lengths. When the shorter one is
    the silent side it ends first, and a silent take ending would otherwise
    report the pair stopped while the take you can hear is still playing.

    When the audible side is the one that ends, both stop, so the pair does not
    leave a stream running behind a transport that says it is finished.
  */
  playingA.current = (next) => {
    if (audibleRef.current === 'a') setPlaying(next);
  };
  playingB.current = (next) => {
    if (audibleRef.current === 'b') setPlaying(next);
  };

  const finish = (side: DeckSide) => {
    if (audibleRef.current !== side) return;
    setPlaying(false);
    const { audible: hearing, silent } = sides();
    if (hearing) pauseBoth({ audible: hearing, silent });
  };
  finishedA.current = () => finish('a');
  finishedB.current = () => finish('b');

  // The clock belongs to the side you can hear. The silent side is a few
  // hundredths out by design, and reading it would make the number twitch on
  // every flip.
  timeA.current = (seconds) => {
    if (audibleRef.current === 'a') setElapsed(seconds);
  };
  timeB.current = (seconds) => {
    if (audibleRef.current === 'b') setElapsed(seconds);
  };

  const comparable = sideA.state.ready && sideB.state.ready;

  // Listening to a take and then clearing it should not leave the page silent
  // with the other take loaded. The side that still has something to play
  // becomes the one you hear.
  useEffect(() => {
    if (audible === 'a' && a === undefined && b !== undefined) setAudible('b');
    if (audible === 'b' && b === undefined && a !== undefined) setAudible('a');
  }, [audible, a, b]);

  const flip = useCallback(() => {
    const { audible: hearing, silent } = sides();
    if (!hearing || !silent) return;

    applyFlip({ leaving: hearing, arriving: silent });
    setAudible((side) => (side === 'a' ? 'b' : 'a'));
  }, [sides]);

  const playPause = useCallback(() => {
    const { audible: hearing, silent } = sides();
    if (!hearing) return;

    if (hearing.isPlaying()) pauseBoth({ audible: hearing, silent });
    else playBoth({ audible: hearing, silent });
  }, [sides]);

  const seek = useCallback(
    (seconds: number) => {
      const { audible: hearing, silent } = sides();
      if (!hearing) return;
      seekBoth({ audible: hearing, silent, seconds });
    },
    [sides],
  );

  // The audible side drives and the silent side follows. What counts as far
  // enough to correct is in correctDrift. What is decided here is when to
  // check at all: only while both sides exist and something is playing.
  useEffect(() => {
    if (!comparable) return;

    const timer = setInterval(() => {
      const { audible: hearing, silent } = sides();
      if (!hearing || !silent) return;
      correctDrift({ audible: hearing, silent });
    }, SYNC_INTERVAL);

    return () => clearInterval(timer);
  }, [comparable, sides]);

  return {
    a: sideA.state,
    b: sideB.state,
    audible,
    comparable,
    playing,
    elapsed,
    flip,
    playPause,
    seek,
  };
}
