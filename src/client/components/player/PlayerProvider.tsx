import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../../shared/types.ts';
import {
  PlayerContext,
  PlayerInternalsContext,
  type PlayerInternals,
  type PlayerValue,
  type RepeatMode,
} from '../../lib/usePlayer.ts';

/**
 * Who owns playback.
 *
 * This sits above the router and above the studio's project data, and it is
 * never keyed or conditionally rendered. That is deliberate and it is the point
 * of the whole component: a take keeps playing while you open another project,
 * the models screen, or settings.
 *
 * DOCS/ERRORS.md records what the alternative cost. The player used to live
 * inside the project route, so every refetch that rebuilt the route killed
 * playback mid track. Nothing here may reintroduce that, which in practice
 * means no key prop on this provider and no ancestor that remounts.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [nowPlaying, setNowPlaying] = useState<Asset | undefined>();
  const [playing, setPlaying] = useState(false);
  const [queue, setQueueState] = useState<Asset[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  // The dock writes this once it has built an instance. It is a ref rather than
  // state because changing it must never re-render anything: the only thing
  // that reads it is a click handler.
  const surfer = useRef<WaveSurfer | undefined>(undefined);

  // Choosing a take should start it, but the instance is not ready at the
  // moment of the click. The dock reads this flag when wavesurfer says ready.
  const autoplay = useRef(false);

  const play = useCallback(
    (asset: Asset) => {
      // The same take again means play or pause, not reload. Reloading would
      // drop the position somebody is listening to.
      if (nowPlaying?.id === asset.id) {
        void surfer.current?.playPause();
        return;
      }
      autoplay.current = true;
      setNowPlaying(asset);
    },
    [nowPlaying?.id],
  );

  const toggle = useCallback(() => {
    void surfer.current?.playPause();
  }, []);

  const clear = useCallback((assetId?: string) => {
    setNowPlaying((current) => {
      if (assetId !== undefined && current?.id !== assetId) return current;
      autoplay.current = false;
      setPlaying(false);
      return undefined;
    });
  }, []);

  /**
   * The workspace hands over its list on every change, including the ones that
   * changed nothing an ear can hear. Replacing the array each time would make
   * every consumer of this context re-render on every project refetch, so an
   * identical list is dropped here rather than at the call site.
   */
  const setQueue = useCallback((assets: Asset[]) => {
    setQueueState((current) =>
      current.length === assets.length && current.every((entry, at) => entry.id === assets[at]?.id)
        ? current
        : assets,
    );
  }, []);

  const at = nowPlaying ? queue.findIndex((entry) => entry.id === nowPlaying.id) : -1;

  /**
   * Where a skip lands.
   *
   * Shuffle picks any other take rather than walking a pre-shuffled order. With
   * a handful of takes in a project that is the behaviour people expect from
   * the button, and the bookkeeping a shuffle bag needs to avoid repeats is
   * only worth it on a list long enough to notice one.
   */
  const step = useCallback(
    (direction: 1 | -1): Asset | undefined => {
      if (queue.length === 0) return undefined;
      if (queue.length === 1) return repeat === 'all' ? queue[0] : undefined;

      if (shuffle) {
        const others = queue.filter((entry) => entry.id !== nowPlaying?.id);
        return others[Math.floor(Math.random() * others.length)];
      }

      // A take that is no longer in the list, because it was just deleted or
      // the project changed under it, starts the walk from the top.
      if (at === -1) return direction === 1 ? queue[0] : queue[queue.length - 1];

      const next = at + direction;
      if (next >= 0 && next < queue.length) return queue[next];
      return repeat === 'all' ? (direction === 1 ? queue[0] : queue[queue.length - 1]) : undefined;
    },
    [queue, shuffle, repeat, at, nowPlaying?.id],
  );

  const move = useCallback(
    (direction: 1 | -1) => {
      const target = step(direction);
      if (!target) return;
      autoplay.current = true;
      setNowPlaying(target);
    },
    [step],
  );

  const next = useCallback(() => move(1), [move]);
  const previous = useCallback(() => move(-1), [move]);

  const toggleShuffle = useCallback(() => setShuffle((on) => !on), []);
  const cycleRepeat = useCallback(
    () => setRepeat((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off')),
    [],
  );

  // Kept current every render so the dock can read it from inside a wavesurfer
  // handler without the repeat mode becoming an effect dependency.
  const onFinish = useRef<(surfer: WaveSurfer) => void>(() => {});
  onFinish.current = (instance: WaveSurfer) => {
    if (repeat === 'one') {
      instance.setTime(0);
      void instance.play();
      return;
    }

    const target = step(1);
    if (!target) {
      setPlaying(false);
      return;
    }

    autoplay.current = true;
    setNowPlaying(target);
  };

  const value = useMemo<PlayerValue>(
    () => ({
      nowPlaying,
      playing,
      play,
      toggle,
      clear,
      setQueue,
      queueLength: queue.length,
      hasNext: step(1) !== undefined,
      hasPrevious: step(-1) !== undefined,
      next,
      previous,
      shuffle,
      toggleShuffle,
      repeat,
      cycleRepeat,
    }),
    [
      nowPlaying,
      playing,
      play,
      toggle,
      clear,
      setQueue,
      queue.length,
      step,
      next,
      previous,
      shuffle,
      toggleShuffle,
      repeat,
      cycleRepeat,
    ],
  );

  const internals = useMemo<PlayerInternals>(
    () => ({ surfer, autoplay, setPlaying, onFinish }),
    [],
  );

  return (
    <PlayerContext value={value}>
      <PlayerInternalsContext value={internals}>{children}</PlayerInternalsContext>
    </PlayerContext>
  );
}
