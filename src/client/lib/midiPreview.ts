import type { MidiNote } from '../../shared/types.ts';

/**
 * The arithmetic behind the MIDI preview, kept apart from the audio graph.
 *
 * The preview exists to answer one question: did the transcription get the
 * notes right. It is not a rendering of the MIDI file and does not try to be.
 * Everything is one voice, because the model's instrument labels are not
 * trustworthy enough to act on: an isolated drum stem came back as acoustic
 * guitar. See `src/server/tasks/muscriptor.ts`.
 */

/** Equal temperament, with MIDI 69 at 440 Hz. */
export function noteFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/** Where the last note stops, which is how long the preview runs for. */
export function previewDuration(notes: MidiNote[]): number {
  return notes.reduce((longest, note) => Math.max(longest, note.end), 0);
}

/**
 * How loud one voice should be, given how many can sound together.
 *
 * Summing twelve oscillators at full scale clips hard. Dividing by the count
 * outright makes a dense chord inaudible next to a single note, so this backs
 * off on the square root, which is the usual compromise and keeps a solo line
 * present without letting a chord distort.
 */
export function voiceGain(maxPolyphony: number): number {
  return 0.5 / Math.sqrt(Math.max(1, maxPolyphony));
}

/**
 * The most notes sounding at the same moment.
 *
 * Counted by sweeping the starts and ends in time order rather than by
 * comparing every note with every other, so a long transcription does not cost
 * a second to set up. 592 notes is an ordinary result for a three minute take.
 */
export function maxPolyphony(notes: MidiNote[]): number {
  // An explicit time and delta per edge, rather than a signed time. Signing the
  // time cannot tell the start of a note at 0 from the end of one at 0.
  const edges = notes.flatMap((note) => [
    { time: note.start, delta: 1 },
    { time: note.end, delta: -1 },
  ]);

  // Ends sort before starts at the same instant, so a note beginning exactly as
  // another finishes counts as one voice rather than two. That is the cautious
  // direction: it can only make the preview quieter, never louder.
  edges.sort((left, right) => left.time - right.time || left.delta - right.delta);

  let open = 0;
  let most = 0;
  for (const edge of edges) {
    open += edge.delta;
    most = Math.max(most, open);
  }
  return most;
}

/** The notes still to come from a given position, with times relative to it. */
export function notesFrom(notes: MidiNote[], fromSeconds: number): MidiNote[] {
  return notes
    .filter((note) => note.end > fromSeconds)
    .map((note) => ({ ...note, start: Math.max(0, note.start - fromSeconds), end: note.end - fromSeconds }));
}
