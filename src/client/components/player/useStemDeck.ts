import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../../shared/types.ts';
import { clampTo } from './compareSync.ts';
import {
  DEFAULT_CONTROLS,
  applyGains,
  correctFollowers,
  gainsFor,
  isOnlySolo,
  pauseAll,
  placeStem,
  playAll,
  seekAll,
  soloOnly,
  type StemControls,
} from './stemDeck.ts';

/**
 * Every stem of one separation, playing together under one transport.
 *
 * The compare deck builds both of its instances itself, because it always has
 * exactly two and can call one hook per side. A separation returns two stems or
 * four depending on the model, and a hook cannot be called in a loop whose
 * length changes. So each stem owns its own instance in its own component and
 * registers it here, and this hook holds the set and the transport.
 *
 * That inversion is also why `register` and `unregister` are stable for the
 * life of the deck. A track's effect depends on them, and a callback that
 * changed identity would tear down and rebuild every instance on any state
 * change, which is the failure `DOCS/ERRORS.md` records for the dock.
 *
 * The leader is whichever stem registered first. Every stem of a separation is
 * the same length as its source, confirmed on 2026-09-18, so there is nothing
 * to choose between them and the first one to arrive is as good as any.
 */

/** How often the followers are checked against the leader, in ms. */
const SYNC_INTERVAL = 500;

export interface StemDeck {
  controls: Map<string, StemControls>;
  /** How many stems have finished loading. */
  readyCount: number;
  playing: boolean;
  /** Where the leader is, in seconds. */
  elapsed: number;
  duration: number;
  /** True once anything is loaded, which is when the transport means something. */
  playable: boolean;
  /** True while any stem is soloed, so the interface can say so. */
  soloing: boolean;
  playPause: () => void;
  seek: (seconds: number) => void;
  setVolume: (id: string, volume: number) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  /** Hear this stem on its own, or stop if that is already what is happening. */
  playOnly: (id: string) => void;
  /** Whether this stem is the only one soloed. */
  onlySolo: (id: string) => boolean;
  /** Called by a track once its instance is ready. */
  register: (id: string, instance: WaveSurfer) => void;
  unregister: (id: string) => void;
  /** Called by a track on every time update. Ignored unless it leads. */
  report: (id: string, seconds: number) => void;
  reportPlaying: (id: string, playing: boolean) => void;
  reportFinished: (id: string) => void;
}

