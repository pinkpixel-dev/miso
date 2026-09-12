import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../../shared/types.ts';
import {
  PlayerContext,
  PlayerInternalsContext,
  type PlayerInternals,
  type PlayerValue,
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

  const value = useMemo<PlayerValue>(
    () => ({ nowPlaying, playing, play, toggle, clear }),
    [nowPlaying, playing, play, toggle, clear],
  );

  const internals = useMemo<PlayerInternals>(
    () => ({ surfer, autoplay, setPlaying }),
    [],
  );

  return (
    <PlayerContext value={value}>
      <PlayerInternalsContext value={internals}>{children}</PlayerInternalsContext>
    </PlayerContext>
  );
}
