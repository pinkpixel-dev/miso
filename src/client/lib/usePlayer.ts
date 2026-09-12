import { createContext, use } from 'react';
import type { RefObject } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../shared/types.ts';

/**
 * What the studio knows about playback.
 *
 * The context is here rather than beside the provider so the dock, the take
 * rows, and the workspace can all import the hook without importing the
 * component that owns the state.
 *
 * Only one thing plays at a time and it is owned above the router, so moving
 * between projects, the models screen and settings never interrupts it. That is
 * the whole reason this exists as context instead of route state.
 */
/** What happens when a take reaches its end. */
export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerValue {
  /** The take the dock is holding, whether or not it is running right now. */
  nowPlaying: Asset | undefined;
  playing: boolean;
  /** Select a take and start it. Called with the current take, this toggles. */
  play: (asset: Asset) => void;
  /** Play or pause whatever the dock is already holding. */
  toggle: () => void;
  /**
   * Let go of a take. Called with an id, it only lets go when that is the take
   * being held, which is what deleting a track needs.
   */
  clear: (assetId?: string) => void;

  /**
   * The takes the skip buttons move through.
   *
   * The workspace column hands this over because it is the thing that knows
   * what is in the open project. The provider deliberately does not read the
   * project itself: it sits above the studio data so that playback survives a
   * change of project, and reaching down for a list would undo that.
   */
  setQueue: (assets: Asset[]) => void;
  /** How many takes are skippable. Zero means the queue has not been set yet. */
  queueLength: number;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;

  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: RepeatMode;
  /** Steps off, all, one, and back to off. */
  cycleRepeat: () => void;
}

/**
 * The parts only the dock uses.
 *
 * The dock owns the wavesurfer instance because wavesurfer needs a container
 * element and the dock is the only thing with one. The provider owns the state
 * everything else reads. These two facts have to meet somewhere, and this is
 * the seam: the dock writes the instance and the playing flag, the provider
 * reads them back out for everybody else.
 */
export interface PlayerInternals {
  surfer: RefObject<WaveSurfer | undefined>;
  /** Set when a take was chosen by a person, so the dock starts it once ready. */
  autoplay: RefObject<boolean>;
  setPlaying: (playing: boolean) => void;
  /**
   * What to do when a take ends, handed over as a ref.
   *
   * It has to be a ref rather than a callback prop because the dock builds its
   * wavesurfer instance inside an effect, and anything in that effect's
   * dependencies rebuilds the player. Changing the repeat mode mid track would
   * then cut the track off, which is the exact failure DOCS/ERRORS.md records
   * for peaks. A ref lets the provider keep this current without the dock
   * noticing it changed.
   */
  onFinish: RefObject<(surfer: WaveSurfer) => void>;
}

export const PlayerContext = createContext<PlayerValue | undefined>(undefined);
export const PlayerInternalsContext = createContext<PlayerInternals | undefined>(undefined);

export function usePlayer(): PlayerValue {
  const value = use(PlayerContext);
  if (!value) throw new Error('usePlayer needs a PlayerProvider above it');
  return value;
}

export function usePlayerInternals(): PlayerInternals {
  const value = use(PlayerInternalsContext);
  if (!value) throw new Error('usePlayerInternals needs a PlayerProvider above it');
  return value;
}
