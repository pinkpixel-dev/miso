import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MidiNote } from '../../shared/types.ts';
import { noteFrequency, notesFrom, previewDuration, typicalPolyphony, voiceGain } from './midiPreview.ts';

/**
 * Plays a transcription's notes with Web Audio, and nothing else.
 *
 * No library, no soundfont and no MIDI parser. The response already hands Miso
 * every note as pitch, start and end, so synthesising it directly is less code
 * than loading a player would be, and it ships nothing. The sound is a plain
 * triangle wave per note. It is meant to answer "did it get the notes right",
 * not to be listened to for pleasure.
 *
 * Notes go to the audio clock a couple of seconds at a time rather than all
 * at once. Scheduling the whole piece up front is what this used to do, and it
 * does not work: an oscillator that has not reached its start time is still in
 * the graph and is still processed every render quantum, so a 7298 note
 * transcription meant 14598 live nodes for the whole four minutes. Ten seconds
 * of that graph measured at 0.42 times realtime, against a deadline the audio
 * thread has to meet, so every callback underran and the preview went silent
 * after the first buffer. See `/DOCS/ERRORS.md`.
 *
 * The window keeps the live voice count near the polyphony rather than near
 * the length, so the cost is flat however long the piece runs. The Web Audio
 * clock still times every note it has been handed, which means the refill only
 * has to be punctual to within the window, never to within a note.
 *
 * Pausing and seeking both work by throwing the graph away and scheduling what
 * is left from the new position, which is why `notesFrom` exists. Nothing is
 * rescheduled while a scrub is in progress: the caller commits one position
 * when the drag ends, because a drag across a six thousand note transcription
 * would otherwise build the graph again on every pointer move.
 */

/** Long enough to avoid a click, short enough not to smear a fast line. */
const ATTACK_SECONDS = 0.008;
const RELEASE_SECONDS = 0.06;

/** A breath before the first note, so scheduling is never in the past. */
const LEAD_SECONDS = 0.06;

/**
 * How far ahead notes are handed out, and how often that is topped up.
 *
 * The refill has to beat the window or a gap opens. Half a second against two
 * leaves margin for the one second Chrome clamps timers to in a background
 * tab, so a preview left playing behind another tab does not stutter.
 */
const WINDOW_SECONDS = 2;
const REFILL_MS = 500;

/** A note that is scheduled right now, and what it takes to let go of it. */
interface Voice {
  oscillator: OscillatorNode;
  envelope: GainNode;
  /** Context time the oscillator stops at, after which this can be dropped. */
  stopAt: number;
}

export interface MidiPreview {
  playing: boolean;
  /** Seconds into the transcription, for the readout and the scrub bar. */
  position: number;
  duration: number;
  /** False when there is nothing to play, which is a transcription with no notes. */
  available: boolean;
  play: () => void;
  pause: () => void;
  /** Moves to a position, and keeps playing if it already was. */
  seek: (seconds: number) => void;
}