export function useStemDeck(stems: Asset[]): StemDeck {
  const [controls, setControls] = useState<Map<string, StemControls>>(new Map());
  const [readyCount, setReadyCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  // The instances themselves are never state. Nothing renders from them, and
  // holding them in state would put a wavesurfer object into a dependency
  // array somewhere downstream.
  const takes = useRef(new Map<string, WaveSurfer>());
  const order = useRef<string[]>([]);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  const ids = useMemo(() => stems.map((stem) => stem.id).join(','), [stems]);

  // A new set of stems starts with fresh faders. Carrying a previous set's
  // mutes onto different stems would silence something nobody muted.
  //
  // Keyed on the joined ids rather than on the array. `stems` is rebuilt on
  // every render of the page, so depending on it would reset the faders under
  // somebody's hand on any state change at all. The string is what actually
  // says whether this is a different set.
  const stemIds = useRef<string[]>([]);
  stemIds.current = stems.map((stem) => stem.id);

  useEffect(() => {
    setControls(new Map(stemIds.current.map((id) => [id, { ...DEFAULT_CONTROLS }])));
    setElapsed(0);
    setPlaying(false);
  }, [ids]);

  const leaderId = useCallback(() => order.current[0], []);

  const others = useCallback((exceptId: string | undefined) => {
    const rest: WaveSurfer[] = [];
    for (const [id, take] of takes.current) {
      if (id !== exceptId) rest.push(take);
    }
    return rest;
  }, []);

  const register = useCallback(
    (id: string, instance: WaveSurfer) => {
      const leader = leaderId();
      const existing = leader === undefined ? undefined : takes.current.get(leader);

      takes.current.set(id, instance);
      if (!order.current.includes(id)) order.current.push(id);

      const gain = gainsFor(controlsRef.current).get(id) ?? 1;
      placeStem({ arriving: instance, leader: existing, gain });

      setReadyCount(takes.current.size);
      if (instance.getDuration() > 0) setDuration((was) => Math.max(was, instance.getDuration()));
    },
    [leaderId],
  );

  const unregister = useCallback((id: string) => {
    takes.current.delete(id);
    order.current = order.current.filter((entry) => entry !== id);
    setReadyCount(takes.current.size);
  }, []);

  const report = useCallback(
    (id: string, seconds: number) => {
      // Only the leader reports. Four stems each firing a time update would set
      // the same state four times a frame to the same value.
      if (id === leaderId()) setElapsed(seconds);
    },
    [leaderId],
  );

  const reportPlaying = useCallback(
    (id: string, next: boolean) => {
      if (id === leaderId()) setPlaying(next);
    },
    [leaderId],
  );

  const reportFinished = useCallback(
    (id: string) => {
      if (id !== leaderId()) return;
      // Every stem is the same length, so they all end together. Stopping the
      // set explicitly means a stem a few milliseconds longer does not carry on
      // alone behind a transport that says it has finished.
      pauseAll([...takes.current.values()]);
      setPlaying(false);
    },
    [leaderId],
  );

  const playPause = useCallback(() => {
    const leader = leaderId();
    const instance = leader === undefined ? undefined : takes.current.get(leader);
    if (!instance) return;

    if (instance.isPlaying()) {
      pauseAll([...takes.current.values()]);
      setPlaying(false);
      return;
    }

    playAll({ leader: instance, followers: others(leader) });
    setPlaying(true);
  }, [leaderId, others]);

  const seek = useCallback((seconds: number) => {
    const instances = [...takes.current.values()];
    seekAll(instances, seconds);

    // Clamped against a real stem rather than the number that was asked for.
    // Skipping forward near the end parks every stem at its end, and a clock
    // reading past the track is a clock disagreeing with what you can hear.
    const longest = instances.reduce((most, take) => Math.max(most, take.getDuration()), 0);
    setElapsed(clampTo(seconds, longest));
  }, []);

  const change = useCallback((id: string, patch: Partial<StemControls>) => {
    setControls((was) => {
      const next = new Map(was);
      const current = next.get(id) ?? { ...DEFAULT_CONTROLS };
      next.set(id, { ...current, ...patch });
      return next;
    });
  }, []);

  const setVolume = useCallback(
    (id: string, volume: number) => change(id, { volume }),
    [change],
  );

  const toggleMute = useCallback(
    (id: string) => change(id, { muted: !(controlsRef.current.get(id)?.muted ?? false) }),
    [change],
  );

  const toggleSolo = useCallback(
    (id: string) => change(id, { soloed: !(controlsRef.current.get(id)?.soloed ?? false) }),
    [change],
  );

  const onlySolo = useCallback((id: string) => isOnlySolo(controlsRef.current, id), []);

  const playOnly = useCallback(
    (id: string) => {
      const leader = leaderId();
      const instance = leader === undefined ? undefined : takes.current.get(leader);
      if (!instance) return;

      // Already hearing just this one, so the button is a pause.
      if (isOnlySolo(controlsRef.current, id) && instance.isPlaying()) {
        pauseAll([...takes.current.values()]);
        setPlaying(false);
        return;
      }

      // Covering every stem on the page, not only the ones already in the map,
      // so a solo cannot quietly apply to nothing.
      setControls((was) => soloOnly(was, id, stemIds.current));

      if (!instance.isPlaying()) {
        playAll({ leader: instance, followers: others(leader) });
        setPlaying(true);
      }
    },
    [leaderId, others],
  );

  // Gains follow the controls rather than being set where a button was pressed,
  // so one rule decides what every stem plays at and a solo anywhere updates
  // the whole set.
  useEffect(() => {
    applyGains(takes.current, controls);
  }, [controls, readyCount]);

  useEffect(() => {
    const timer = setInterval(() => {
      const leader = leaderId();
      const instance = leader === undefined ? undefined : takes.current.get(leader);
      if (!instance) return;
      correctFollowers({ leader: instance, followers: others(leader) });
    }, SYNC_INTERVAL);

    return () => clearInterval(timer);
  }, [leaderId, others]);

  const soloing = useMemo(() => [...controls.values()].some((entry) => entry.soloed), [controls]);

  return {
    controls,
    readyCount,
    playing,
    elapsed,
    duration,
    playable: readyCount > 0,
    soloing,
    playPause,
    seek,
    setVolume,
    toggleMute,
    toggleSolo,
    playOnly,
    onlySolo,
    register,
    unregister,
    report,
    reportPlaying,
    reportFinished,
  };
}
