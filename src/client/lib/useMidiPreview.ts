import { useCallback, useEffect, useRef, useState } from 'react';
import type { MidiNote } from '../../shared/types.ts';
import { maxPolyphony, noteFrequency, notesFrom, previewDuration, voiceGain } from './midiPreview.ts';

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
 */

/** Long enough to avoid a click, short enough not to smear a fast line. */
const ATTACK_SECONDS = 0.008;
const RELEASE_SECONDS = 0.06;

/** A breath before the first note, so scheduling is never in the past. */
const LEAD_SECONDS = 0.06;

export interface MidiPreview {
  playing: boolean;
  /** Seconds into the transcription, for the readout. */
  position: number;
  duration: number;
  /** False when there is nothing to play, which is a transcription with no notes. */
  available: boolean;
  play: () => void;
  stop: () => void;
}

export function useMidiPreview(notes: MidiNote[]): MidiPreview {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  const contextRef = useRef<AudioContext | undefined>(undefined);
  const masterRef = useRef<GainNode | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);

  const duration = previewDuration(notes);
  const available = notes.length > 0;

  const stop = useCallback(() => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;

    // Disconnecting the one node everything runs through stops all of it at
    // once. Stopping several hundred oscillators individually would be the same
    // effect with several hundred more calls, and any one of them throwing
    // would leave the rest sounding.
    masterRef.current?.disconnect();
    masterRef.current = undefined;

    void contextRef.current?.close();
    contextRef.current = undefined;

    setPlaying(false);
    setPosition(0);
  }, []);

  const play = useCallback(() => {
    if (!available) return;
    stop();

    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);

    contextRef.current = context;
    masterRef.current = master;

    const level = voiceGain(maxPolyphony(notes));
    const begin = context.currentTime + LEAD_SECONDS;
    startedAtRef.current = begin;

    for (const note of notesFrom(notes, 0)) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.value = noteFrequency(note.pitch);

      const startAt = begin + note.start;
      // A note the model gave no length is still worth hearing, so anything
      // that would be instantaneous gets a short fixed tap instead of nothing.
      const endAt = Math.max(startAt + 0.05, begin + note.end);

      envelope.gain.setValueAtTime(0, startAt);
      envelope.gain.linearRampToValueAtTime(level, startAt + ATTACK_SECONDS);
      envelope.gain.setValueAtTime(level, Math.max(startAt + ATTACK_SECONDS, endAt - RELEASE_SECONDS));
      envelope.gain.linearRampToValueAtTime(0, endAt);

      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.01);
    }

    setPlaying(true);

    const tick = () => {
      const current = contextRef.current;
      if (!current) return;

      const elapsed = current.currentTime - startedAtRef.current;
      setPosition(Math.min(duration, Math.max(0, elapsed)));

      if (elapsed >= duration) {
        stop();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [available, duration, notes, stop]);

  // Leaving the page while it is playing has to take the sound with it. Without
  // this the AudioContext outlives the component and keeps going.
  useEffect(() => stop, [stop]);

  // A different transcription is a different piece of music, so whatever is
  // playing stops rather than carrying on underneath the new one.
  useEffect(() => {
    stop();
  }, [notes, stop]);

  return { playing, position, duration, available, play, stop };
}