export function useMidiPreview(notes: MidiNote[]): MidiPreview {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  const contextRef = useRef<AudioContext | undefined>(undefined);
  const masterRef = useRef<GainNode | undefined>(undefined);
  const limiterRef = useRef<DynamicsCompressorNode | undefined>(undefined);
  const voicesRef = useRef<Voice[]>([]);
  const frameRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  /** What this run has left to schedule, and how far down it the window is. */
  const pendingRef = useRef<MidiNote[]>([]);
  const nextRef = useRef(0);
  /** Context time of this run's position zero, which note times are added to. */
  const beginRef = useRef(0);
  /**
   * The context time at which this run's position zero was, or would have
   * been. Position is then one subtraction away whatever the run started from,
   * which a stored offset plus a start time is not.
   */
  const originRef = useRef(0);
  const positionRef = useRef(0);

  // The window walks the notes in order and stops at the first one past its
  // horizon, so they have to be in order. They arrive sorted; one pass here
  // costs little and means the walk does not rest on that staying true.
  const ordered = useMemo(
    () => [...notes].sort((left, right) => left.start - right.start),
    [notes],
  );

  const duration = previewDuration(ordered);
  const available = ordered.length > 0;

  // The level is a sweep over every note, so it is worth not repeating it on
  // each play, pause and seek of the same transcription.
  const level = useMemo(() => voiceGain(typicalPolyphony(ordered)), [ordered]);

  const setBoth = useCallback((seconds: number) => {
    positionRef.current = seconds;
    setPosition(seconds);
  }, []);

  /**
   * Silences whatever is scheduled, leaving the context open.
   *
   * Two steps, in this order for a reason. Disconnecting the one node
   * everything runs through is what guarantees the silence: it is a single
   * call, and it cannot half succeed the way a loop over the live voices can.
   *
   * The loop that follows is about memory rather than sound. A disconnected
   * oscillator is inaudible but stays alive until the stop time it was given,
   * and a held note can be seconds away. Stopping and unhooking hands it back
   * now. The loop runs after the disconnect so that one throwing cannot leave
   * anything sounding.
   *
   * Clearing the refill is the third thing, and it is not optional: a timer
   * left running would keep handing notes to a graph that is meant to be off.
   */
  const silence = useCallback(() => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    if (timerRef.current !== undefined) clearInterval(timerRef.current);
    timerRef.current = undefined;

    masterRef.current?.disconnect();
    masterRef.current = undefined;
    limiterRef.current?.disconnect();
    limiterRef.current = undefined;

    for (const voice of voicesRef.current) {
      try {
        voice.oscillator.stop();
      } catch {
        // Already finished, which is the ordinary case for a voice the window
        // has not pruned yet. Nothing to do about it and nothing wrong.
      }
      voice.oscillator.disconnect();
      voice.envelope.disconnect();
    }
    voicesRef.current = [];

    // Nothing left to hand out. Without this the next refill would carry on
    // from the middle of the run that was just stopped.
    pendingRef.current = [];
    nextRef.current = 0;
  }, []);

  /**
   * Hands out the notes that begin inside the window, then drops what is done.
   *
   * It walks rather than filters. The notes are in order, so the first one
   * past the horizon ends the pass and the next refill picks up from there,
   * which is what keeps this cheap enough to run twice a second. Sweeping the
   * whole list every time would be the cost the window exists to avoid.
   *
   * Pruning matters as much as scheduling. A voice past its stop time is
   * silent, but it is still a node in the graph until it is unhooked, and
   * leaving them to pile up would rebuild the problem the window solves.
   */
  const refill = useCallback(() => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master) return;

    const horizon = context.currentTime + WINDOW_SECONDS;
    const begin = beginRef.current;
    const pending = pendingRef.current;

    while (nextRef.current < pending.length) {
      const note = pending[nextRef.current];
      // The loop bound already rules this out. The index signature does not
      // know that, and a break is cheaper than asserting at it.
      if (note === undefined) break;
      const startAtTime = begin + note.start;
      if (startAtTime >= horizon) break;
      nextRef.current += 1;

      const oscillator = context.createOscillator();
      const envelope = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.value = noteFrequency(note.pitch);

      // A note the model gave no length is still worth hearing, so anything
      // that would be instantaneous gets a short fixed tap instead of nothing.
      const endAt = Math.max(startAtTime + 0.05, begin + note.end);
      const stopAt = endAt + 0.01;

      envelope.gain.setValueAtTime(0, startAtTime);
      envelope.gain.linearRampToValueAtTime(level, startAtTime + ATTACK_SECONDS);
      envelope.gain.setValueAtTime(
        level,
        Math.max(startAtTime + ATTACK_SECONDS, endAt - RELEASE_SECONDS),
      );
      envelope.gain.linearRampToValueAtTime(0, endAt);

      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(startAtTime);
      oscillator.stop(stopAt);

      voicesRef.current.push({ oscillator, envelope, stopAt });
    }

    const now = context.currentTime;
    voicesRef.current = voicesRef.current.filter((voice) => {
      if (voice.stopAt > now) return true;
      voice.oscillator.disconnect();
      voice.envelope.disconnect();
      return false;
    });
  }, [level]);

  const startAt = useCallback(
    (from: number) => {
      if (!available) return;
      silence();

      // One context for the life of the row. Closing it on every pause and
      // opening another on resume costs a device round trip each time, and a
      // context opened outside a gesture can come back suspended.
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (context.state === 'suspended') void context.resume();

      const master = context.createGain();
      master.gain.value = 1;

      /*
        A limiter, not an effect. `typicalPolyphony` sets the level from what
        is sounding 95 percent of the time, which means the other 5 percent is
        allowed to be denser than the level expects. This is what that costs
        instead of clipping: a hard knee, a high ratio and a fast attack, so a
        thick moment ducks for as long as it lasts and nothing else is touched.
      */
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      master.connect(limiter);
      limiter.connect(context.destination);
      masterRef.current = master;
      limiterRef.current = limiter;

      const begin = context.currentTime + LEAD_SECONDS;
      beginRef.current = begin;
      originRef.current = begin - from;

      // Everything from here on, for the window to hand out as it goes.
      pendingRef.current = notesFrom(ordered, from);
      nextRef.current = 0;
      voicesRef.current = [];

      // The first pass runs now rather than on the first tick of the timer,
      // so the opening notes are scheduled before LEAD_SECONDS is spent.
      refill();
      timerRef.current = window.setInterval(refill, REFILL_MS);

      setBoth(from);
      setPlaying(true);

      const tick = () => {
        const current = contextRef.current;
        if (!current) return;

        const elapsed = current.currentTime - originRef.current;

        if (elapsed >= duration) {
          silence();
          setBoth(0);
          setPlaying(false);
          return;
        }

        setBoth(Math.min(duration, Math.max(0, elapsed)));
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [available, duration, ordered, refill, setBoth, silence],
  );

  const play = useCallback(() => {
    // Playing from the end is a replay, not a no-op that looks broken.
    startAt(positionRef.current >= duration ? 0 : positionRef.current);
  }, [duration, startAt]);

  const pause = useCallback(() => {
    silence();
    setPlaying(false);
  }, [silence]);

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.min(duration, Math.max(0, seconds));
      if (playing) {
        startAt(target);
        return;
      }
      setBoth(target);
    },
    [duration, playing, setBoth, startAt],
  );

  // Leaving the page while it is playing has to take the sound with it. Without
  // this the AudioContext outlives the component and keeps going.
  useEffect(
    () => () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      if (timerRef.current !== undefined) clearInterval(timerRef.current);
      masterRef.current?.disconnect();
      limiterRef.current?.disconnect();
      void contextRef.current?.close();
      contextRef.current = undefined;
    },
    [],
  );

  // A different transcription is a different piece of music, so whatever is
  // playing stops rather than carrying on underneath the new one.
  useEffect(() => {
    silence();
    setPlaying(false);
    setBoth(0);
  }, [ordered, setBoth, silence]);

  return { playing, position, duration, available, play, pause, seek };
}
