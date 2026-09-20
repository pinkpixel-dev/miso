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
 * Every note is scheduled up front rather than in a rolling window. The Web
 * Audio clock does the timing, which is accurate in a way a JavaScript timer is
 * not, and an ordinary transcription is a few hundred notes. A very long one is
 * a few thousand short-lived nodes, which browsers handle, and the alternative
 * is a scheduler loop that can drift.
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
  const voicesRef = useRef<OscillatorNode[]>([]);
  const frameRef = useRef<number | undefined>(undefined);
  /**
   * The context time at which this run's position zero was, or would have
   * been. Position is then one subtraction away whatever the run started from,
   * which a stored offset plus a start time is not.
   */
  const originRef = useRef(0);
  const positionRef = useRef(0);

  const duration = previewDuration(notes);
  const available = notes.length > 0;

  // The level is a sweep over every note, so it is worth not repeating it on
  // each play, pause and seek of the same transcription.
  const level = useMemo(() => voiceGain(typicalPolyphony(notes)), [notes]);

  const setBoth = useCallback((seconds: number) => {
    positionRef.current = seconds;
    setPosition(seconds);
  }, []);

  /**
   * Silences whatever is scheduled, leaving the context open.
   *
   * Two steps, in this order for a reason. Disconnecting the one node
   * everything runs through is what guarantees the silence: it is a single
   * call, and it cannot half succeed the way a loop over several thousand
   * oscillators can.
   *
   * The loop that follows is about memory rather than sound. A disconnected
   * oscillator is inaudible but stays alive until the stop time it was given,
   * which on a long transcription is minutes away, and seeking builds a whole
   * new set. Stopping them hands them back now. It runs after the disconnect
   * so that one throwing cannot leave anything sounding.
   */
  const silence = useCallback(() => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;

    masterRef.current?.disconnect();
    masterRef.current = undefined;

    for (const voice of voicesRef.current) {
      try {
        voice.stop();
      } catch {
        // Already finished, which is the ordinary case for everything that
        // played before the seek. Nothing to do about it and nothing wrong.
      }
    }
    voicesRef.current = [];
  }, []);

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

      const begin = context.currentTime + LEAD_SECONDS;
      originRef.current = begin - from;

      const voices: OscillatorNode[] = [];

      for (const note of notesFrom(notes, from)) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.value = noteFrequency(note.pitch);

        const startAtTime = begin + note.start;
        // A note the model gave no length is still worth hearing, so anything
        // that would be instantaneous gets a short fixed tap instead of nothing.
        const endAt = Math.max(startAtTime + 0.05, begin + note.end);

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
        oscillator.stop(endAt + 0.01);
        voices.push(oscillator);
      }

      voicesRef.current = voices;
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
    [available, duration, level, notes, setBoth, silence],
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
      masterRef.current?.disconnect();
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
  }, [notes, setBoth, silence]);

  return { playing, position, duration, available, play, pause, seek };
}
